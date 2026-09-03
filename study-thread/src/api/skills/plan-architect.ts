/**
 * 学习计划规划执行器（plan-architect）
 *
 * 向导对话是多轮的，会话与消息流转由视图层（学习计划视图，T4）驱动；
 * 本模块只负责纯逻辑部分：
 * - buildPlanArchitectPrompt：渲染 SKILL.md 模板（注入今天 / Vault 概况 / 参考资料）
 * - extractPlanDraft：从 AI 回复中提取计划草稿 JSON，校验并归一化为 PlanDoc
 */
import type { PlanDoc } from '../../types'
import { parseSkill, buildPrompt, findUnresolvedPlaceholders } from '../../skills/loader'
import skillRaw from '../../skills/plan-architect/SKILL.md?raw'

/** 缓存解析后的 Skill 对象 */
let _skillCache: ReturnType<typeof parseSkill> | null = null

function getSkill() {
  if (!_skillCache) {
    _skillCache = parseSkill(skillRaw)
  }
  return _skillCache
}

export interface PlanArchitectContext {
  /** 今天的日期描述（如「2026-09-03 星期四」） */
  today: string
  /** Vault 笔记主题概况（标签/类型统计摘要），无笔记时传入空态描述 */
  vaultOverview: string
  /** 参考资料名称摘要，无资料时传入空态描述 */
  references: string
}

/** 渲染向导系统提示；开发环境残留占位符会抛错（与 loader 的变量完整性约定一致） */
export function buildPlanArchitectPrompt(context: PlanArchitectContext): string {
  const prompt = buildPrompt(getSkill(), {
    today: context.today,
    vault_overview: context.vaultOverview,
    references: context.references,
  })
  const unresolved = findUnresolvedPlaceholders(prompt)
  if (unresolved.length > 0) {
    throw new Error(`plan-architect 提示存在未注入的变量: ${unresolved.join(', ')}`)
  }
  return prompt
}

// ===================== 计划草稿 JSON 提取与校验 =====================

export type PlanDraftResult =
  /** 无 JSON：普通对话轮次（追问/交流），不视为错误 */
  | { status: 'none' }
  /** 有 JSON 但不合法：提示用户让 AI 重新输出 */
  | { status: 'invalid'; error: string }
  /** 合法草稿：进入预览确认 */
  | { status: 'ok'; draft: PlanDoc }

/** 从回复中提取 JSON 文本；无代码块也无花括号时返回 null */
function extractJSON(text: string): string | null {
  const codeBlockMatch = text.match(/```json\s*([\s\S]*?)```/)
  if (codeBlockMatch) return codeBlockMatch[1].trim()
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  return jsonMatch ? jsonMatch[0].trim() : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function trimOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

/** plan id 约束：字母/数字/连字符（作为文件名），不满足时从标题兜底 */
function normalizePlanId(value: unknown, title: string): string {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (/^[a-z0-9][a-z0-9-]*$/i.test(raw)) return raw.toLowerCase()
  const slug = title
    .replace(/\s+/g, '-')
    .replace(/[\\/:*?"<>|#[\]{}]+/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return slug || `plan-${Date.now()}`
}

/**
 * 从 AI 回复提取计划草稿。
 * 字段缺失/类型不符时按默认值归一化（estimate 30、daily_minutes 60、id 兜底等）；
 * 结构性缺失（无标题/无任务/daily_minutes 非正数）返回 invalid，由视图层提示重试。
 */
export function extractPlanDraft(text: string): PlanDraftResult {
  const jsonStr = extractJSON(text)
  if (jsonStr === null) return { status: 'none' }

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    return { status: 'invalid', error: '计划 JSON 格式不合法（无法解析），请让 AI 重新输出' }
  }
  if (!isRecord(parsed)) {
    return { status: 'invalid', error: '计划 JSON 结构不正确（应为对象），请让 AI 重新输出' }
  }

  const title = trimOr(parsed.title, '')
  if (!title) {
    return { status: 'invalid', error: '计划缺少标题（title），请让 AI 重新输出' }
  }

  if (
    parsed.daily_minutes !== undefined &&
    (typeof parsed.daily_minutes !== 'number' || parsed.daily_minutes <= 0)
  ) {
    return { status: 'invalid', error: 'daily_minutes 必须为正数，请让 AI 重新输出' }
  }
  const dailyMinutes =
    typeof parsed.daily_minutes === 'number' && parsed.daily_minutes > 0 ? parsed.daily_minutes : 60

  const phases = (Array.isArray(parsed.phases) ? parsed.phases : [])
    .filter(isRecord)
    .map((item, index) => ({
      id: trimOr(item.id, `p${index + 1}`),
      title: trimOr(item.title, `阶段 ${index + 1}`),
      ...(typeof item.objective === 'string' && item.objective.trim()
        ? { objective: item.objective.trim() }
        : {}),
    }))

  const tasksRaw = Array.isArray(parsed.tasks) ? parsed.tasks.filter(isRecord) : []
  if (tasksRaw.length === 0) {
    return { status: 'invalid', error: '计划没有任何任务（tasks 为空），请让 AI 重新输出' }
  }
  const defaultPhase = phases[0]?.id ?? ''
  const tasks = tasksRaw.map((item, index) => ({
    id: trimOr(item.id, `t${index + 1}`),
    phase: trimOr(item.phase, defaultPhase),
    title: trimOr(item.title, `任务 ${index + 1}`),
    ...(typeof item.detail === 'string' && item.detail.trim() ? { detail: item.detail.trim() } : {}),
    estimate: typeof item.estimate === 'number' && item.estimate > 0 ? Math.round(item.estimate) : 30,
    done: false,
    done_at: null,
    sessions: [] as string[],
  }))

  const draft: PlanDoc = {
    path: '',
    kind: 'plan',
    plan: normalizePlanId(parsed.plan, title),
    title,
    goal: trimOr(parsed.goal, ''),
    status: 'active',
    created: new Date().toISOString(),
    daily_minutes: dailyMinutes,
    phases,
    tasks,
    body: typeof parsed.body === 'string' ? parsed.body : '',
  }
  return { status: 'ok', draft }
}
