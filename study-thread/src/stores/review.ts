import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ReviewRating, ReviewTask } from '../types'
import { createDir, readFile, writeFile } from '../utils/vault-fs'
import { buildDueList, countDue, reactivateTask, applyRatingWithAlgorithm, createReviewTask } from '../utils/review-scheduler'
import { loadLearnerProfile } from '../utils/learner-profile'
import { linkConceptsToNotes, collectWeakNotePaths } from '../utils/learner-note-link'
import { useNoteStore } from './notes'
import { useSettingsStore } from './settings'

/** 复习队列持久化路径：<vault>/.study-thread/review-state.json（DEVELOPMENT.md 已规划） */
function reviewStatePath(vaultPath: string): string {
  return `${vaultPath}/.study-thread/review-state.json`
}

/**
 * 笔记路径规范化键：统一分隔符 + 小写。
 * 同一笔记可能以正/反斜杠两种形式出现（AI 摘录保存 vs listDir 扫描），
 * 复习队列幂等查重必须以规范化键比较，否则同一笔记会重复入队。
 */
function notePathKey(path: string): string {
  return path.replace(/\\/g, '/').toLowerCase()
}

interface ReviewStateFile {
  version: number
  queue: ReviewTask[]
}

export const useReviewStore = defineStore('review', () => {
  const queue = ref<ReviewTask[]>([])
  const isLoading = ref(false)
  const currentVaultPath = ref<string | null>(null)

  /** 画像 low/medium 置信度概念对应笔记路径（复习提权信号，P3-3） */
  const boostedNotePaths = ref<string[]>([])

  /** 到期任务（按优先级排序；画像弱项笔记提权） */
  const dueTasks = computed(() =>
    buildDueList(queue.value, new Date(), new Set(boostedNotePaths.value)),
  )
  /** 到期任务数量（学习地图徽标） */
  const dueCount = computed(() => countDue(queue.value))
  /** 已毕业任务（P1 增强）：移出到期清单，保留在队列，可手动重新激活 */
  const graduatedTasks = computed(() => queue.value.filter((item) => item.graduated))

  function persist(): Promise<void> {
    const vaultPath = currentVaultPath.value
    if (!vaultPath) return Promise.resolve()
    const payload: ReviewStateFile = { version: 1, queue: queue.value }
    return createDir(`${vaultPath}/.study-thread`)
      .then(() => writeFile(reviewStatePath(vaultPath), JSON.stringify(payload, null, 2)))
      .catch((error) => {
        console.error('保存复习状态失败:', error)
      })
  }

  /** 加载复习队列；文件缺失或损坏时置空列表；按规范化路径去重历史重复条目 */
  async function loadQueue(vaultPath: string): Promise<void> {
    isLoading.value = true
    currentVaultPath.value = vaultPath
    try {
      const content = await readFile(reviewStatePath(vaultPath))
      const parsed = JSON.parse(content) as ReviewStateFile
      const loaded = Array.isArray(parsed.queue) ? parsed.queue : []
      // 去重：同一笔记（正/反斜杠差异）只保留先入队条目，修复历史重复并落盘
      const seen = new Set<string>()
      const deduped: ReviewTask[] = []
      for (const item of loaded) {
        const key = notePathKey(item.notePath)
        if (seen.has(key)) continue
        seen.add(key)
        deduped.push(item)
      }
      queue.value = deduped
      if (deduped.length !== loaded.length) await persist()
    } catch {
      queue.value = []
    } finally {
      isLoading.value = false
    }
    // 画像弱项提权信号（失败不影响队列本身，静默置空）
    await refreshBoostedPaths(vaultPath)
  }

  /**
   * 加载画像 → 计算概念→笔记映射 → 提取 low/medium 置信度概念对应笔记路径（P3-3 提权信号）。
   * 任何一步失败（无画像 / 引擎未就绪 / 笔记未加载）都静默置空，复习行为保持不变。
   */
  async function refreshBoostedPaths(vaultPath: string): Promise<void> {
    try {
      const profile = await loadLearnerProfile(vaultPath)
      const map = await linkConceptsToNotes(profile, useNoteStore().notes)
      boostedNotePaths.value = [...collectWeakNotePaths(profile, map)]
    } catch {
      boostedNotePaths.value = []
    }
  }

  /** 新笔记入队（幂等：已存在的笔记路径跳过，正/反斜杠视为同一路径） */
  async function enqueue(task: ReviewTask): Promise<void> {
    const key = notePathKey(task.notePath)
    if (queue.value.some((item) => notePathKey(item.notePath) === key)) return
    queue.value.push(task)
    await persist()
  }

  /** syncQueueWithNotes 进行中标记：并发调用复用同一 Promise，避免双写产生重复补录 */
  let syncInFlight: Promise<void> | null = null

  /**
   * 补录存量笔记到复习队列（P5 修复）：
   *
   * 复习入队原本只发生在 AI 摘录生成新笔记时（saveNote），vault 中已存在
   * 的存量笔记永远不会进入复习队列，导致复习界面长期为空。本方法在加载队列后，
   * 把 notes 目录中不在队列里的笔记幂等补录为复习任务（当天到期），单次持久化。
   *
   * 幂等：重复调用不会产生重复任务（规范化路径查重 + 并发串行化）；
   * 失败（如笔记目录读取失败）静默保持原队列。
   */
  async function syncQueueWithNotes(vaultPath: string): Promise<void> {
    if (syncInFlight) return syncInFlight
    syncInFlight = doSyncQueueWithNotes(vaultPath).finally(() => {
      syncInFlight = null
    })
    return syncInFlight
  }

  async function doSyncQueueWithNotes(vaultPath: string): Promise<void> {
    await loadQueue(vaultPath)
    const noteStore = useNoteStore()
    if (noteStore.notes.length === 0) await noteStore.loadAllNotes(vaultPath)
    const queued = new Set(queue.value.map((task) => notePathKey(task.notePath)))
    const missing = noteStore.notes.filter((note) => !queued.has(notePathKey(note.path)))
    if (missing.length === 0) return
    const now = new Date()
    for (const note of missing) {
      queue.value.push(createReviewTask(note.path, note.title, note.type, now))
    }
    await persist()
  }

  /** 复习评级：按所选间隔算法（classic/fsrs）推进间隔与掌握度并回写队列（P1 增强） */
  async function applyReview(notePath: string, rating: ReviewRating, now: Date = new Date()): Promise<ReviewTask | null> {
    const index = queue.value.findIndex((item) => item.notePath === notePath)
    if (index < 0) return null
    const algorithm = useSettingsStore().reviewAlgorithm
    queue.value[index] = applyRatingWithAlgorithm(queue.value[index], rating, now, algorithm)
    await persist()
    return queue.value[index]
  }

  /** 从队列移除（删除笔记时级联清理） */
  async function removeFromQueue(notePath: string): Promise<void> {
    const before = queue.value.length
    queue.value = queue.value.filter((item) => item.notePath !== notePath)
    if (queue.value.length !== before) await persist()
  }

  /** 重新激活已毕业任务（P1 增强）：清除毕业标记并立即到期，回到到期清单 */
  async function reactivate(notePath: string): Promise<ReviewTask | null> {
    const index = queue.value.findIndex((item) => item.notePath === notePath)
    if (index < 0) return null
    queue.value[index] = reactivateTask(queue.value[index])
    await persist()
    return queue.value[index]
  }

  return {
    queue,
    isLoading,
    currentVaultPath,
    boostedNotePaths,
    dueTasks,
    dueCount,
    graduatedTasks,
    loadQueue,
    refreshBoostedPaths,
    enqueue,
    syncQueueWithNotes,
    applyReview,
    removeFromQueue,
    reactivate,
  }
})
