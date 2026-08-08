import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ReviewRating, ReviewTask } from '../types'
import { createDir, readFile, writeFile } from '../utils/vault-fs'
import { applyRating, buildDueList, countDue } from '../utils/review-scheduler'

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

  /** 到期任务（按优先级排序） */
  const dueTasks = computed(() => buildDueList(queue.value))
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
    dueTasks,
    dueCount,
    loadQueue,
    enqueue,
    applyReview,
    removeFromQueue,
  }
})
