/**
 * 复习出题与反馈执行器（P2 AI 复习会话）
 *
 * 三个固定流程：
 * 1. generateReviewQuestions —— 基于原子笔记（+关联笔记/学习者画像/难度信号）生成递进复习问题（非流式 JSON）
 * 2. reviewFollowupStream —— 对用户作答做按题型适配的费曼式反馈，对照笔记原文指出知识缺口（流式）
 * 3. reviewDebateStream —— 辩论题多轮对答：中段反驳追问、末轮总结评估（流式）
 */

import type { LLMProvider, Message, StreamChunk } from '../llm-provider'
import type { Note, ReviewQuestion } from '../../types'
import { parseSkill, buildPrompt } from '../../skills/loader'
import type { LearnerProfile } from '../../utils/learner-profile'
import { matchConceptExact } from '../../utils/learner-note-link'
import { extractAllLinks } from '../../parser/wikilink'
import {
  DEFAULT_MAX_ROUNDS,
  formatQuestionForDisplay,
  normalizeQuizQuestion,
  shouldEndDebate,
} from '../../review/question-registry'

// SKILL.md 内容（构建时内联）
import skillRaw from '../../skills/review-quiz/SKILL.md?raw'
import feedbackRaw from '../../skills/review-feedback/SKILL.md?raw'
import clusterRaw from '../../skills/review-cluster/SKILL.md?raw'
import debateRaw from '../../skills/review-debate/SKILL.md?raw'

/** 笔记正文注入的最大长度（原子笔记为划线原文，防止超长） */
export const MAX_NOTE_BODY_LENGTH = 4000
/** 关联笔记每条注入的最大长度 */
const MAX_RELATED_NOTE_LENGTH = 800
/** 簇模式下每条笔记正文注入的最大长度（多笔记防上下文超限） */
const MAX_CLUSTER_NOTE_LENGTH = 1200

/** 毕业引导阈值：画像 high 置信度概念且复习掌握度 ≥ 0.9 视为可能已掌握（P3-4） */
export const GRADUATION_MASTERY_THRESHOLD = 0.9

/** 缓存解析后的 Skill 对象 */
let _quizSkillCache: ReturnType<typeof parseSkill> | null = null
let _feedbackSkillCache: ReturnType<typeof parseSkill> | null = null
let _clusterQuizSkillCache: ReturnType<typeof parseSkill> | null = null
let _debateSkillCache: ReturnType<typeof parseSkill> | null = null

function getQuizSkill() {
  if (!_quizSkillCache) _quizSkillCache = parseSkill(skillRaw)
  return _quizSkillCache
}

function getFeedbackSkill() {
  if (!_feedbackSkillCache) _feedbackSkillCache = parseSkill(feedbackRaw)
  return _feedbackSkillCache
}

function getClusterQuizSkill() {
  if (!_clusterQuizSkillCache) _clusterQuizSkillCache = parseSkill(clusterRaw)
  return _clusterQuizSkillCache
}

function getDebateSkill() {
  if (!_debateSkillCache) _debateSkillCache = parseSkill(debateRaw)
  return _debateSkillCache
}

/**
 * 将原子笔记序列化为复习上下文（标题/描述/类型/标签/正文），正文截断防超长
 */
export function serializeNoteForReview(note: Note): string {
  const body = note.content.slice(0, MAX_NOTE_BODY_LENGTH)
  return [
    `标题: ${note.title}`,
    `描述: ${note.description || ''}`,
    `类型: ${note.type}`,
    `标签: ${note.tags.join(', ')}`,
    `正文:\n${body}`,
  ].join('\n')
}

/**
 * 将关联笔记序列化为参考文本（每条截断，出题时仅作辅助参考）
 */
function serializeRelatedNotes(notes: Note[]): string {
  if (notes.length === 0) return '（无关联笔记）'
  return notes
    .map((note) => `### ${note.title}\n标签: ${note.tags.join(', ')}\n${note.content.slice(0, MAX_RELATED_NOTE_LENGTH)}`)
    .join('\n\n')
}

/**
 * 从 LLM 响应中提取 JSON（支持 markdown 代码块包裹）
 */
