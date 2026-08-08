/**
 * 会话序列化工具
 * 将会话数据序列化为 Markdown 文件，支持写入 vault sessions/ 目录
 */

import type { Session, Message } from '../types'
import type { NoteReference } from './session-linker'
import { writeFile, createDir } from './vault-fs'
import { serializeForkContext } from './branch-context'

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