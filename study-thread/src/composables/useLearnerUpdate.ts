/**
 * 学习者画像更新编排（P3 画像驱动复习）
 *
 * 在会话一次回答结束后触发画像更新建议：
 * - 每会话最多触发一次（防重复消耗 LLM）；
 * - 需要至少一轮问答（消息数 ≥ 3）才有分析价值；
 * - 生成的 diff 经用户确认后应用并写入 learner.md。
 */

import { ref } from 'vue'
import type { Session, Note } from '../types'
import type { LLMProvider } from '../api/llm-provider'
import { generateProfileUpdate, type ProfileDiff } from '../api/skills/update-learner'
import {
  loadLearnerProfile,
  saveLearnerProfile,
  applyProfileDiff,
  serializeLearnerProfile,
} from '../utils/learner-profile'
import { summarizeReviewPerformance } from '../utils/review-scheduler'
import { useReviewStore } from '../stores/review'

/** 已触发过画像更新的会话 id（每会话一次） */
const updatedSessionIds = new Set<string>()

/** 会话至少包含一轮问答才触发（首条 assistant 引导 + 用户 + 回答） */
const MIN_MESSAGES_FOR_UPDATE = 3

export function useLearnerUpdate() {
  const diff = ref<ProfileDiff | null>(null)
  const loading = ref(false)
  const visible = ref(false)
  let currentVaultPath = ''
  let currentTotalNotes = 0

  /**
   * 触发画像更新（非阻塞，失败静默关闭）
   *
   * @param session - 完整会话（含消息）
   * @param newNotes - 本次会话生成的笔记
   * @param provider - LLM 提供商
   * @param vaultPath - vault 根目录
   * @param totalNotes - 当前笔记总数（用于画像 total_notes）
   */
  async function trigger(
    session: Session,
    newNotes: Note[],
    provider: LLMProvider,
    vaultPath: string,
    totalNotes: number,
  ): Promise<void> {
    if (!vaultPath || updatedSessionIds.has(session.id) || session.messages.length < MIN_MESSAGES_FOR_UPDATE) return
    updatedSessionIds.add(session.id)
    currentVaultPath = vaultPath
    currentTotalNotes = totalNotes

    loading.value = true
    visible.value = true
    try {
      const existing = await loadLearnerProfile(vaultPath)
      const existingText = existing.known_concepts.length > 0 ? serializeLearnerProfile(existing) : ''
      // P3-5：本次会话生成笔记的复习表现（评级分布 + 掌握度），供 confidence 升降档参考
      const reviewPerformance = summarizeReviewPerformance(
        useReviewStore().queue,
        newNotes.map((note) => note.path),
      )
      diff.value = await generateProfileUpdate(session, existingText, newNotes, provider, reviewPerformance)
    } catch {
      // 生成失败静默关闭（不打断学习流程）
      diff.value = null
      visible.value = false
    } finally {
      loading.value = false
    }
  }

  /** 用户确认：应用 diff 并写入 learner.md */
  async function confirm(confirmed: ProfileDiff): Promise<boolean> {
    if (!currentVaultPath) return false
    try {
      const profile = await loadLearnerProfile(currentVaultPath)
      await saveLearnerProfile(currentVaultPath, applyProfileDiff(profile, confirmed, currentTotalNotes))
      visible.value = false
      diff.value = null
      return true
    } catch {
      return false
    }
  }

  /** 用户取消：丢弃本次建议 */
  function cancel(): void {
    visible.value = false
    diff.value = null
  }

  return { diff, loading, visible, trigger, confirm, cancel }
}