function extractJSON(text: string): string {
  const codeBlockMatch = text.match(/```json\s*([\s\S]*?)```/)
  if (codeBlockMatch) return codeBlockMatch[1].trim()
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (jsonMatch) return jsonMatch[0].trim()
  return text.trim()
}

/**
 * 从 LLM 响应中提取并规范化复习问题（P5 接入题型注册表）。
 *
 * 逐题经 normalizeQuizQuestion 规范化：type 缺省/未知降级 short_answer，
 * level 非法或 choice/ordering 字段不满足约束时丢弃该题；全部丢弃则抛错（LLM 输出完全无效）。
 */
function parseQuizResponse(data: unknown): ReviewQuestion[] {
  if (!data || typeof data !== 'object') {
    throw new Error('复习出题失败: 响应不是合法对象')
  }
  const d = data as Record<string, unknown>
  if (!Array.isArray(d.questions)) {
    throw new Error('复习出题失败: 响应缺少 questions 数组')
  }
  const questions = d.questions
    .map(normalizeQuizQuestion)
    .filter((q): q is ReviewQuestion => q !== null)
  if (questions.length === 0) {
    throw new Error('复习出题失败: questions 中没有合法题目')
  }
  return questions
}

/**
 * 判断笔记是否达到"可毕业"建议条件（P3-4 掌握度引导）：
 * 笔记标题/标签命中画像中 high 置信度概念，且当前复习掌握度 ≥ GRADUATION_MASTERY_THRESHOLD。
 */
export function shouldSuggestGraduation(note: Note, profile: LearnerProfile, mastery: number): boolean {
  if (mastery < GRADUATION_MASTERY_THRESHOLD) return false
  const highConcepts = profile.known_concepts.filter((concept) => concept.confidence === 'high')
  if (highConcepts.length === 0) return false
  return highConcepts.some((concept) =>
    matchConceptExact(concept.name, [{ path: note.path, title: note.title, tags: note.tags }]).length > 0,
  )
}

/**
 * 基于原子笔记生成递进复习问题（非流式）
 *
 * @param note - 被复习的原子笔记
 * @param relatedNotes - 关联笔记（RAG 检索结果，可空）
 * @param provider - LLM 提供商
 * @param learnerProfile - 学习者画像文本（可空，用于调节难度分布）
 * @param graduationHint - 毕业引导提示（可空，由调用方根据画像 confidence 与掌握度计算）
 * @param difficultySignal - 卡片掌握度/复习曲线难度信号（P5-2 可空，按默认难度出题）
 * @returns 递进问题列表（recognize → apply → explain，含题型 type 与结构化字段）
 */
export async function generateReviewQuestions(
  note: Note,
  relatedNotes: Note[],
  provider: LLMProvider,
  learnerProfile?: string,
  graduationHint?: string,
  difficultySignal?: string,
): Promise<ReviewQuestion[]> {
  const skill = getQuizSkill()
  const profileText = learnerProfile && learnerProfile.trim() ? learnerProfile.trim() : '（暂无学习者画像，按默认难度出题）'
  const learnerSection = graduationHint ? `${profileText}\n\n${graduationHint}` : profileText
  const systemPrompt = buildPrompt(skill, {
    note_content: serializeNoteForReview(note),
    related_notes: serializeRelatedNotes(relatedNotes),
    learner_profile: learnerSection,
    difficulty_signal:
      difficultySignal && difficultySignal.trim()
        ? difficultySignal.trim()
        : '（暂无卡片掌握度信号，按默认难度出题）',
  })

  const messages: Message[] = [{ role: 'user', content: '请为上述笔记生成复习问题。' }]

  let fullResponse = ''
  for await (const chunk of provider.chat(messages, {
    systemPrompt,
    temperature: 0.3,
    maxTokens: 1024,
    busyMessage: 'AI 正在生成复习题…',
  })) {
    if (chunk.type === 'text') {
      fullResponse += chunk.content
    } else if (chunk.type === 'error') {
      throw new Error(`复习出题失败: ${chunk.content}`)
    }
  }

  const jsonStr = extractJSON(fullResponse)
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    throw new Error(`复习出题失败: 无法解析 LLM 响应为 JSON\n响应内容: ${fullResponse.slice(0, 200)}`)
  }

  return parseQuizResponse(parsed)
}

