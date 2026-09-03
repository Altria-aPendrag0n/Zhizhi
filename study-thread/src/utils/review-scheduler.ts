/**
 * 间隔复习调度器（纯逻辑，无 Vue 依赖）
 *
 * 借鉴 DeepTutor `learning/scheduler.py` 的思路（按知识类型差异化间隔序列、评级驱动推进）
 * 与 Anki 的四档评级（again/hard/good/easy），为知枝提供"何时复习"的本地调度基础。
 * 权威数据存于 `<vault>/.study-thread/review-state.json`（见 `stores/review.ts`）。
 */
import type { ReviewAlgorithm, ReviewRating, ReviewTask } from '../types'
import { computeFsrsInterval } from './fsrs-scheduler'

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

/** 毕业掌握度阈值（P1 增强）：掌握度 ≥ 0.9 且连续 good/easy 达到次数即毕业 */
export const GRADUATION_MASTERY_THRESHOLD = 0.9
/** 毕业所需的最近连续 good/easy 次数 */
export const GRADUATION_CONSECUTIVE_GOOD = 2

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
 * 新建笔记入队：间隔 0、当天到期（"新笔记即入队，当天即可开始复习"）。
 */
export function createReviewTask(notePath: string, title: string, type: string, now: Date = new Date()): ReviewTask {
  return {
    notePath,
    title,
    type,
    dueAt: toIso(now),
    interval: 0,
    mastery: 0,
    history: [],
  }
}

/**
 * 复习评级 → 推进间隔与掌握度。
 * - 评级映射间隔序列下标位移（again 回退两档、easy 前进两档），夹在序列边界内；
 * - 掌握度按评级增减并夹在 [0, 1]；
 * - 毕业（P1 增强）：good/easy 且掌握度 ≥ 阈值且最近连续 good/easy 达标 → 标记 graduated；
 *   again/hard 清除毕业标记（回到活跃队列）。
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
  const mastery = clamp01(task.mastery + masteryDelta)
  const history = [...task.history, { at: toIso(now), rating }]

  // 毕业标记：仅在积极评级时评估（again/hard 直接清除毕业回到活跃）
  let graduated: boolean | undefined
  if (rating === 'again' || rating === 'hard') {
    graduated = false
  } else {
    graduated = isGraduationCandidate({ ...task, interval, mastery, history, graduated: undefined })
  }

  return {
    ...task,
    interval,
    mastery,
    dueAt: toIso(addDays(now, interval)),
    history,
    ...(graduated ? { graduated: true } : graduated === false ? { graduated: false } : {}),
  }
}

/**
 * 毕业判定（P1 增强）：
 * 掌握度 ≥ GRADUATION_MASTERY_THRESHOLD，且最近 GRADUATION_CONSECUTIVE_GOOD 次评级均为 good/easy。
 * 纯函数，供调度器评级后自动标记与测试校验。
 */
export function isGraduationCandidate(task: ReviewTask): boolean {
  if (task.mastery < GRADUATION_MASTERY_THRESHOLD) return false
  const recent = task.history.slice(-GRADUATION_CONSECUTIVE_GOOD)
  if (recent.length < GRADUATION_CONSECUTIVE_GOOD) return false
  return recent.every((entry) => entry.rating === 'good' || entry.rating === 'easy')
}

/**
 * 按所选算法应用评级（P1 增强 FSRS 演进）：
 * - classic（默认）：走经典类型化间隔序列（applyRating）；
 * - fsrs：基于 history 拟合个性化遗忘曲线计算间隔；历史数据不足（冷启动）时回退经典调度。
 * 掌握度/评级历史/dueAt 更新与 applyRating 一致，仅间隔计算方式不同。
 */
export function applyRatingWithAlgorithm(
  task: ReviewTask,
  rating: ReviewRating,
  now: Date = new Date(),
  algorithm: ReviewAlgorithm = 'classic',
): ReviewTask {
  if (algorithm === 'fsrs') {
    const intervals = getIntervals(task.type)
    const base = intervals[intervals.length - 1]
    const fsrsInterval = computeFsrsInterval(task, rating, base)
    if (fsrsInterval !== null) {
      const { masteryDelta } = RATING_DELTAS[rating]
      const mastery = clamp01(task.mastery + masteryDelta)
      const history = [...task.history, { at: toIso(now), rating }]
      let graduated: boolean | undefined
      if (rating === 'again' || rating === 'hard') {
        graduated = false
      } else {
        graduated = isGraduationCandidate({ ...task, interval: fsrsInterval, mastery, history, graduated: undefined })
      }
      return {
        ...task,
        interval: fsrsInterval,
        mastery,
        dueAt: toIso(addDays(now, fsrsInterval)),
        history,
        ...(graduated ? { graduated: true } : graduated === false ? { graduated: false } : {}),
      }
    }
  }
  return applyRating(task, rating, now)
}

