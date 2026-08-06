/**
 * Anthropic API 适配器
 * 实现 Anthropic Messages API 流式响应
 * 支持 tool_use / tool_result 客户端工具循环（DeepSeek Anthropic 兼容端点亦支持）
 */

import type { LLMProvider, Message, StreamChunk, ChatOptions, ToolCall } from './llm-provider'

const DEFAULT_ANTHROPIC_BASE_URL = 'https://api.anthropic.com'
const DEFAULT_MAX_TOKENS = 4096

/** 将内部消息转换为 Anthropic Messages 格式（system 由调用方单独处理） */
function toAnthropicMessages(messages: Message[]): Array<Record<string, unknown>> {
  const list: Array<Record<string, unknown>> = []
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    if (msg.role === 'tool') {
      // 将连续的 tool_result 合并为一条 user 消息（Anthropic 规范格式）
      const blocks: Array<Record<string, unknown>> = [
        { type: 'tool_result', tool_use_id: msg.toolCallId, content: msg.content },
      ]
      while (i + 1 < messages.length && messages[i + 1].role === 'tool') {
        const next = messages[++i]
        blocks.push({ type: 'tool_result', tool_use_id: next.toolCallId, content: next.content })
      }
      list.push({ role: 'user', content: blocks })
    } else if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
      const content: Array<Record<string, unknown>> = []
      if (msg.content) content.push({ type: 'text', text: msg.content })
      for (const tc of msg.toolCalls) {
        content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.arguments })
      }
      list.push({ role: 'assistant', content })
    } else {
      list.push({ role: msg.role, content: msg.content })
    }
  }
  return list
}

/** 流式累积的 tool_use 块（Anthropic 按 content index 分片到达） */
interface AccumulatedToolUse {
  index: number
  id: string
  name: string
  inputStr: string
}

function finishToolUses(accs: AccumulatedToolUse[]): ToolCall[] {
  return [...accs]
    .sort((a, b) => a.index - b.index)
    .map((acc) => {
      let args: Record<string, unknown> = {}
      try {
        args = acc.inputStr ? (JSON.parse(acc.inputStr) as Record<string, unknown>) : {}
      } catch {
        args = {}
      }
      return { id: acc.id || `toolu_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, name: acc.name, arguments: args }
    })
}

export class AnthropicProvider implements LLMProvider {
  private apiKey: string
  private baseUrl: string
  private defaultModel: string

  constructor(apiKey: string, baseUrl?: string, defaultModel?: string) {
    this.apiKey = apiKey
    this.baseUrl = baseUrl || DEFAULT_ANTHROPIC_BASE_URL
    this.defaultModel = defaultModel || 'claude-sonnet-4-6'
  }

  async *chat(
    messages: Message[],
    options?: ChatOptions,
  ): AsyncIterable<StreamChunk> {
    const { model = this.defaultModel, maxTokens = DEFAULT_MAX_TOKENS, systemPrompt, signal, enableWebSearch, tools = [] } = options || {}

    // 分离 system 消息和非 system 消息
    const systemMessages = messages
      .filter(m => m.role === 'system')
      .map(m => m.content)
      .join('\n\n')

    const nonSystemMessages = messages.filter(m => m.role !== 'system')

    // 构建请求体
    const body: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      messages: toAnthropicMessages(nonSystemMessages),
      stream: true,
    }

    if (systemPrompt || systemMessages) {
      body.system = systemPrompt || systemMessages
    }

    // 工具：客户端工具（input_schema）+ 联网搜索（服务端 web_search 工具）
    const apiTools: Array<Record<string, unknown>> = []
    if (tools.length > 0) {
      apiTools.push(
        ...tools.map(t => ({
          name: t.name,
          description: t.description,
          input_schema: t.parameters,
        })),
      )
    }
    if (enableWebSearch) {
      apiTools.push({ type: 'web_search_20250305', name: 'web_search', max_uses: 3 })
    }
    if (apiTools.length > 0) {
      body.tools = apiTools
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
      // 流式累积 tool_use 块
      const toolUses: AccumulatedToolUse[] = []
      const toolUseByIndex = new Map<number, AccumulatedToolUse>()

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

          let event: Record<string, unknown>
          try {
            event = JSON.parse(dataStr)
          } catch {
            // 跳过无法解析的 SSE 行
            continue
          }

          switch (event.type) {
            case 'content_block_start': {
              const block = event.content_block as Record<string, unknown> | undefined
              if (block?.type === 'tool_use') {
                const acc: AccumulatedToolUse = {
                  index: event.index as number,
                  id: (block.id as string) || '',
                  name: (block.name as string) || '',
                  inputStr: '',
                }
                toolUses.push(acc)
                toolUseByIndex.set(acc.index, acc)
              }
              break
            }
            case 'content_block_delta': {
              const delta = event.delta as Record<string, unknown> | undefined
              if (delta?.type === 'input_json_delta') {
                const acc = toolUseByIndex.get(event.index as number)
                if (acc) acc.inputStr += (delta.partial_json as string) || ''
              } else if (delta?.type === 'text_delta') {
                yield { type: 'text', content: (delta.text as string) || '' }
              } else if (delta?.type === 'thinking_delta') {
                yield { type: 'thinking', content: (delta.thinking as string) || '' }
              }
              break
            }
            case 'message_stop':
              // 若有工具调用，stop 由流结束后统一上报，避免重复
              if (toolUses.length === 0) yield { type: 'stop', content: '' }
              break
          }
        }
      }

      // 流结束：若模型发起了工具调用，交给上层执行
      if (toolUses.length > 0) {
        const calls = finishToolUses(toolUses)
        for (const tc of calls) {
          yield { type: 'tool_call', content: '', toolCall: tc }
        }
        yield { type: 'stop', content: '' }
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
