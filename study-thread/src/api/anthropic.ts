/**
 * Anthropic API 适配器
 * 实现 Anthropic Messages API 流式响应
 */

import type { LLMProvider, Message, StreamChunk, ChatOptions } from './llm-provider'

const DEFAULT_ANTHROPIC_BASE_URL = 'https://api.anthropic.com'
const DEFAULT_MAX_TOKENS = 4096

export class AnthropicProvider implements LLMProvider {
  private apiKey: string
  private baseUrl: string

  constructor(apiKey: string, baseUrl?: string) {
    this.apiKey = apiKey
    this.baseUrl = baseUrl || DEFAULT_ANTHROPIC_BASE_URL
  }

  async *chat(
    messages: Message[],
    options?: ChatOptions,
  ): AsyncIterable<StreamChunk> {
    const { model = 'claude-sonnet-4-6', maxTokens = DEFAULT_MAX_TOKENS, systemPrompt, signal } = options || {}

    // 分离 system 消息和非 system 消息
    const systemMessages = messages
      .filter(m => m.role === 'system')
      .map(m => m.content)
      .join('\n\n')

    const nonSystemMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role, content: m.content }))

    // 构建请求体
    const body: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      messages: nonSystemMessages,
      stream: true,
    }

    if (systemPrompt || systemMessages) {
      body.system = systemPrompt || systemMessages
    }

    try {
      const response = await fetch(`${this.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal,
      })

      if (!response.ok) {
        const errorText = await response.text()
        yield { type: 'error', content: `Anthropic API 错误 (${response.status}): ${errorText}` }
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
        // 保留最后一个可能不完整的行
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue

          const dataStr = trimmed.slice(6)
          if (dataStr === '[DONE]') continue

          try {
            const event = JSON.parse(dataStr)

            switch (event.type) {
              case 'message_start':
                // 消息开始，无操作
                break

              case 'content_block_start':
                // 内容块开始，无操作
                break

              case 'content_block_delta':
                if (event.delta?.type === 'text_delta') {
                  yield { type: 'text', content: event.delta.text }
                } else if (event.delta?.type === 'thinking_delta') {
                  yield { type: 'thinking', content: event.delta.thinking }
                }
                break

              case 'message_delta':
                // 消息结束，包含 stop_reason 和 usage
                break

              case 'message_stop':
                yield { type: 'stop', content: '' }
                break
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