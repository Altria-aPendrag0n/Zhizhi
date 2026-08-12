/**
 * 分支上下文加载器
 *
 * 读取父会话的 Markdown 文件，提取分叉点之前的消息作为分支对话的初始历史。
 */

import { readFile } from '../utils/vault-fs'
import { parseFrontmatter } from '../parser/frontmatter'
import type { Message } from '../types'

/** 分叉点上下文区块标记（写入分支会话 md 正文开头，前端识别后渲染） */
export const FORK_CONTEXT_START = '<!-- fork-context -->'
export const FORK_CONTEXT_END = '<!-- /fork-context -->'

/** AI 思考过程区块标记（assistant 消息正文开头，session-serializer 持久化/解析） */
export const THINKING_START = '<!-- thinking -->'
export const THINKING_END = '<!-- /thinking -->'

/**
 * 序列化分叉点上下文为可写入分支文件的区块文本
 *
 * 区块以 HTML 注释包裹，不参与 markdown 渲染；内容中的 `-->` 转义为 `--&gt;`，
 * 避免提前闭合标记。
 */
export function serializeForkContext(text: string): string {
  if (!text) return ''
  const escaped = text.split('-->').join('--&gt;')
  return `${FORK_CONTEXT_START}\n${escaped}\n${FORK_CONTEXT_END}`
}

/**
 * 从会话 Markdown 正文提取分叉点上下文区块内容（反转义）
 * 无区块时返回空串。
 */
export function extractForkContext(body: string): string {
  const start = body.indexOf(FORK_CONTEXT_START)
  if (start === -1) return ''
  const end = body.indexOf(FORK_CONTEXT_END, start)
  if (end === -1) return ''
  return body
    .slice(start + FORK_CONTEXT_START.length, end)
    .trim()
    .split('--&gt;')
    .join('-->')
}

/** 移除正文中的分叉点上下文区块（解析消息前调用，避免区块内容被当作消息） */
function removeForkContextBlock(body: string): string {
  const start = body.indexOf(FORK_CONTEXT_START)
  if (start === -1) return body
  const end = body.indexOf(FORK_CONTEXT_END, start)
  if (end === -1) return body
  return body.slice(0, start) + body.slice(end + FORK_CONTEXT_END.length)
}

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
export function parseMessages(body: string, upToIndex: number): Message[] {
  const messages: Message[] = []
  // 移除正文开头的分叉点上下文区块，避免其内容被解析为消息
  const lines = removeForkContextBlock(body).split('\n')
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
      // 跳过 AI 思考过程区块（thinking 以特殊标记持久化，不混入消息正文）
      if (line.startsWith(THINKING_START)) {
        i++
        while (i < lines.length && !lines[i].startsWith(THINKING_END)) i++
        // 跳过 THINKING_END 标记行本身，避免被当作消息正文
        if (i < lines.length) i++
        continue
      }
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

/** 附近文本的最大展示长度 */
const MAX_PREVIEW_LENGTH = 120

/**
 * 切分句子：以句末标点（。！？!?）或换行切分。
 *
 * markdown 消息中一行通常是一个语义单元（段落/列表项/标题），若只按句号切分，
 * 无标点的多行内容会被当成一整句，"以划线处为中心"定位会失效。
 */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[。！？!?])\s*|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
}

/** 取文本最后 count 句；超长时截断到 MAX_PREVIEW_LENGTH */
function lastSentences(text: string, count: number): string {
  const picked = splitSentences(text).slice(-count).join('\n')
  if (picked.length <= MAX_PREVIEW_LENGTH) return picked
  return `${picked.slice(0, MAX_PREVIEW_LENGTH)}…`
}

