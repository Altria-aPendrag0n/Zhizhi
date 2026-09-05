/**
 * 分支追问执行器
 *
 * 在分支对话中，加载 SKILL.md 模板并注入分叉上下文、用户追问和相关笔记，
 * 调用 LLM 生成比主对话更深入的回答。
 */

import type { LLMProvider, Message, StreamChunk, ToolDefinition } from '../llm-provider'
import type { Note } from '../../types'
import { parseSkill, buildPrompt } from '../../skills/loader'
import { chatWithTools } from '../chat-loop'
import { CLIENT_TOOLS, type ToolContext } from '../tools'
import { GUIDE_PROMPT_SECTION } from '../../utils/chat-prompts'

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
 * @param guideMode - 可选的引导模式开关（v0.3.1：开启时在 SKILL 模板注入引导策略段）
 * @param toolContext - 工具执行上下文（vault 路径），支持 AI 按需读取参考资料全文
 * @param signal - 可选的中止信号（停止按钮/切换会话时后台中止由 chat-runner 管理）
 * @param tools - 可选的自定义工具列表（联网搜索子代理开启时由调用方传入含 web_search 的列表）
 * @returns 流式响应迭代器
 */
export async function* branchFollowupStream(
  question: string,
  forkContext: Message[],
  history: Message[],
  relatedNotes: Note[],
  provider: LLMProvider,
  knowledgeContext?: string,
  guideMode?: boolean,
  toolContext?: ToolContext,
  signal?: AbortSignal,
  tools?: ToolDefinition[],
): AsyncIterable<StreamChunk> {
  const skill = getSkill()
  let systemPrompt = buildPrompt(skill, {
    fork_context: serializeMessages(forkContext),
    user_question: question,
    related_notes: serializeNotes(relatedNotes),
    // 引导模式：注入引导策略段；关闭时替换为空串（占位符必须显式解析，避免 DEV 残留报错）
    guide_mode: guideMode ? GUIDE_PROMPT_SECTION : '',
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
      // 联网搜索子代理开启时追加 web_search 客户端工具（v0.3.1，与主会话一致）
      tools: tools ?? CLIENT_TOOLS,
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