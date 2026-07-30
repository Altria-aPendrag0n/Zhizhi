// LLM 适配器相关类型
import type { Message, StreamChunk, ChatOptions, ProviderConfig } from './index'

// LLMProvider 接口：所有 LLM 适配器必须实现此接口
export interface LLMProvider {
  /** 发送消息并返回流式响应 */
  chat(messages: Message[], options?: ChatOptions): AsyncIterable<StreamChunk>
}

// 重新导出常用类型，方便 api 模块统一导入
export type { Message, StreamChunk, ChatOptions, ProviderConfig }