/** 移除常见 markdown 内联标记，用于渲染后文本与源文本的宽松匹配 */
function normalizeForMatch(text: string): string {
  return text
    .replace(/\*\*|\*|__|_|`|~~/g, '')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 定位包含划线文本的句子索引
 *
 * 划线文本来自 DOM（渲染后），可能跨 markdown 标记（如 **加粗**）导致源文本中
 * 找不到完整子串。先尝试原文匹配，失败后用移除标记后的宽松匹配兜底。
 */
function findHighlightSentence(sentences: string[], highlightedText: string): number {
  const normalized = normalizeForMatch(highlightedText)
  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i]
    if (sentence.includes(highlightedText)) return i
    if (normalized && normalizeForMatch(sentence).includes(normalized)) return i
  }
  return -1
}

/**
 * 在句子源文本中定位划线文本并包裹 `<mark class="fork-highlight">`。
 *
 * 划线文本来自 DOM（渲染后），源文本中可能被 markdown 内联标记（如 `**`）打断，
 * 原文直接匹配不到（如源为 `——**"富贵虾"**`、DOM 划线文本为 `——"富贵虾"`）。
 * 这种情况返回 null：分叉点上下文渲染后会由前端按 frontmatter 的 `fork_highlight`
 * 在 DOM 上跨节点包裹高亮（见 BranchChatPage），源文本里不插脏标签。
 */
function wrapHighlight(source: string, highlightedText: string): string | null {
  const direct = source.indexOf(highlightedText)
  if (direct === -1) return null
  return (
    source.slice(0, direct)
    + `<mark class="fork-highlight">${highlightedText}</mark>`
    + source.slice(direct + highlightedText.length)
  )
}

/**
 * 围绕划线文本展示其所在句子的上下各 count 句
 *
 * 划线文本缺失或无法定位（渲染后文本与 markdown 源不一致）时，
 * 退化为展示消息开头的若干句子。
 * 用 `wrapHighlight` 把划线文本包裹为 `<mark class="fork-highlight">`（原文匹配，
 * 或划线文本被标记打断时的宽松匹配），前端以 markdown 渲染并高亮标明。
 */
function aroundHighlight(content: string, highlightedText: string | undefined, count = 3): string {
  const sentences = splitSentences(content)
  if (sentences.length === 0) return content
  let targetIndex = -1
  if (highlightedText) {
    targetIndex = findHighlightSentence(sentences, highlightedText)
  }
  const start = targetIndex === -1 ? 0 : Math.max(0, targetIndex - count)
  const end = targetIndex === -1
    ? Math.min(sentences.length, count * 2 + 1)
    : targetIndex + count + 1
  const picked = sentences.slice(start, end)
  if (targetIndex !== -1 && targetIndex >= start && targetIndex < end) {
    const withinIndex = targetIndex - start
    const wrapped = wrapHighlight(picked[withinIndex], highlightedText as string)
    if (wrapped !== null) {
      picked[withinIndex] = wrapped
    }
  }
  return picked.join('\n')
}

/**
 * 构建分叉点上下文预览
 *
 * 展示划线内容上下各三句话（划线所在消息内），以及前一条消息的最后三句附近文本，
 * 用于分支对话页顶部的"分叉点上下文"区域。
 *
 * @param context - 分叉点前的会话消息（loadBranchContext 的返回值）
 * @param forkIndex - 划线所在消息的索引（分叉点）
 * @param highlightedText - 划线文本（用于在消息内定位划线内容）；缺失时退化为展示消息开头
 * @returns 预览文本；context 为空时返回空串
 */
export function buildForkContextPreview(
  context: Message[],
  forkIndex: number,
  highlightedText?: string,
): string {
  if (context.length === 0) return ''
  const targetIndex = Math.min(forkIndex, context.length - 1)
  const target = context[targetIndex]
  const prev = targetIndex > 0 ? context[targetIndex - 1] : null

  const roleLabel = (message: Message) => (message.role === 'user' ? '用户' : '知枝')
  const parts: string[] = []
  if (prev) {
    const prevText = lastSentences(prev.content, 3)
    if (prevText) parts.push(`（前一条 · ${roleLabel(prev)}）\n${prevText}`)
  }
  parts.push(`（划线内容 · ${roleLabel(target)}）\n${aroundHighlight(target.content, highlightedText)}`)
  return parts.join('\n\n')
}

/**
 * 剥离旧版本分支文件中内嵌的继承上下文副本
 *
 * 早期版本会把继承的分叉上下文一并保存进分支文件；新版本分支文件只保存
 * 分支自身的对话。加载时若发现 saved 开头与 inherited 完全一致，则剔除前缀，
 * 避免与注入 systemPrompt 的 fork_context 重复。
 *
 * @param saved - 分支文件中保存的消息
 * @param inherited - 继承的分叉点前上下文（forkMessages）
 * @returns 分支自身的对话消息
 */
export function stripInheritedContext(saved: Message[], inherited: Message[]): Message[] {
  if (inherited.length === 0 || saved.length < inherited.length) return saved
  const samePrefix = inherited.every(
    (message, index) => message.role === saved[index].role && message.content === saved[index].content,
  )
  return samePrefix ? saved.slice(inherited.length) : saved
}