/**
 * 重新激活已毕业任务（P1 增强）：
 * 清除毕业标记并立即到期（dueAt = now），使其重新出现在到期清单。
 */
export function reactivateTask(task: ReviewTask, now: Date = new Date()): ReviewTask {
  return { ...task, graduated: false, dueAt: toIso(now) }
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
 * 已毕业任务（graduated: true）移出到期清单，保留在队列中可手动重新激活（P1 增强）。
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
    .filter((task) => !task.graduated)
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

// ===================== 复习时间轴（未来一周视图） =====================

/** 时间轴单日卡片数据（见 buildReviewTimeline） */
export interface ReviewTimelineDay {
  /** 本地时区日期键 YYYY-MM-DD（分组键与「今天」判定依据） */
  dateKey: string
  /** 该日 0:00（本地时间） */
  date: Date
  isToday: boolean
  /** 归入该卡的逾期任务数（仅今天可能 > 0） */
  overdueCount: number
  /** 该日到期任务（逾期任务已归入今天并排在最前），dueAt 升序 */
  tasks: ReviewTask[]
}

/** 本地时区日期键 YYYY-MM-DD：用本地年月日拼接，避免 toISOString 的 UTC 偏移导致跨日错位 */
function localDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** 本地时区该日 0:00 */
function startOfLocalDay(date: Date): Date {
  const d = new Date(date.getTime())
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * 未来一周复习时间轴（复习界面展示用，纯函数）：
 * - 只统计未毕业任务（graduated !== true），与 buildDueList 语义一致；
 * - 窗口 = 今天 0:00 起共 days 个自然日（本地时区，含今天）；
 * - dueAt 早于今天 0:00 的逾期任务归入今天卡并置于最前，overdueCount 记录数量；
 * - 每日任务按 dueAt 升序；窗口外（7 天后）的任务忽略；无任务的天 tasks 为空（空卡由 UI 渲染「无」）。
 */
export function buildReviewTimeline(
  tasks: ReviewTask[],
  now: Date = new Date(),
  days = 7,
): ReviewTimelineDay[] {
  const todayStart = startOfLocalDay(now)
  const buckets: ReviewTimelineDay[] = []
  for (let offset = 0; offset < days; offset++) {
    const date = new Date(todayStart.getTime())
    date.setDate(date.getDate() + offset)
    buckets.push({
      dateKey: localDateKey(date),
      date,
      isToday: offset === 0,
      overdueCount: 0,
      tasks: [],
    })
  }
  if (buckets.length === 0) return buckets
  const bucketByKey = new Map(buckets.map((bucket) => [bucket.dateKey, bucket]))

  const overdue: ReviewTask[] = []
  for (const task of tasks) {
    if (task.graduated) continue
    const dueAtMs = new Date(task.dueAt).getTime()
    if (dueAtMs < todayStart.getTime()) {
      overdue.push(task)
      continue
    }
    const bucket = bucketByKey.get(localDateKey(new Date(dueAtMs)))
    if (bucket) bucket.tasks.push(task)
  }

  const byDueAt = (a: ReviewTask, b: ReviewTask) => a.dueAt.localeCompare(b.dueAt)
  for (const bucket of buckets) bucket.tasks.sort(byDueAt)
  overdue.sort(byDueAt)
  buckets[0].overdueCount = overdue.length
  buckets[0].tasks = [...overdue, ...buckets[0].tasks]
  return buckets
}

/**
 * 汇总指定笔记的复习表现文本（P3-5 复习评级回写画像）：
 * 取每篇笔记最近 windowSize 次评级分布与当前掌握度，供 update-learner 作为升降档依据。
 * 无复习记录（history 为空）或路径未命中时忽略该笔记；全部无记录时返回空字符串。
 */
export function summarizeReviewPerformance(
  tasks: ReviewTask[],
  notePaths: string[],
  windowSize = 5,
): string {
  const lines: string[] = []
  for (const path of notePaths) {
    const task = tasks.find((t) => t.notePath === path)
    if (!task || task.history.length === 0) continue
    const recent = task.history.slice(-Math.max(1, windowSize))
    const counts: Record<ReviewRating, number> = { again: 0, hard: 0, good: 0, easy: 0 }
    for (const entry of recent) counts[entry.rating]++
    const distribution = Object.entries(counts)
      .filter(([, count]) => count > 0)
      .map(([rating, count]) => `${rating} × ${count}`)
      .join('、')
    lines.push(
      `- ${task.title}：近 ${recent.length} 次评级（${distribution}），当前掌握度 ${Math.round(task.mastery * 100)}%`,
    )
  }
  if (lines.length === 0) return ''
  return `复习表现（最近 ${windowSize} 次评级分布与掌握度，来自间隔复习系统）：\n${lines.join('\n')}`
}
