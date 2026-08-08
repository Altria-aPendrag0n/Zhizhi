/**
 * 复习出题与反馈执行器（P2 AI 复习会话）
 *
 * 两个固定流程：
 * 1. generateReviewQuestions —— 基于原子笔记（+关联笔记/学习者画像）生成递进复习问题（非流式 JSON）
 * 2. reviewFollowupStream —— 对用户作答做费曼式反馈，对照笔记原文指出知识缺口（流式）
 */

import type { LLMProvider, Message, StreamChunk } from '../llm-provider'
import type { Note, ReviewQuestion } from '../../types'
import { parseSkill, buildPrompt } from '../../skills/loader'

// SKILL.md 内容（构建时内联）
import skillRaw from '../../skills/review-quiz/SKILL.md?raw'
import feedbackRaw from '../../skills/review-feedback/SKILL.md?raw'

/** 笔记正文注入的最大长度（原子笔记为划线原文，防止超长） */
export const MAX_NOTE_BODY_LENGTH = 4000
/** 关联笔记每条注入的最大长度 */
const MAX_RELATED_NOTE_LENGTH = 800

/** 缓存解析后的 Skill 对象 */
let _quizSkillCache: ReturnType<typeof parseSkill> | null = null
let _feedbackSkillCache: ReturnType<typeof parseSkill> | null = null

function getQuizSkill() {
  if (!_quizSkillCache) _quizSkillCache = parseSkill(skillRaw)
  return _quizSkillCache
}

function getFeedbackSkill() {
  if (!_feedbackSkillCache) _feedbackSkillCache = parseSkill(feedbackRaw)
  return _feedbackSkillCache
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

/** LLM 出题响应的内部结构 */
interface QuizResponse {
  questions: { level: string; question: string }[]
}

const LEVELS: ReviewQuestion['level'][] = ['recognize', 'apply', 'explain']

function validateQuizResponse(data: unknown): data is QuizResponse {
  if (!data || typeof data !== 'object') return false
  const d = data as Record<string, unknown>
  if (!Array.isArray(d.questions) || d.questions.length === 0) return false
  return d.questions.every(
    (q) =>
      q !== null &&
      typeof q === 'object' &&
      typeof (q as Record<string, unknown>).question === 'string' &&
      LEVELS.includes((q as Record<string, unknown>).level as ReviewQuestion['level']),
  )
}

/**
 * 基于原子笔记生成递进复习问题（非流式）
 *
 * @param note - 被复习的原子笔记
 * @param relatedNotes - 关联笔记（RAG 检索结果，可空）
 * @param provider - LLM 提供商
 * @param learnerProfile - 学习者画像文本（可空，用于调节难度分布）
 * @returns 递进问题列表（recognize → apply → explain）
 */
export async function generateReviewQuestions(
  note: Note,
  relatedNotes: Note[],
  provider: LLMProvider,
  learnerProfile?: string,
): Promise<ReviewQuestion[]> {
  const skill = getQuizSkill()
  const systemPrompt = buildPrompt(skill, {
    note_content: serializeNoteForReview(note),
    related_notes: serializeRelatedNotes(relatedNotes),
    learner_profile: learnerProfile && learnerProfile.trim() ? learnerProfile.trim() : '（暂无学习者画像，按默认难度出题）',
  })

  const messages: Message[] = [{ role: 'user', content: '请为上述笔记生成复习问题。' }]

  let fullResponse = ''
  for await (const chunk of provider.chat(messages, {
    systemPrompt,
    temperature: 0.3,
    maxTokens: 1024,
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

  if (!validateQuizResponse(parsed)) {
    throw new Error(`复习出题失败: 响应缺少合法的 questions 字段\n响应内容: ${JSON.stringify(parsed).slice(0, 200)}`)
  }

  return parsed.questions.map((q) => ({ level: q.level as ReviewQuestion['level'], question: q.question }))
}

/**
 * 对用户作答做费曼式反馈（流式）
 *
 * @param question - 本次复习问题
 * @param answer - 用户的回答
 * @param note - 被复习的原子笔记（对照标准）
 * @param provider - LLM 提供商
 * @returns 流式反馈迭代器
 */
export async function* reviewFollowupStream(
  question: string,
  answer: string,
  note: Note,
  provider: LLMProvider,
): AsyncIterable<StreamChunk> {
  const skill = getFeedbackSkill()
  const systemPrompt = buildPrompt(skill, {
    note_content: serializeNoteForReview(note),
  })

  const messages: Message[] = [
    { role: 'user', content: `复习问题：${question}` },
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
