/**
 * 分支追问执行器
 *
 * 在分支对话中，加载 SKILL.md 模板并注入分叉上下文、用户追问和相关笔记，
 * 调用 LLM 生成比主对话更深入的回答。
 */

import type { LLMProvider, Message, StreamChunk } from '../llm-provider'
import type { Note } from '../../types'
import { parseSkill, buildPrompt } from '../../skills/loader'
import { chatWithTools } from '../chat-loop'
import { CLIENT_TOOLS, type ToolContext } from '../tools'

// SKILL.md 内容（构建时内联）
import skillRaw from '../../skills/branch-followup/SKILL.md?raw'

/** 缓存解析后的 Skill 对象 */
let _skillCache: ReturnType<typeof parseSkill> | null = null

function getSkill() {
  if (!_skillCache) {
    _skillCache = parseSkill(skillRaw)
  }
  return _skillCache
}

/**
 * 将消息列表序列化为可读的文本表示
 */
function serializeMessages(messages: Message[]): string {
  return messages
    .map((msg) => {
      const roleLabel = msg.role === 'user' ? '用户' : msg.role === 'assistant' ? '知枝' : '系统'
      return `## ${roleLabel}\n${msg.content}`
    })
    .join('\n\n')
}

/**
 * 将相关笔记序列化为文本
 */
function serializeNotes(notes: Note[]): string {
  if (notes.length === 0) return '暂无相关笔记。'
  return notes
    .map(
      (note) =>
        `### ${note.title}\n类型: ${note.type}\n标签: ${note.tags.join(', ')}\n核心命题: ${note.content.slice(0, 200)}`,
    )
    .join('\n\n')
}

/**
 * 分支追问流式响应
 *
 * 分支会话与主会话同等地位：上下文 = 分叉点前的主会话历史（forkContext，
 * 注入 systemPrompt）+ 分支会话自身的对话历史（history，作为多轮消息传入）。
 *
 * @param question - 用户追问内容
 * @param forkContext - 分叉点前的主会话消息
 * @param history - 分支会话自身的对话历史（不含本次追问）
 * @param relatedNotes - 相关的笔记列表
 * @param provider - LLM 提供商
 * @param knowledgeContext - 可选的知识检索上下文（非空时拼接到 systemPrompt 之后）
 * @param toolContext - 工具执行上下文（vault 路径），支持 AI 按需读取参考资料全文
 * @param signal - 可选的中止信号（停止按钮/切换会话时后台中止由 chat-runner 管理）
 * @returns 流式响应迭代器
 */
export async function* branchFollowupStream(
  question: string,
  forkContext: Message[],
  history: Message[],
  relatedNotes: Note[],
  provider: LLMProvider,
  knowledgeContext?: string,
  toolContext?: ToolContext,
  signal?: AbortSignal,
): AsyncIterable<StreamChunk> {
  const skill = getSkill()
  let systemPrompt = buildPrompt(skill, {
    fork_context: serializeMessages(forkContext),
    user_question: question,
    related_notes: serializeNotes(relatedNotes),
  })
  if (knowledgeContext) {
    systemPrompt = `${systemPrompt}\n\n${knowledgeContext}`
  }

  const messages: Message[] = [
    ...history.map((message) => ({ ...message })),
    { role: 'user', content: question },
  ]

  try {
    for await (const chunk of chatWithTools({
      provider,
      messages,
      systemPrompt,
      tools: CLIENT_TOOLS,
      toolContext: toolContext || { vaultPath: '' },
      temperature: 0.7,
      maxTokens: 4096,
      signal,
    })) {
      yield chunk
    }
  } catch (e) {
    yield {
      type: 'error',
      content: `分支追问失败: ${(e as Error).message}`,
    }
  }
}