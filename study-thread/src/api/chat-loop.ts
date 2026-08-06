/**
 * 工具调用循环（agentic chat）
 *
 * 借鉴 qwen-code 的思路：先给模型检索摘要判断相关性，模型确认需要
 * 详细阅读时发起工具调用（如 read_reference 分页读取全文），
 * 客户端执行工具后将结果追加为 tool 消息，继续请求模型，直至模型
 * 给出最终回答。
 */

import type { LLMProvider, Message, StreamChunk, ToolCall, ToolDefinition } from './llm-provider'
import { executeClientTool, MAX_TOOL_ROUNDS, type ToolContext } from './tools'

export interface ChatLoopOptions {
  provider: LLMProvider
  /** 对话历史（不含 system，systemPrompt 单独传入） */
  messages: Message[]
  systemPrompt?: string
  /** 客户端工具列表（随请求体发送，模型可发起调用） */
  tools?: ToolDefinition[]
  /** 工具执行上下文（vault 路径等） */
  toolContext: ToolContext
  model?: string
  signal?: AbortSignal
  enableWebSearch?: boolean
  temperature?: number
  maxTokens?: number
  /** 工具调用轮次上限，默认 MAX_TOOL_ROUNDS */
  maxRounds?: number
}

/**
 * 带工具调用的聊天流式循环
 *
 * - 模型流式输出期间，tool_call chunk 被拦截累积（不直接透传）
 * - 一轮结束且存在工具调用 → 执行工具 → 结果作为 tool 消息回传 → 下一轮
 * - 无工具调用 → 透传最终回答并结束
 * - tool_call / tool_result chunk 也会透传给调用方（供 UI 展示过程）
 */
export async function* chatWithTools(
  options: ChatLoopOptions,
): AsyncIterable<StreamChunk> {
  const {
    provider,
    messages,
    systemPrompt,
    tools,
    toolContext,
    model,
    signal,
    enableWebSearch,
    temperature,
    maxTokens,
    maxRounds = MAX_TOOL_ROUNDS,
  } = options

  const history: Message[] = [...messages]

  for (let round = 0; round < maxRounds; round++) {
    const pendingCalls: ToolCall[] = []

    for await (const chunk of provider.chat(history, {
      model,
      signal,
      systemPrompt,
      enableWebSearch,
      tools,
      temperature,
      maxTokens,
    })) {
      if (chunk.type === 'tool_call' && chunk.toolCall) {
        pendingCalls.push(chunk.toolCall)
      } else if (chunk.type === 'stop' && pendingCalls.length > 0) {
        // 本轮以工具调用结束：stop 由循环内部处理（执行工具后进入下一轮），
        // 不透传给上层，避免上层在工具执行前就收尾保存消息
        continue
      } else {
        yield chunk
      }
    }

    // 模型本轮没有发起工具调用：已给出最终回答，结束循环
    if (pendingCalls.length === 0) return

    // 记录 assistant 消息（含工具调用），供下一轮携带
    history.push({ role: 'assistant', content: '', toolCalls: pendingCalls })

    // 依次执行工具并回传结果
    for (const call of pendingCalls) {
      const result = await executeClientTool(call.name, call.arguments, toolContext)
      yield { type: 'tool_result', content: result }
      history.push({ role: 'tool', content: result, toolCallId: call.id })
    }
  }

  // 达到轮次上限仍未收敛，提示错误
  yield { type: 'error', content: `工具调用轮次超过上限（${maxRounds}），已停止，请重试或简化问题。` }
}
