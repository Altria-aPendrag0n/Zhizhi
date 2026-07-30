/**
 * 分支上下文加载器
 *
 * 读取父会话的 Markdown 文件，提取分叉点之前的消息作为分支对话的初始历史。
 */

import { readFile } from '../utils/vault-fs'
import { parseFrontmatter } from '../parser/frontmatter'
import type { Message } from '../types'

/**
 * 从会话文件加载分支上下文
 *
 * @param parentSessionFile - 父会话的 Markdown 文件路径
 * @param forkMessageIndex - 分叉点消息索引（分叉点之前的消息作为上下文）
 * @returns 分叉点之前的历史消息
 */
export async function loadBranchContext(
  parentSessionFile: string,
  forkMessageIndex: number,
): Promise<Message[]> {
  try {
    const raw = await readFile(parentSessionFile)
    const { body } = parseFrontmatter(raw)
    return parseMessages(body, forkMessageIndex)
  } catch {
    return []
  }
}

/**
 * 从会话 Markdown 正文中解析消息
 *
 * 消息格式:
 * ## 用户 · 时间
 * 内容
 *
 * ## 知枝 · 时间
 * 内容
 */
function parseMessages(body: string, upToIndex: number): Message[] {
  const messages: Message[] = []
  const lines = body.split('\n')
  let i = 0
  let currentRole: Message['role'] | null = null
  let currentContent: string[] = []
  let messageIndex = 0

  while (i < lines.length && messageIndex <= upToIndex) {
    const line = lines[i]

    // 检测消息头
    const userMatch = line.match(/^## 用户/)
    const aiMatch = line.match(/^## 知枝/)
    const sysMatch = line.match(/^## 系统/)

    if (userMatch || aiMatch || sysMatch) {
      // 保存上一条消息
      if (currentRole && currentContent.length > 0) {
        messages.push({
          role: currentRole,
          content: currentContent.join('\n').trim(),
        })
        messageIndex++
      }

      // 开始新消息
      currentRole = userMatch ? 'user' : aiMatch ? 'assistant' : 'system'
      currentContent = []
    } else if (currentRole) {
      currentContent.push(line)
    }

    i++
  }

  // 保存最后一条消息
  if (currentRole && currentContent.length > 0) {
    messages.push({
      role: currentRole,
      content: currentContent.join('\n').trim(),
    })
  }

  return messages
}