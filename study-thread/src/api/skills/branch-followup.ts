/**
 * 分支追问执行器
 *
 * 在分支对话中，加载 SKILL.md 模板并注入分叉上下文、用户追问和相关笔记，
 * 调用 LLM 生成比主对话更深入的回答。
 */

import type { LLMProvider, Message, StreamChunk } from '../llm-provider'
import type { Note } from '../../types'
import { parseSkill, buildPrompt } from '../../skills/loader'

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
 * @param question - 用户追问内容
 * @param forkContext - 分叉点前的对话消息
 * @param relatedNotes - 相关的笔记列表
 * @param provider - LLM 提供商
 * @returns 流式响应迭代器
 */
export async function* branchFollowupStream(
  question: string,
  forkContext: Message[],
  relatedNotes: Note[],
  provider: LLMProvider,
): AsyncIterable<StreamChunk> {
  const skill = getSkill()
  const systemPrompt = buildPrompt(skill, {
    fork_context: serializeMessages(forkContext),
    user_question: question,
    related_notes: serializeNotes(relatedNotes),
  })

  const messages: Message[] = [
    { role: 'user', content: question },
  ]

  try {
    for await (const chunk of provider.chat(messages, {
      systemPrompt,
      temperature: 0.7,
      maxTokens: 4096,
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