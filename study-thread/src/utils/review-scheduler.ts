/**
 * 间隔复习调度器（纯逻辑，无 Vue 依赖）
 *
 * 借鉴 DeepTutor `learning/scheduler.py` 的思路（按知识类型差异化间隔序列、评级驱动推进）
 * 与 Anki 的四档评级（again/hard/good/easy），为知枝提供"何时复习"的本地调度基础。
 * 权威数据存于 `<vault>/.study-thread/review-state.json`（见 `stores/review.ts`）。
 */
import type { ReviewRating, ReviewTask } from '../types'

/** 按笔记类型差异化间隔序列（单位：天），顺序即推进方向 */
export const REVIEW_INTERVALS: Record<string, number[]> = {
  concept: [1, 3, 7, 14, 30, 60],
  method: [1, 3, 7, 14, 30],
  fact: [2, 5, 10, 20],
  question: [1, 2, 5, 10],
}

/** 未知类型笔记的兜底间隔序列 */
export const DEFAULT_INTERVALS = [1, 3, 7, 14, 30, 60]

/** 评级 → 间隔下标位移 与 掌握度增量 */
const RATING_DELTAS: Record<ReviewRating, { step: number; masteryDelta: number }> = {
  again: { step: -2, masteryDelta: -0.2 },
  hard: { step: 0, masteryDelta: 0 },
  good: { step: 1, masteryDelta: 0.2 },
  easy: { step: 2, masteryDelta: 0.4 },
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date.getTime())
  d.setDate(d.getDate() + days)
  return d
}

function toIso(date: Date): string {
  return date.toISOString()
}

export function getIntervals(type: string): number[] {
  return REVIEW_INTERVALS[type] ?? DEFAULT_INTERVALS
}

/**
 * 新建笔记入队：间隔 0、次日到期（"新笔记即入队，明天开始复习"）。
 */
export function createReviewTask(notePath: string, title: string, type: string, now: Date = new Date()): ReviewTask {
  return {
    notePath,
    title,
    type,
    dueAt: toIso(addDays(now, 1)),
    interval: 0,
    mastery: 0,
    history: [],
  }
}

/**
 * 复习评级 → 推进间隔与掌握度。
 * - 评级映射间隔序列下标位移（again 回退两档、easy 前进两档），夹在序列边界内；
 * - 掌握度按评级增减并夹在 [0, 1]。
 */
export function applyRating(task: ReviewTask, rating: ReviewRating, now: Date = new Date()): ReviewTask {
  const { step, masteryDelta } = RATING_DELTAS[rating]
  const intervals = getIntervals(task.type)
  const maxIndex = intervals.length - 1

  // 当前间隔在序列中的位置：精确命中优先，否则定位到第一个不小于当前间隔的档位
  let index = intervals.indexOf(task.interval)
  if (index < 0) index = intervals.findIndex((i) => i >= task.interval)
  if (index < 0) index = maxIndex
  index = Math.max(0, Math.min(maxIndex, index + step))

  const interval = intervals[index]
  return {
    ...task,
    interval,
    mastery: clamp01(task.mastery + masteryDelta),
    dueAt: toIso(addDays(now, interval)),
    history: [...task.history, { at: toIso(now), rating }],
  }
}

/**
 * 任务优先级（越小越优先）：
 * - 低掌握度（< 0.3）最高；
 * - 上次复习答错（again）或掌握度低于 0.6 次之；
 * - 其余按类型偏好（concept 优先于 fact 等，即"理解类优先于记忆类"）。
 */
export function priorityOf(task: ReviewTask): number {
  if (task.mastery < 0.3) return 0
  const last = task.history[task.history.length - 1]
  if (task.mastery < 0.6 || (last && last.rating === 'again')) return 1
  const typePriority: Record<string, number> = { concept: 2, method: 3, question: 4, fact: 5 }
  return typePriority[task.type] ?? 4
}

/**
 * 画像提权后的优先级（P3-3：低掌握度概念复习提权）：
 * 关联到画像 low/medium 置信度概念的笔记优先级提升一档（更优先，且不低于 0）。
 * boostedPaths 为提权笔记路径集合；null/空集合时行为与 priorityOf 完全一致。
 */
export function priorityWithProfile(
  task: ReviewTask,
  boostedPaths: ReadonlySet<string> | null | undefined,
): number {
  const base = priorityOf(task)
  if (!boostedPaths || !boostedPaths.has(task.notePath)) return base
  return Math.max(0, base - 1)
}

/**
 * 到期任务列表：dueAt 已到者，按优先级升序（同优先级按到期时间先后）。
 * boostedPaths（可选）：画像 low/medium 概念关联笔记的提权信号（P3-3），
 * 缺省时不提权，保持原调度行为。
 */
export function buildDueList(
  tasks: ReviewTask[],
  now: Date = new Date(),
  boostedPaths?: ReadonlySet<string>,
): ReviewTask[] {
  const nowMs = now.getTime()
  return tasks
    .filter((task) => new Date(task.dueAt).getTime() <= nowMs)
    .sort(
      (a, b) =>
        priorityWithProfile(a, boostedPaths) - priorityWithProfile(b, boostedPaths) ||
        a.dueAt.localeCompare(b.dueAt),
    )
}

/** 到期任务数量（学习地图徽标用） */
export function countDue(tasks: ReviewTask[], now: Date = new Date()): number {
  return buildDueList(tasks, now).length
}
