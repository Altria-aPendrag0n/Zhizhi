/**
 * 学习计划解析器（纯逻辑，无 Vue / IO 依赖）
 *
 * 计划文件位于 `<vault>/plans/<plan-id>.md`：frontmatter 为权威结构化数据，
 * 正文为 AI 生成的可读计划（机器不解析）。设计约定见 docs/todo/学习计划Agent开发方案.md。
 *
 * 排期语义（顺序推进 + 动态顺延）：
 * - 今日任务 = active 计划的未完成任务按文件顺序排队，从队首按 estimate 累积填充至 daily_minutes；
 * - 队首任务无论多大都保留（避免「单个大任务 > 容量」导致今日任务永远为空）；
 * - 勾选完成后释放容量，下次计算自动补位，无需额外状态。
 */
import * as yaml from 'js-yaml'
import type { PlanDoc, PlanPhase, PlanStatus, PlanTask } from '../types'

/** frontmatter 块：开头 --- 与结尾 --- 之间为 YAML，其后为正文（可无正文） */
const FRONTMATTER_REGEX = /^---\s*\n([\s\S]*?)\n---\s*(?:\n([\s\S]*))?$/

/** 默认每日容量（分钟）：frontmatter 缺失/非法时的容错值 */
export const DEFAULT_DAILY_MINUTES = 60
/** 默认任务预估时长（分钟）：任务缺 estimate 时的容错值 */
export const DEFAULT_TASK_ESTIMATE = 30

/** frontmatter 已知键，其余进入 extra 并在序列化时原样写回 */
const KNOWN_KEYS = new Set([
  'kind',
  'plan',
  'title',
  'goal',
  'status',
  'created',
  'daily_minutes',
  'phases',
  'tasks',
])

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function normalizeStatus(value: unknown): PlanStatus {
  return value === 'paused' || value === 'archived' ? value : 'active'
}

function normalizePhases(value: unknown): PlanPhase[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item, index) => ({
      id: asString(item.id, `p${index + 1}`),
      title: asString(item.title, `阶段 ${index + 1}`),
      ...(typeof item.objective === 'string' ? { objective: item.objective } : {}),
    }))
}

function normalizeTasks(value: unknown): PlanTask[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item, index) => ({
      id: asString(item.id, `t${index + 1}`),
      phase: asString(item.phase, ''),
      title: asString(item.title, `任务 ${index + 1}`),
      ...(typeof item.detail === 'string' ? { detail: item.detail } : {}),
      estimate: typeof item.estimate === 'number' && item.estimate > 0 ? item.estimate : DEFAULT_TASK_ESTIMATE,
      done: item.done === true,
      done_at: typeof item.done_at === 'string' ? item.done_at : null,
      sessions: Array.isArray(item.sessions) ? item.sessions.filter((s): s is string => typeof s === 'string') : [],
    }))
}

/** 从文件路径提取计划 id（plans/<id>.md → <id>），无路径时回退 'plan' */
function planIdFromPath(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? ''
  return base.replace(/\.md$/i, '') || 'plan'
}

/**
 * 解析计划文件原文。缺 frontmatter / YAML 非法时抛错；
 * 字段缺失或类型不符时按容错默认值补齐，不抛错（用户手改文件不应导致应用崩溃）。
 */
export function parsePlanFile(raw: string, path = ''): PlanDoc {
  const match = raw.match(FRONTMATTER_REGEX)
  if (!match) {
    throw new Error('计划文件格式错误: 缺少 frontmatter 块')
  }
  let meta: Record<string, unknown>
  try {
    meta = yaml.load(match[1]) as Record<string, unknown>
  } catch {
    throw new Error('计划文件格式错误: frontmatter 解析失败')
  }
  if (typeof meta !== 'object' || meta === null) {
    throw new Error('计划文件格式错误: frontmatter 为空')
  }

  const extra: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(meta)) {
    if (!KNOWN_KEYS.has(key)) extra[key] = value
  }

  return {
    path,
    kind: 'plan',
    plan: asString(meta.plan, planIdFromPath(path)),
    title: asString(meta.title, '未命名计划'),
    goal: asString(meta.goal, ''),
    status: normalizeStatus(meta.status),
    created: asString(meta.created, ''),
    daily_minutes:
      typeof meta.daily_minutes === 'number' && meta.daily_minutes > 0 ? meta.daily_minutes : DEFAULT_DAILY_MINUTES,
    phases: normalizePhases(meta.phases),
    tasks: normalizeTasks(meta.tasks),
    body: (match[2] ?? '').trim(),
    ...(Object.keys(extra).length > 0 ? { extra } : {}),
  }
}

/** 序列化为计划文件原文（frontmatter + 空行 + 正文），未知字段原样写回 */
export function serializePlanFile(doc: PlanDoc): string {
  const meta: Record<string, unknown> = {
    kind: doc.kind,
    plan: doc.plan,
    title: doc.title,
    goal: doc.goal,
    status: doc.status,
    created: doc.created,
    daily_minutes: doc.daily_minutes,
    phases: doc.phases,
    tasks: doc.tasks,
    ...(doc.extra ?? {}),
  }
  const frontmatter = yaml.dump(meta, { lineWidth: -1 })
  const body = doc.body.trim()
  return `---\n${frontmatter}---\n\n${body}${body ? '\n' : ''}`
}

/**
 * 今日任务（顺序推进 + 动态顺延）：
 * active 计划的未完成任务按文件顺序排队，从队首按 estimate 累积填充至 daily_minutes；
 * 队首任务始终入选；paused/archived 或无未完成任务返回空数组。
 */
export function computeTodayTasks(doc: PlanDoc): PlanTask[] {
  if (doc.status !== 'active') return []
  const selected: PlanTask[] = []
  let used = 0
  for (const task of doc.tasks) {
    if (task.done) continue
    if (selected.length === 0 || used + task.estimate <= doc.daily_minutes) {
      selected.push(task)
      used += task.estimate
    } else {
      break
    }
  }
  return selected
}

/**
 * 阶段预计完成日：阶段剩余任务总时长 ÷ daily_minutes，自 now 起顺推。
 * 阶段无剩余任务（已完成）返回 null；daily_minutes 非法时返回 null（无法推算）。
 */
export function estimatePhaseCompletion(doc: PlanDoc, phaseId: string, now: Date = new Date()): Date | null {
  const remaining = doc.tasks
    .filter((task) => task.phase === phaseId && !task.done)
    .reduce((sum, task) => sum + Math.max(0, task.estimate), 0)
  if (remaining <= 0 || doc.daily_minutes <= 0) return null
  const days = Math.ceil(remaining / doc.daily_minutes)
  const date = new Date(now.getTime())
  date.setDate(date.getDate() + days)
  return date
}
