/**
 * 复习难度信号模块（P5 出题形式规划 §5.2）
 *
 * 将卡片实时掌握度（mastery）与两种复习曲线信号（classic 间隔档位 / fsrs 表现分·波动）
 * 转换为注入出题 prompt 的难度依据文本。纯逻辑，无 Vue 依赖。
 *
 * 优先级：mastery 定档（最高）；曲线信号仅微调题单结构（classic 间隔久 → 补识别题；
 * fsrs 波动大 → 补低难度稳定题）；画像 confidence 由调用方另行注入，冲突时取保守档。
 */

import type { Note, ReviewAlgorithm, ReviewTask } from '../types'
import { getIntervals } from './review-scheduler'
import { estimateDifficulty, estimatePerformance } from './fsrs-scheduler'

/** 掌握度档位：low < 0.3 ≤ medium < 0.6 ≤ high < 0.9 ≤ graduate */
export type DifficultyBand = 'low' | 'medium' | 'high' | 'graduate'

/** 笔记内容难度档位（由正文长度 + 笔记类型启发式估计，与掌握度档位解耦） */
export type NoteDifficultyBand = 'low' | 'medium' | 'high'

/** 正文长度达到该值即视为中等难度 */
export const NOTE_DIFFICULTY_MEDIUM_CHARS = 400
/** 正文长度达到该值即视为较高难度 */
export const NOTE_DIFFICULTY_HIGH_CHARS = 1500

const NOTE_DIFFICULTY_LABELS: Record<NoteDifficultyBand, string> = {
  low: '简单',
  medium: '中等',
  high: '较难',
}

/**
 * 由正文长度估计笔记内容难度档位：正文越长覆盖的知识点越多，复习出题越难。
 * method/question 类笔记偏推理，等效长度按 1.5 倍加权后再定档，避免长篇浅层 fact 被高估。
 */
export function noteDifficultyBandFromLength(length: number): NoteDifficultyBand {
  if (length >= NOTE_DIFFICULTY_HIGH_CHARS) return 'high'
  if (length >= NOTE_DIFFICULTY_MEDIUM_CHARS) return 'medium'
  return 'low'
}

/** 估计单条笔记的内容难度（正文长度 + 类型加权） */
export function estimateNoteDifficulty(note: Pick<Note, 'content' | 'type'>): NoteDifficultyBand {
  const length = note.content.length
  const weighted = note.type === 'method' || note.type === 'question' ? Math.round(length * 1.5) : length
  return noteDifficultyBandFromLength(weighted)
}

export const MASTERY_LOW_THRESHOLD = 0.3
export const MASTERY_MEDIUM_THRESHOLD = 0.6
export const MASTERY_HIGH_THRESHOLD = 0.9

export function difficultyBandFromMastery(mastery: number): DifficultyBand {
  if (mastery >= MASTERY_HIGH_THRESHOLD) return 'graduate'
  if (mastery >= MASTERY_MEDIUM_THRESHOLD) return 'high'
  if (mastery >= MASTERY_LOW_THRESHOLD) return 'medium'
  return 'low'
}

const BAND_LABELS: Record<DifficultyBand, string> = {
  low: '低档位',
  medium: '中档位',
  high: '高档位',
  graduate: '毕业候选',
}

/** 定位当前 interval 在类型间隔序列中的档位（1 起）：精确命中优先，否则取第一个不小于的档位，均无则末位 */
function intervalIndexIn(task: ReviewTask): number {
  const intervals = getIntervals(task.type)
  let index = intervals.indexOf(task.interval)
  if (index < 0) index = intervals.findIndex((i) => i >= task.interval)
  if (index < 0) index = intervals.length - 1
  return index
}

/**
 * 生成注入出题 prompt 的难度依据文本。
 *
 * - classic：卡片掌握度 + 当前间隔在类型序列中的档位；间隔位于序列后半段时建议补识别题校验遗忘；
 * - fsrs：卡片掌握度 + 近 6 次加权表现分 + 评级波动；波动大时建议补低难度题稳定信心；
 * - 均输出「档位」结论，供出题规则直接定难度；无队列记录时应由调用方不调用本函数（走默认难度）。
 */
export function describeDifficultyContext(
  task: ReviewTask,
  algorithm: ReviewAlgorithm,
  noteDifficulty?: NoteDifficultyBand,
): string {
  const mastery = task.mastery
  const band = difficultyBandFromMastery(mastery)
  const noteText = noteDifficulty ? `笔记内容难度 ${NOTE_DIFFICULTY_LABELS[noteDifficulty]}；` : ''
  const masteryText = `卡片掌握度 ${Math.round(mastery * 100)}%（${BAND_LABELS[band]}）`

  if (algorithm === 'fsrs') {
    const performance = estimatePerformance(task.history)
    const volatility = estimateDifficulty(task.history)
    return (
      `${noteText}${masteryText}；近 ${Math.min(task.history.length, 6)} 次评级加权表现分 ${performance.toFixed(1)}（0-1.5），` +
      `评级波动 ${volatility.toFixed(2)}。` +
      `表现分高可上探更难题型；波动大（成绩忽高忽低）建议补 1 道低难度题稳定信心，反馈侧重巩固薄弱环节。`
    )
  }

  const intervals = getIntervals(task.type)
  const index = intervalIndexIn(task)
  const tailHalf = index + 1 > intervals.length / 2
  const intervalText = `当前间隔 ${task.interval} 天（${task.type} 类型序列 [${intervals.join(',')}] 第 ${index + 1} 档，共 ${intervals.length} 档）`
  return (
    `${noteText}${masteryText}；${intervalText}。` +
    (tailHalf
      ? `间隔位于序列后半段，距上次复习较久，建议题单首题放 1 道识别题（选择题/判对错）校验记忆是否衰减。`
      : `间隔尚短，记忆较新鲜，可直接按档位出题。`)
  )
}