/** 簇模式问题：额外携带涉及笔记标题（P4-4 缺口定位依据） */
export interface ClusterReviewQuestion extends ReviewQuestion {
  notes?: string[]
}

/**
 * 从 LLM 响应中提取并规范化簇模式问题（P5 接入题型注册表）。
 * 在单题规范化基础上，透传可选 notes 字段（涉及笔记标题列表）。
 */
function parseClusterQuizResponse(data: unknown): ClusterReviewQuestion[] {
  if (!data || typeof data !== 'object') {
    throw new Error('复习出题失败: 响应不是合法对象')
  }
  const d = data as Record<string, unknown>
  if (!Array.isArray(d.questions)) {
    throw new Error('复习出题失败: 响应缺少 questions 数组')
  }
  const questions: ClusterReviewQuestion[] = []
  for (const raw of d.questions) {
    const q = normalizeQuizQuestion(raw)
    if (!q) continue
    const r = raw as Record<string, unknown>
    if (Array.isArray(r.notes) && r.notes.every((n) => typeof n === 'string')) {
      ;(q as ClusterReviewQuestion).notes = r.notes as string[]
    }
    questions.push(q as ClusterReviewQuestion)
  }
  if (questions.length === 0) {
    throw new Error('复习出题失败: questions 中没有合法题目')
  }
  return questions
}

/**
 * 序列化复习簇笔记（P4-2 簇模式）：每条含标题（首条为中心）+ 标签 + 正文，正文截断防超长
 */
export function serializeClusterNotes(notes: Note[]): string {
  if (notes.length === 0) return '（空）'
  return notes
    .map((note, index) => {
      const body = note.content.slice(0, MAX_CLUSTER_NOTE_LENGTH)
      const centerMark = index === 0 ? '（中心笔记）' : ''
      return `${index + 1}. ${note.title}${centerMark}\n标签: ${note.tags.join(', ')}\n${body}`
    })
    .join('\n\n')
}

/**
 * 序列化簇内已知 wikilink 关系（P4-2）：输出 "A → B" 形式，仅保留簇内互相指向的链接
 */
export function serializeClusterRelations(notes: Note[]): string {
  const byTitle = new Set(notes.map((note) => note.title))
  const lines: string[] = []
  for (const note of notes) {
    for (const target of extractAllLinks(note.content)) {
      if (byTitle.has(target)) lines.push(`${note.title} → ${target}`)
    }
  }
  return lines.length > 0 ? lines.join('\n') : '（簇内笔记之间暂无显式 wikilink 关系）'
}

/**
 * 基于复习簇生成关系型问题（P4-2 簇模式，非流式）
 *
 * 输入 2-5 条簇内笔记 + 其 wikilink 关系，问题侧重概念间联系/区别/因果/适用场景，
 * 并携带涉及笔记标题（notes 字段），供 P4-4 缺口精准回写。
 *
 * @param notes - 复习簇笔记（首条为中心笔记）
 * @param provider - LLM 提供商
 * @param learnerProfile - 学习者画像文本（可空）
 * @param difficultySignal - 卡片掌握度/复习曲线难度信号（P5-2 可空，按默认难度出题）
 * @returns 关系型问题列表（含涉及笔记标注）
 */
export async function generateClusterQuestions(
  notes: Note[],
  provider: LLMProvider,
  learnerProfile?: string,
  difficultySignal?: string,
): Promise<ClusterReviewQuestion[]> {
  const skill = getClusterQuizSkill()
  const systemPrompt = buildPrompt(skill, {
    notes: serializeClusterNotes(notes),
    relations: serializeClusterRelations(notes),
    learner_profile: learnerProfile && learnerProfile.trim() ? learnerProfile.trim() : '（暂无学习者画像，按默认难度出题）',
    difficulty_signal:
      difficultySignal && difficultySignal.trim()
        ? difficultySignal.trim()
        : '（暂无卡片掌握度信号，按默认难度出题）',
  })

  const messages: Message[] = [{ role: 'user', content: '请为上述复习簇生成关系型复习问题。' }]

  let fullResponse = ''
  for await (const chunk of provider.chat(messages, {
    systemPrompt,
    temperature: 0.3,
    maxTokens: 1024,
    busyMessage: 'AI 正在生成复习题…',
  })) {
    if (chunk.type === 'text') {
      fullResponse += chunk.content
    } else if (chunk.type === 'error') {
      throw new Error(`复习出题失败: ${chunk.content}`)
    }
  }

  const jsonStr = extractJSON(fullResponse)
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    throw new Error(`复习出题失败: 无法解析 LLM 响应为 JSON\n响应内容: ${fullResponse.slice(0, 200)}`)
  }

  return parseClusterQuizResponse(parsed)
}

