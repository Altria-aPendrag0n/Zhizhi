import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ReviewRating, ReviewTask } from '../types'
import { createDir, readFile, writeFile } from '../utils/vault-fs'
import { applyRating, buildDueList, countDue } from '../utils/review-scheduler'
import { loadLearnerProfile } from '../utils/learner-profile'
import { linkConceptsToNotes, collectWeakNotePaths } from '../utils/learner-note-link'
import { useNoteStore } from './notes'

/** 复习队列持久化路径：<vault>/.study-thread/review-state.json（DEVELOPMENT.md 已规划） */
function reviewStatePath(vaultPath: string): string {
  return `${vaultPath}/.study-thread/review-state.json`
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

  /** 加载复习队列；文件缺失或损坏时置空列表 */
  async function loadQueue(vaultPath: string): Promise<void> {
    isLoading.value = true
    currentVaultPath.value = vaultPath
    try {
      const content = await readFile(reviewStatePath(vaultPath))
      const parsed = JSON.parse(content) as ReviewStateFile
      queue.value = Array.isArray(parsed.queue) ? parsed.queue : []
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

  /** 新笔记入队（幂等：已存在的笔记路径跳过） */
  async function enqueue(task: ReviewTask): Promise<void> {
    if (queue.value.some((item) => item.notePath === task.notePath)) return
    queue.value.push(task)
    await persist()
  }

  /** 复习评级：推进间隔与掌握度并回写队列 */
  async function applyReview(notePath: string, rating: ReviewRating, now: Date = new Date()): Promise<ReviewTask | null> {
    const index = queue.value.findIndex((item) => item.notePath === notePath)
    if (index < 0) return null
    queue.value[index] = applyRating(queue.value[index], rating, now)
    await persist()
    return queue.value[index]
  }

  /** 从队列移除（删除笔记时级联清理） */
  async function removeFromQueue(notePath: string): Promise<void> {
    const before = queue.value.length
    queue.value = queue.value.filter((item) => item.notePath !== notePath)
    if (queue.value.length !== before) await persist()
  }

  return {
    queue,
    isLoading,
    currentVaultPath,
    boostedNotePaths,
    dueTasks,
    dueCount,
    loadQueue,
    refreshBoostedPaths,
    enqueue,
    applyReview,
    removeFromQueue,
  }
})
