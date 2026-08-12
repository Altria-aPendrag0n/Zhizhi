/**
 * 会话序列化工具
 * 将会话数据序列化为 Markdown 文件，支持写入 vault sessions/ 目录
 */

import type { Session, Message } from '../types'
import type { NoteReference } from './session-linker'
import { writeFile, createDir } from './vault-fs'
import { serializeForkContext, FORK_CONTEXT_START, FORK_CONTEXT_END } from './branch-context'
import { parseFrontmatter } from '../parser/frontmatter'

/**
 * 生成会话标题（取首条用户消息前 30 字）
 */
export function generateSessionTitle(messages: Message[]): string {
  const firstUserMsg = messages.find(m => m.role === 'user')
  if (!firstUserMsg) return '新会话'
  const text = firstUserMsg.content.replace(/\n/g, ' ').trim()
  return text.length > 30 ? text.slice(0, 30) + '...' : text
}

/**
 * 清理文件名，移除 Windows 不允许的字符
 */
export function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '').trim() || 'untitled'
}

/**
 * 序列化会话为 Markdown 字符串
 */
export function serializeSession(session: Session, noteRefs: NoteReference[] = []): string {
  const lines: string[] = []

  // YAML frontmatter
  lines.push('---')
  lines.push(`session_id: ${session.id}`)
  lines.push(`title: ${session.title}`)
  lines.push(`created: ${session.created}`)
  if (session.tags.length > 0) {
    lines.push(`tags: [${session.tags.join(', ')}]`)
  }
  if (session.parent_session) {
    lines.push(`parent_session: ${session.parent_session}`)
  }
  if (session.fork_point) {
    lines.push(`fork_point: ${session.fork_point}`)
  }
  if (session.fork_highlight) {
    // 划线文本可能含引号/特殊字符，用 JSON 字符串保证 YAML 解析安全
    lines.push(`fork_highlight: ${JSON.stringify(session.fork_highlight)}`)
  }
  // 复习会话标记：kind + 被复习笔记路径 + 出题结果（P2 复习会话）
  if (session.kind) {
    lines.push(`kind: ${session.kind}`)
  }
  if (session.reviewed_note) {
    // 路径可能含引号/特殊字符，用 JSON 字符串保证 YAML 解析安全
    lines.push(`reviewed_note: ${JSON.stringify(session.reviewed_note)}`)
  }
  if (session.review_questions && session.review_questions.length > 0) {
    // 出题结果以 JSON 字符串序列化，重新打开复习会话时无需重新出题
    lines.push(`review_questions: ${JSON.stringify(session.review_questions)}`)
  }
  if (session.review_cluster && session.review_cluster.length > 0) {
    // 复习簇笔记路径列表（P4 簇复习），JSON 字符串保证 YAML 解析安全
    lines.push(`review_cluster: ${JSON.stringify(session.review_cluster)}`)
  }
  if (session.review_completed) {
    // 已完成标记：资源库「复习会话」据此区分完成态；「开始复习」跳过已完成会话重新出题
    lines.push('review_completed: true')
  }
  lines.push('---')
  lines.push('')

  // 分叉点上下文（分支会话）：持久化到正文开头，前端识别后渲染
  if (session.fork_context) {
    lines.push(serializeForkContext(session.fork_context))
    lines.push('')
  }

  // 消息内容
  for (const [messageIndex, msg] of session.messages.entries()) {
    const role = msg.role === 'user' ? '用户' : msg.role === 'assistant' ? '知枝' : '系统'
    const time = msg.timestamp ? ` · ${msg.timestamp}` : ''
    lines.push(`## ${role}${time}`)
    lines.push('')
    lines.push(msg.content)
    for (const noteRef of noteRefs.filter((ref) => ref.messageIndex === messageIndex)) {
      const kindLabel = noteRef.kind === 'branch' ? '已生成分支' : '已生成笔记'
      const highlight = noteRef.highlight ? ` 划线「${noteRef.highlight.replace(/\s+/g, ' ')}」` : ''
      lines.push('')
      lines.push(`> ${kindLabel}: [[${noteRef.path}|${noteRef.title}]]${highlight}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * 保存会话到 vault
 * @param vaultPath vault 根目录路径
 * @param session 会话数据
 * @param isBranch 是否为分支会话
 * @param isReview 是否为复习会话（文件名前缀 review-，独立根会话）
 */
export function getSessionFilePath(vaultPath: string, sessionId: string, isBranch = false, isReview = false): string {
  const sessionsDir = `${vaultPath}/sessions`
  const safeId = sanitizeFileName(sessionId)
  const fileName = isReview ? `review-${safeId}.md` : isBranch ? `branch-${safeId}.md` : `${safeId}.md`
  return `${sessionsDir}/${fileName}`
}

export async function saveSessionToVault(
  vaultPath: string,
  session: Session,
  isBranch = false,
  noteRefs: NoteReference[] = [],
  isReview = false,
): Promise<string> {
  const sessionsDir = `${vaultPath}/sessions`
  const filePath = getSessionFilePath(vaultPath, session.id, isBranch, isReview)

  // 确保目录存在
  await createDir(sessionsDir)

  const content = serializeSession(session, noteRefs)
  await writeFile(filePath, content)

  return filePath
}

// ===================== 从 vault 加载会话 =====================

/** 会话列表元数据（侧边栏展示用）：仅解析 frontmatter，不读正文消息 */
export interface SessionMeta {
  id: string
  title: string
  /** ISO 创建时间（frontmatter created 缺失时回退为 1970，排序沉底） */
  created: string
  filePath: string
}

/** 消息头：`## 用户/知枝/系统`，可带 ` · <ISO 时间戳>`（统计问答按天归属） */
const MSG_HEADER_RE = /^## (用户|知枝|系统)(?: · (.+))?\s*$/
/** 划线引用标记行（已生成笔记/分支），解析消息内容时跳过，不混入正文 */
const REF_LINE_RE = /^> 已生成(笔记|分支):\s*\[\[/

function toString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function toTags(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === 'string') : []
}

/** frontmatter session_id 缺失时按文件名兜底（sess_xxx.md → sess_xxx） */
function sessionIdFromFileName(filePath: string): string {
  const name = filePath.split(/[\\/]/).pop() || ''
  return name.replace(/\.md$/i, '')
}

/** 移除正文中的分叉点上下文区块（解析消息前调用，避免区块内容被当作消息） */
function removeForkContextBlock(body: string): string {
  const start = body.indexOf(FORK_CONTEXT_START)
  if (start === -1) return body
  const end = body.indexOf(FORK_CONTEXT_END, start)
  if (end === -1) return body
  return body.slice(0, start) + body.slice(end + FORK_CONTEXT_END.length)
}

/** 提取正文中的分叉点上下文区块内容（无区块返回空串） */
function extractForkContextBlock(body: string): string {
  const start = body.indexOf(FORK_CONTEXT_START)
  if (start === -1) return ''
  const end = body.indexOf(FORK_CONTEXT_END, start)
  if (end === -1) return ''
  return body.slice(start + FORK_CONTEXT_START.length, end).trim()
}

/**
 * 轻量解析会话文件元数据（侧边栏会话列表用，不解析正文消息）。
 * frontmatter 缺失/损坏时按文件名兜底 id 与标题。
 */
export function parseSessionMeta(content: string, filePath: string): SessionMeta {
  const { meta } = parseFrontmatter(content)
  return {
    id: toString(meta.session_id) || sessionIdFromFileName(filePath),
    title: toString(meta.title) || sessionIdFromFileName(filePath),
    created: toString(meta.created) || '1970-01-01T00:00:00.000Z',
    filePath,
  }
}

/**
 * 从会话正文解析消息列表（保留消息级时间戳）。
 *
 * 消息头 `## 用户/知枝/系统` 带 ` · <ISO>` 时时间戳保留到 message.timestamp
 * （主界面按天统计问答依赖该字段）；存量文件无时间戳时为 undefined。
 * 分叉点上下文区块与 `> 已生成笔记/分支` 引用行是特殊标记，跳过不混入正文。
 */
export function parseSessionMessages(body: string): Message[] {
  const messages: Message[] = []
  const lines = removeForkContextBlock(body).split('\n')
  let current: { role: Message['role']; timestamp?: string; content: string[] } | null = null

  const flush = () => {
    if (!current || current.content.length === 0) return
    const message: Message = { role: current.role, content: current.content.join('\n').trim() }
    if (current.timestamp) message.timestamp = current.timestamp
    messages.push(message)
  }

  for (const line of lines) {
    const match = line.match(MSG_HEADER_RE)
    if (match) {
      flush()
      const role = match[1] === '用户' ? 'user' : match[1] === '知枝' ? 'assistant' : 'system'
      current = { role, timestamp: match[2]?.trim() || undefined, content: [] }
      continue
    }
    if (!current) continue
    // 跳过划线引用标记行，避免混入消息正文
    if (REF_LINE_RE.test(line)) continue
    current.content.push(line)
  }
  flush()

  return messages
}

/**
 * 从会话 md 文件内容解析完整会话（frontmatter + 正文消息）。
 *
 * 会话以 md + 特殊标记符（frontmatter、`## 角色 · 时间戳` 消息头、
 * `<!-- fork-context -->` 区块、`> 已生成笔记/分支` 引用行）持久化在 vault，
 * 本函数是读取侧的唯一入口。复习会话（kind: review）建议走
 * review-session 的 loadReviewSession（含出题结果规范化），此处不解析 review_questions。
 */
export function parseSessionFile(content: string, filePath = ''): Session {
  const { meta, body } = parseFrontmatter(content)
  const createdAt = toString(meta.created) || '1970-01-01T00:00:00.000Z'
  const forkPoint = meta.fork_point
  return {
    id: toString(meta.session_id) || sessionIdFromFileName(filePath),
    title: toString(meta.title) || sessionIdFromFileName(filePath),
    created: createdAt,
    parent_session: toString(meta.parent_session) || null,
    fork_point: forkPoint != null ? String(forkPoint) : null,
    tags: toTags(meta.tags),
    messages: parseSessionMessages(body),
    fork_context: extractForkContextBlock(body) || undefined,
    fork_highlight: toString(meta.fork_highlight) || undefined,
    kind: meta.kind === 'review' ? 'review' : undefined,
    reviewed_note: toString(meta.reviewed_note) || undefined,
    review_cluster: Array.isArray(meta.review_cluster) && meta.review_cluster.every((item): item is string => typeof item === 'string')
      ? meta.review_cluster
      : undefined,
    review_completed: meta.review_completed === true,
  }
}