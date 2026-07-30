/**
 * OpenAI-Compatible API 适配器
 * 实现 OpenAI Chat Completions 兼容 API 流式响应
 * 支持 OpenAI、DeepSeek、通义千问、智谱、Ollama 等兼容服务商
 */

import type { LLMProvider, Message, StreamChunk, ChatOptions } from './llm-provider'

const DEFAULT_MAX_TOKENS = 4096

/** 服务商预设 */
export const PROVIDER_PRESETS: Record<string, { baseUrl: string; defaultModel: string }> = {
  openai: { baseUrl: 'https://api.openai.com', defaultModel: 'gpt-4o' },
  deepseek: { baseUrl: 'https://api.deepseek.com', defaultModel: 'deepseek-chat' },
  qwen: { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode', defaultModel: 'qwen-plus' },
  zhipu: { baseUrl: 'https://open.bigmodel.cn/api/paas', defaultModel: 'glm-4-flash' },
  ollama: { baseUrl: 'http://localhost:11434', defaultModel: 'llama3' },
}

export class OpenAICompatProvider implements LLMProvider {
  private apiKey: string
  private baseUrl: string
  private defaultModel: string

  constructor(apiKey: string, baseUrl: string, defaultModel: string) {
    this.apiKey = apiKey
    this.baseUrl = baseUrl
    this.defaultModel = defaultModel
  }

  async *chat(
    messages: Message[],
    options?: ChatOptions,
  ): AsyncIterable<StreamChunk> {
    const { model = this.defaultModel, maxTokens = DEFAULT_MAX_TOKENS, systemPrompt, signal } = options || {}

    // 构建消息列表：system prompt 作为 messages[0]
    const apiMessages: Array<{ role: string; content: string }> = []

    if (systemPrompt) {
      apiMessages.push({ role: 'system', content: systemPrompt })
    }

    // 添加对话消息（保留 system 角色消息，转换为 OpenAI 格式）
    for (const msg of messages) {
      apiMessages.push({ role: msg.role, content: msg.content })
    }

    const body: Record<string, unknown> = {
      model,
      messages: apiMessages,
      stream: true,
      max_tokens: maxTokens,
    }

    try {
      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal,
      })

      if (!response.ok) {
        const errorText = await response.text()
        yield { type: 'error', content: `API 错误 (${response.status}): ${errorText}` }
        return
      }

      const reader = response.body?.getReader()
      if (!reader) {
        yield { type: 'error', content: '无法读取响应流' }
        return
      }

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue

          const dataStr = trimmed.slice(6)
          if (dataStr === '[DONE]') {
            yield { type: 'stop', content: '' }
            continue
          }

          try {
            const event = JSON.parse(dataStr)
            const choice = event.choices?.[0]
            if (!choice) continue

            const delta = choice.delta

            // 处理文本内容
            if (delta?.content) {
              yield { type: 'text', content: delta.content }
            }

            // 处理思考内容（DeepSeek 等国产模型的 reasoning_content）
            if (delta?.reasoning_content) {
              yield { type: 'thinking', content: delta.reasoning_content }
            }

            // 处理结束
            if (choice.finish_reason === 'stop' || choice.finish_reason === 'length') {
              yield { type: 'stop', content: '' }
            }
          } catch {
            // 跳过无法解析的 SSE 行
          }
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        yield { type: 'stop', content: '' }
        return
      }
      const message = error instanceof Error ? error.message : String(error)
      yield { type: 'error', content: `请求失败: ${message}` }
    }
  }
}