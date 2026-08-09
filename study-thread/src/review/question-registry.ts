/**
 * 复习题型注册表（P5 出题形式规划）
 *
 * 集中管理六类题型的定义：标签、难度档、LLM 响应校验、作答序列化、辩论轮次判定。
 * 前端渲染（P5-4）与出题校验（review-quiz）均经本注册表分派——
 * 新增题型只需加一个条目，不改既有代码（可拓展性设计，见复习出题形式开发报告 §6）。
 *
 * 纯逻辑模块，无 Vue 依赖，可独立单测。
 */

import type { ReviewQuestion, ReviewQuestionLevel, ReviewQuestionType } from '../types'

/** 认知层级常量（出题/解析共用） */
export const REVIEW_QUESTION_LEVELS: ReviewQuestionLevel[] = ['recognize', 'apply', 'explain']

/** 题型常量（固定枚举；未知/缺省由 normalizeQuizQuestion 降级为 short_answer） */
export const REVIEW_QUESTION_TYPES: ReviewQuestionType[] = [
  'choice',
  'true_false',
  'fill_blank',
  'ordering',
  'short_answer',
  'debate',
]

/** 选择题选项字母（≥6 项时回退 A-F 循环） */
export const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

/** debate 默认最大轮次（可被题面 maxRounds 覆盖） */
export const DEFAULT_MAX_ROUNDS = 3
/** fill_blank 默认填空数量 */
export const DEFAULT_BLANKS = 1

/** 题型难度档（★ 数量，1 最易 → 4 最难），与开发报告 §4 谱系一致 */
export const QUESTION_TYPE_DIFFICULTY: Record<ReviewQuestionType, number> = {
  choice: 1,
  true_false: 1,
  fill_blank: 2,
  ordering: 2,
  short_answer: 3,
  debate: 4,
}

/** 各题型的交互标签 */
export const QUESTION_TYPE_LABELS: Record<ReviewQuestionType, string> = {
  choice: '选择题',
  true_false: '判对错',
  fill_blank: '填空题',
  ordering: '排序题',
  short_answer: '简答题',
  debate: '辩论',
}

/** 题型 → LLM 响应结构化字段校验（无校验函数的题型仅需基础字段） */
const FIELD_VALIDATORS: Partial<Record<ReviewQuestionType, (q: Record<string, unknown>) => boolean>> = {
  choice: (q) =>
    Array.isArray(q.options) && q.options.length >= 2 && q.options.every((o) => typeof o === 'string'),
  ordering: (q) =>
    Array.isArray(q.steps) && q.steps.length >= 2 && q.steps.every((s) => typeof s === 'string'),
}

function normalizeNumber(value: unknown, fallback: number, min = 1): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min ? Math.floor(value) : fallback
}

/**
 * 将 LLM 出题的单个原始题对象规范化为 ReviewQuestion。
 *
 * - level 缺失/非法 → 返回 null（整题丢弃）；
 * - type 缺失/未知 → 降级为 short_answer（不抛错，会话不中断）；
 * - choice/ordering 结构化字段不满足约束 → 返回 null（该题丢弃）；
 * - fill_blank/debate 可选字段缺省时补默认值。
 *
 * 返回值总是含合法 type 的 ReviewQuestion，供出题执行器直接透传。
 */
export function normalizeQuizQuestion(raw: unknown): ReviewQuestion | null {
  if (!raw || typeof raw !== 'object') return null
  const q = raw as Record<string, unknown>
  if (typeof q.question !== 'string') return null
  const level = q.level as ReviewQuestionLevel
  if (!REVIEW_QUESTION_LEVELS.includes(level)) return null

  const type = REVIEW_QUESTION_TYPES.includes(q.type as ReviewQuestionType)
    ? (q.type as ReviewQuestionType)
    : 'short_answer'
  const validator = FIELD_VALIDATORS[type]
  if (validator && !validator(q)) return null

  const base: ReviewQuestion = { level, type, question: q.question }
  if (type === 'choice' && Array.isArray(q.options)) base.options = q.options as string[]
  if (type === 'ordering' && Array.isArray(q.steps)) base.steps = q.steps as string[]
  if (type === 'fill_blank') base.blanks = normalizeNumber(q.blanks, DEFAULT_BLANKS)
  if (type === 'debate') {
    if (typeof q.position === 'string') base.position = q.position
    base.maxRounds = normalizeNumber(q.maxRounds, DEFAULT_MAX_ROUNDS)
  }
  return base
}

/**
 * 将组件作答 payload 序列化为消息文本（走现有 handleSend(content) 消息流）。
 *
 * payload 约定（与对应作答组件一致）：
 * - choice:      { index: number, text: string }          → "我选择 B：xxx"
 * - true_false:  boolean                                  → "我的判断：正确/错误"
 * - fill_blank:  string（多空用「；」分隔）                → "我的填空：xxx"
 * - ordering:    string[]（重排后的完整步骤文本）           → "我认为顺序是：\n1. xxx\n2. yyy"
 * - short_answer / debate: string                          → 原文
 */
export function serializeAnswer(type: ReviewQuestionType, payload: unknown): string {
  switch (type) {
    case 'choice': {
      const p = payload as { index: number; text: string }
      const letter = OPTION_LETTERS[p.index] ?? `第${p.index + 1}项`
      return `我选择 ${letter}：${p.text}`
    }
    case 'true_false':
      return `我的判断：${payload === true ? '正确' : '错误'}`
    case 'fill_blank':
      return `我的填空：${String(payload)}`
    case 'ordering': {
      const steps = Array.isArray(payload) ? (payload as string[]) : []
      return `我认为顺序是：\n${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
    }
    case 'short_answer':
    case 'debate':
    default:
      return String(payload)
  }
}

/**
 * 将 ReviewQuestion 序列化为反馈 prompt 注入文本（含题型标签与结构化内容），
 * 供 review-feedback 按题型分派反馈策略。
 */
export function formatQuestionForDisplay(question: ReviewQuestion): string {
  const label = QUESTION_TYPE_LABELS[question.type]
  let text = `[${label}] ${question.question}`
  if (question.type === 'choice' && question.options) {
    text += `\n选项：${question.options.map((o, i) => `${OPTION_LETTERS[i]}. ${o}`).join('　')}`
  }
  if (question.type === 'ordering' && question.steps) {
    text += `\n乱序步骤：${question.steps.map((s, i) => `${i + 1}. ${s}`).join('　')}`
  }
  if (question.type === 'fill_blank' && question.blanks && question.blanks > 1) {
    text += `\n（共 ${question.blanks} 个空位）`
  }
  return text
}

/**
 * 辩论轮次判定（纯函数）：当前题型非 debate，或已达到最大轮次时结束辩论。
 * maxRounds 缺省用 DEFAULT_MAX_ROUNDS。
 */
export function shouldEndDebate(type: ReviewQuestionType, round: number, maxRounds?: number): boolean {
  if (type !== 'debate') return true
  const limit = normalizeNumber(maxRounds, DEFAULT_MAX_ROUNDS)
  return round >= limit
}
