/**
 * 会话序列化工具
 * 将会话数据序列化为 Markdown 文件，支持写入 vault sessions/ 目录
 */

import type { Session, Message } from '../types'
import { writeFile, createDir } from './vault-fs'

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
export function serializeSession(session: Session): string {
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
  lines.push('---')
  lines.push('')

  // 消息内容
  for (const msg of session.messages) {
    const role = msg.role === 'user' ? '用户' : msg.role === 'assistant' ? '知枝' : '系统'
    const time = msg.timestamp ? ` · ${msg.timestamp}` : ''
    lines.push(`## ${role}${time}`)
    lines.push('')
    lines.push(msg.content)
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * 保存会话到 vault
 * @param vaultPath vault 根目录路径
 * @param session 会话数据
 * @param isBranch 是否为分支会话
 */
export async function saveSessionToVault(
  vaultPath: string,
  session: Session,
  isBranch = false,
): Promise<string> {
  const topicDir = sanitizeFileName(generateSessionTitle(session.messages))
  const sessionsDir = `${vaultPath}/sessions/${topicDir}`
  const fileName = isBranch ? `branch-${session.id}.md` : 'main.md'
  const filePath = `${sessionsDir}/${fileName}`

  // 确保目录存在
  await createDir(sessionsDir)

  const content = serializeSession(session)
  await writeFile(filePath, content)

  return filePath
}