/**
 * 对用户作答做按题型适配的费曼式反馈（流式）
 *
 * @param question - 本次复习问题（含题型 type 与结构化字段，P5-3）
 * @param answer - 用户的回答
 * @param note - 被复习的原子笔记（对照标准）
 * @param provider - LLM 提供商
 * @param clusterNotes - 复习簇上下文（P4-2 可空）：提供后反馈会结合整簇笔记，并指出回答涉及/应涉及哪条笔记
 * @returns 流式反馈迭代器
 */
export async function* reviewFollowupStream(
  question: ReviewQuestion,
  answer: string,
  note: Note,
  provider: LLMProvider,
  clusterNotes?: Note[],
): AsyncIterable<StreamChunk> {
  const skill = getFeedbackSkill()
  const systemPrompt = buildPrompt(skill, {
    review_question: formatQuestionForDisplay(question),
    note_content: serializeNoteForReview(note),
    cluster_notes:
      clusterNotes && clusterNotes.length > 0 ? serializeClusterNotes(clusterNotes) : '（单条笔记复习，无簇上下文）',
  })

  const messages: Message[] = [
    { role: 'user', content: `复习问题：${question.question}` },
    { role: 'user', content: `我的回答：${answer}` },
  ]

  try {
    for await (const chunk of provider.chat(messages, {
      systemPrompt,
      temperature: 0.5,
      maxTokens: 2048,
    })) {
      yield chunk
    }
  } catch (e) {
    yield {
      type: 'error',
      content: `复习反馈失败: ${(e as Error).message}`,
    }
  }
}

/**
 * 辩论题多轮对答（流式，P5-3）
 *
 * @param question - 辩论题（type=debate，含 position / maxRounds）
 * @param turns - 历史论点（含用户本轮最新发言，最新在最后；role 与消息一致）
 * @param note - 被复习的原子笔记（对照标准）
 * @param provider - LLM 提供商
 * @param clusterNotes - 复习簇上下文（可空）
 * @param round - 用户当前发言轮次（从 1 起）
 * @param maxRounds - 最大辩论轮次（缺省 3）；本轮达到 maxRounds 时输出总结评估
 * @returns 流式辩论回复迭代器
 */
export async function* reviewDebateStream(
  question: ReviewQuestion,
  turns: { role: 'user' | 'assistant'; content: string }[],
  note: Note,
  provider: LLMProvider,
  clusterNotes?: Note[],
  round = 1,
  maxRounds: number = DEFAULT_MAX_ROUNDS,
): AsyncIterable<StreamChunk> {
  const skill = getDebateSkill()
  const isFinal = shouldEndDebate('debate', round, maxRounds)
  const turnsText =
    turns.length > 0
      ? turns.map((t) => `${t.role === 'user' ? '用户' : '你'}：${t.content}`).join('\n\n')
      : '（暂无历史发言，本轮为开场）'

  const systemPrompt = buildPrompt(skill, {
    debate_position: question.position && question.position.trim() ? question.position : question.question,
    debate_round: `${round} / ${maxRounds}${isFinal ? '（本轮为总结轮）' : ''}`,
    debate_turns: turnsText,
    note_content: serializeNoteForReview(note),
    cluster_notes:
      clusterNotes && clusterNotes.length > 0 ? serializeClusterNotes(clusterNotes) : '（单条笔记复习，无簇上下文）',
  })

  const messages: Message[] = [
    { role: 'user', content: isFinal ? '请给出本轮辩论的总结评估。' : '请针对我上轮论点进行反驳或追问。' },
  ]

  try {
    for await (const chunk of provider.chat(messages, {
      systemPrompt,
      temperature: 0.7,
      maxTokens: 2048,
    })) {
      yield chunk
    }
  } catch (e) {
    yield {
      type: 'error',
      content: `辩论回复失败: ${(e as Error).message}`,
    }
  }
}
