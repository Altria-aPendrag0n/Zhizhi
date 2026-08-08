/**
 * 复习会话模型与上下文装载（P2 AI 复习会话）
 *
 * 复习会话是独立根会话（frontmatter 标记 kind: review + reviewed_note），
 * 不进入会话分支树、不占用分支深度；出题结果（review_questions）持久化到
 * frontmatter，重新打开复习会话时无需重新出题。
 *
 * 本模块提供：复习会话创建、关联笔记装载（wikilink/同标签）、复习会话文件解析。
 */

import type { Message, Note, ReviewQuestion, Session } from '../types'
import { sanitizeFileName } from './session-serializer'
import { readFile } from './vault-fs'
import { parseFrontmatter } from '../parser/frontmatter'
import { extractAllLinks } from '../parser/wikilink'
import { parseMessages } from './branch-context'

/** 复习会话关联笔记的最大数量 */
export const MAX_REVIEW_RELATED_NOTES = 4

const REVIEW_LEVELS: ReviewQuestion['level'][] = ['recognize', 'apply', 'explain']

function toString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function toTags(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === 'string') : []
}

/** 从 frontmatter 解析复习问题（兼容 YAML 解析为数组 / JSON 字符串两种形态） */
function parseReviewQuestions(value: unknown): ReviewQuestion[] | undefined {
  let parsed: unknown = value
  if (typeof value === 'string' && value) {
    try {
      parsed = JSON.parse(value)
    } catch {
      return undefined
    }
  }
  if (
    Array.isArray(parsed) &&
    parsed.every(
      (q) =>
        q !== null &&
        typeof q === 'object' &&
        typeof (q as Record<string, unknown>).question === 'string' &&
        REVIEW_LEVELS.includes((q as Record<string, unknown>).level as ReviewQuestion['level']),
    )
  ) {
    return parsed as ReviewQuestion[]
  }
  return undefined
}

/**
 * 创建复习会话（独立根会话）
 *
 * 首条 assistant 消息为复习引导：复习目标（被复习笔记标题）+ 问题列表。
 * 复习会话 id 前缀为 `review_`，与普通会话（sess_/branch_）区分。
 *
 * @param note - 被复习的原子笔记（簇复习时为中心笔记）
 * @param reviewQuestions - 出题结果（generateReviewQuestions / generateClusterQuestions 的输出）
 * @param now - 创建时间（默认当前时间）
 * @param cluster - 复习簇笔记（P4，可空）：首条为中心笔记，全部路径写入 frontmatter
 */
export function createReviewSession(
  note: Note,
  reviewQuestions: ReviewQuestion[],
  now: Date = new Date(),
  cluster?: Note[],
): Session {
  // 有出题结果时展示问题列表；无出题（未配置 AI / 出题失败）时展示笔记原文，进入原文复习模式
  const introContent =
    reviewQuestions.length > 0
      ? `## 复习目标\n${note.title}\n\n## 问题\n${reviewQuestions.map((q, index) => `${index + 1}. ${q.question}`).join('\n')}`
      : `## 复习目标\n${note.title}\n\n## 原文\n${note.content}`
  const intro: Message = {
    role: 'assistant',
    content: introContent,
    timestamp: now.toISOString(),
  }

  return {
    id: `review_${now.getTime()}`,
    title: `复习：${note.title}`,
    created: now.toISOString(),
    parent_session: null,
    fork_point: null,
    tags: ['复习'],
    messages: [intro],
    kind: 'review',
    reviewed_note: note.path,
    review_questions: reviewQuestions,
    review_cluster: cluster && cluster.length > 1 ? cluster.map((item) => item.path) : undefined,
  }
}

/**
 * 装载复习关联笔记
 *
 * 优先笔记正文中的 [[wikilink]] 目标，其次同标签笔记，去重后按上限截断。
 * （P3 可扩展为 RAG 语义检索）
 *
 * @param note - 被复习的原子笔记
 * @param allNotes - vault 中的全部笔记
 * @param maxSize - 返回的最大条数
 */
export function buildReviewRelatedNotes(note: Note, allNotes: Note[], maxSize: number = MAX_REVIEW_RELATED_NOTES): Note[] {
  const targets = new Set(extractAllLinks(note.content))
  const related: Note[] = []
  const seen = new Set<string>()

  // 1. wikilink 目标优先
  for (const other of allNotes) {
    if (other.path === note.path) continue
    if (targets.has(other.title) && !seen.has(other.path)) {
      seen.add(other.path)
      related.push(other)
    }
  }
  // 2. 同标签笔记补充
  for (const other of allNotes) {
    if (other.path === note.path || seen.has(other.path)) continue
    if (other.tags.some((tag) => note.tags.includes(tag))) {
      seen.add(other.path)
      related.push(other)
    }
  }

  return related.slice(0, maxSize)
}

/** 复习会话文件路径：`<vault>/sessions/review-<id>.md` */
export function getReviewSessionFilePath(vaultPath: string, sessionId: string): string {
  return `${vaultPath}/sessions/review-${sanitizeFileName(sessionId)}.md`
}

/** 从 frontmatter 解析复习簇笔记路径（兼容 YAML 数组 / JSON 字符串两种形态） */
function parseReviewCluster(value: unknown): string[] | undefined {
  let parsed: unknown = value
  if (typeof value === 'string' && value) {
    try {
      parsed = JSON.parse(value)
    } catch {
      return undefined
    }
  }
  if (Array.isArray(parsed) && parsed.every((item): item is string => typeof item === 'string')) {
    return parsed
  }
  return undefined
}

/**
 * 从文件加载复习会话
 *
 * 解析 frontmatter（kind/reviewed_note/review_questions/review_cluster）与正文消息；
 * 文件缺失或损坏时返回 null。
 */
export async function loadReviewSession(vaultPath: string, sessionId: string): Promise<Session | null> {
  try {
    const raw = await readFile(getReviewSessionFilePath(vaultPath, sessionId))
    const { meta, body } = parseFrontmatter(raw)
    const messages = parseMessages(body, Number.MAX_SAFE_INTEGER)
    const reviewQuestions = parseReviewQuestions(meta.review_questions)
    const created = toString(meta.created)

    return {
      id: toString(meta.session_id) || sessionId,
      title: toString(meta.title) || '复习会话',
      created: created || new Date().toISOString(),
      parent_session: null,
      fork_point: null,
      tags: toTags(meta.tags),
      messages,
      kind: meta.kind === 'review' ? 'review' : undefined,
      reviewed_note: toString(meta.reviewed_note) || undefined,
      review_questions: reviewQuestions,
      review_cluster: parseReviewCluster(meta.review_cluster),
    }
  } catch {
    return null
  }
}
