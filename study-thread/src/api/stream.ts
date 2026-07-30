/**
 * 流式响应工具
 * 封装 LLM 流式响应的错误处理和 AbortController
 */

import type { LLMProvider, Message, StreamChunk, ChatOptions } from './llm-provider'

/**
 * 流式聊天：封装 provider.chat，统一错误处理
 * @param provider LLM 提供商实例
 * @param messages 消息列表
 * @param options 聊天选项
 */
export async function* streamChat(
  provider: LLMProvider,
  messages: Message[],
  options?: ChatOptions,
): AsyncIterable<StreamChunk> {
  try {
    for await (const chunk of provider.chat(messages, options)) {
      yield chunk
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    yield { type: 'error', content: message }
  }
}

/**
 * 创建 AbortController 用于停止生成
 * @returns 新的 AbortController 实例
 */
export function createAbortController(): AbortController {
  return new AbortController()
}