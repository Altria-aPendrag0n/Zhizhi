/**
 * LLM 适配器接口定义
 * 所有 LLM 提供商（Anthropic、OpenAI 兼容等）都应实现此接口
 */

// 消息角色
export type MessageRole = 'system' | 'user' | 'assistant'

// 单条消息
export interface Message {
  role: MessageRole
  content: string
}

// 流式响应块类型
export type StreamChunkType = 'text' | 'stop' | 'error' | 'thinking'

// 流式响应块
export interface StreamChunk {
  type: StreamChunkType
  content: string
}

// 聊天选项
export interface ChatOptions {
  model?: string
  maxTokens?: number
  temperature?: number
  systemPrompt?: string
  signal?: AbortSignal
}

// LLM 提供商接口
export interface LLMProvider {
  /** 发送消息并返回流式响应 */
  chat(messages: Message[], options?: ChatOptions): AsyncIterable<StreamChunk>
}