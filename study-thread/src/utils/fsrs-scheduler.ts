/**
 * FSRS 风格轻量调度（P1 增强）
 *
 * 基于 `ReviewTask.history`（每次评级时间与结果）拟合个性化遗忘曲线参数，
 * 动态计算下一次间隔；历史数据不足时返回 null，由调用方回退经典类型化间隔序列（冷启动）。
 *
 * 模型（可解释、可测）：
 * - 表现分：again=0 / hard=0.5 / good=1 / easy=1.5，近 N 次加权平均（越新权重越高）；
 * - 稳定性 S（天）：由类型基础间隔（经典序列最大值）与表现分共同决定；
 * - 难度 D：评级波动（标准差）越大，稳定性压缩越多；
 * - 遗忘冲击：最近一次或本次评级为 again → 间隔减半；
 * - 间隔夹在 [FSRS_MIN_INTERVAL, FSRS_MAX_INTERVAL]。
 */

import type { ReviewHistoryEntry, ReviewRating, ReviewTask } from '../types'

const PERFORMANCE_SCORE: Record<ReviewRating, number> = {
  again: 0,
  hard: 0.5,
  good: 1,
  easy: 1.5,
}

/** 参与参数拟合的最近评级条数 */
export const FSRS_HISTORY_WINDOW = 6
/** 冷启动阈值：历史评级不足该次数时回退经典间隔 */
export const FSRS_MIN_HISTORY = 2
/** 间隔上限（天），防止无限拉长 */
export const FSRS_MAX_INTERVAL = 365
/** 间隔下限（天） */
export const FSRS_MIN_INTERVAL = 1

/**
 * 近 N 次评级的加权表现分（越近权重越高），无历史返回 0。
 * 表现分 ∈ [0, 1.5]，越高表示近期掌握越好。
 */
export function estimatePerformance(history: ReviewHistoryEntry[], windowSize = FSRS_HISTORY_WINDOW): number {
  const recent = history.slice(-Math.max(1, windowSize))
  if (recent.length === 0) return 0
  let weighted = 0
  let totalWeight = 0
  recent.forEach((entry, index) => {
    const weight = index + 1 // 越新权重越高
    weighted += PERFORMANCE_SCORE[entry.rating] * weight
    totalWeight += weight
  })
  return weighted / totalWeight
}

/**
 * 评级序列的标准差（衡量波动 → 难度），少于 2 条返回 0。
 * 波动越大（成绩忽高忽低）说明掌握不稳定，难度越高。
 */
export function estimateDifficulty(history: ReviewHistoryEntry[]): number {
  if (history.length < 2) return 0
  const scores = history.map((entry) => PERFORMANCE_SCORE[entry.rating])
  const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length
  const variance = scores.reduce((acc, score) => acc + (score - mean) ** 2, 0) / scores.length
  return Math.sqrt(variance)
}

/**
 * 计算 FSRS 个性化间隔（天）。
 *
 * @param task - 复习任务（history 为拟合数据）
 * @param currentRating - 本次评级（影响遗忘冲击）
 * @param baseInterval - 类型基础间隔（经典序列最大值，由调用方计算传入，避免循环依赖）
 * @returns 间隔天数；历史数据不足（冷启动）返回 null，调用方应回退经典调度
 */
export function computeFsrsInterval(task: ReviewTask, currentRating: ReviewRating, baseInterval: number): number | null {
  if (task.history.length < FSRS_MIN_HISTORY) return null
  const perf = estimatePerformance(task.history)
  const difficulty = estimateDifficulty(task.history)
  const stability = baseInterval * (0.5 + perf)
  let interval = stability * (1 - 0.4 * difficulty)
  const last = task.history[task.history.length - 1]
  if (last && last.rating === 'again') interval *= 0.5
  if (currentRating === 'again') interval *= 0.5
  return Math.max(FSRS_MIN_INTERVAL, Math.min(FSRS_MAX_INTERVAL, Math.round(interval)))
}
