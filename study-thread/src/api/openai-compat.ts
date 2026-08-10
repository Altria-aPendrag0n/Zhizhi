/**
 * OpenAI-Compatible API 适配器
 * 实现 OpenAI Chat Completions 兼容 API 流式响应
 * 支持 OpenAI、DeepSeek、通义千问、智谱、Ollama 等兼容服务商
 * 支持 function calling（客户端执行工具循环）
 */

import type { LLMProvider, Message, StreamChunk, ChatOptions, ToolCall, ToolDefinition } from './llm-provider'

const DEFAULT_MAX_TOKENS = 4096

/** 服务商预设 */
export const PROVIDER_PRESETS: Record<string, { baseUrl: string; defaultModel: string }> = {
  openai: { baseUrl: 'https://api.openai.com', defaultModel: 'gpt-4o' },
  deepseek: { baseUrl: 'https://api.deepseek.com', defaultModel: 'deepseek-v4-flash' },
  qwen: { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode', defaultModel: 'qwen-plus' },
  zhipu: { baseUrl: 'https://open.bigmodel.cn/api/paas', defaultModel: 'glm-4-flash' },
  ollama: { baseUrl: 'http://localhost:11434', defaultModel: 'llama3' },
}

/** 单次请求的尝试配置 */
interface AttemptConfig {
  withWebSearch: boolean
  withClientTools: boolean
}

/** 将内部消息转换为 OpenAI Chat Completions 格式 */
function toApiMessages(
  messages: Message[],
  systemPrompt?: string,
): Array<Record<string, unknown>> {
  const list: Array<Record<string, unknown>> = []
  if (systemPrompt) {
    list.push({ role: 'system', content: systemPrompt })
  }
  for (const msg of messages) {
    if (msg.role === 'tool') {
      list.push({ role: 'tool', tool_call_id: msg.toolCallId, content: msg.content })
    } else if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
      list.push({
        role: 'assistant',
        content: msg.content || null,
        tool_calls: msg.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        })),
      })
    } else {
      list.push({ role: msg.role, content: msg.content })
    }
  }
  return list
}

/** 构建请求尝试序列：带 web_search+工具 → 仅客户端工具 → 无工具 */
function buildAttempts(enableWebSearch: boolean, tools: ToolDefinition[]): AttemptConfig[] {
  const attempts: AttemptConfig[] = []
  if (enableWebSearch && tools.length > 0) attempts.push({ withWebSearch: true, withClientTools: true })
  if (enableWebSearch && tools.length === 0) attempts.push({ withWebSearch: true, withClientTools: false })
  if (tools.length > 0) attempts.push({ withWebSearch: false, withClientTools: true })
  attempts.push({ withWebSearch: false, withClientTools: false })
  return attempts
}

/** 将 function 工具转换为 OpenAI tools 格式 */
function toOpenAITools(tools: ToolDefinition[]): Array<Record<string, unknown>> {
  return tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }))
}

/** 流式累积的 tool_calls（OpenAI 分片到达） */
interface AccumulatedToolCall {
  id: string
  name: string
  argsStr: string
}

function finishToolCalls(accs: Map<number, AccumulatedToolCall>): ToolCall[] {
  return [...accs.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, acc]) => {
      let args: Record<string, unknown> = {}
      try {
        args = acc.argsStr ? (JSON.parse(acc.argsStr) as Record<string, unknown>) : {}
      } catch {
        args = {}
      }
      return { id: acc.id || `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, name: acc.name, arguments: args }
    })
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
    const { model = this.defaultModel, maxTokens = DEFAULT_MAX_TOKENS, systemPrompt, signal, enableWebSearch = false, tools = [], disableThinking = false } = options || {}

    const apiMessages = toApiMessages(messages, systemPrompt)
    const attempts = buildAttempts(enableWebSearch, tools)
    let lastError = ''

    for (const attempt of attempts) {
      const body: Record<string, unknown> = {
        model,
        messages: apiMessages,
        stream: true,
        max_tokens: maxTokens,
      }
      // 显式禁用思考模式（DeepSeek V4-Flash 等默认开启思考，与正文共用 maxTokens 预算，
      // 出题/摘录等需要稳定 JSON 输出时思考过长会把正文挤空）
      if (disableThinking) {
        body.thinking = { type: 'disabled' }
      }
      if (attempt.withWebSearch) {
        body.tools = [{ type: 'web_search' }]
      }
      if (attempt.withClientTools) {
        body.tools = [...(attempt.withWebSearch ? [{ type: 'web_search' }] : []), ...toOpenAITools(tools)]
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
          // 带工具的请求因服务端不支持而失败（典型 400/404）→ 降级重发更简单的请求
          if ((attempt.withWebSearch || attempt.withClientTools) && (response.status === 400 || response.status === 404)) {
            lastError = errorText
            console.warn(`[openai-compat] 工具请求不被支持（${response.status}），降级为更简单的请求重试`)
            continue
          }
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
        // 流式累积工具调用（function name/arguments 分片到达）
        const toolAccs = new Map<number, AccumulatedToolCall>()

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
            if (dataStr === '[DONE]') continue

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

              // 累积工具调用分片
              if (delta?.tool_calls) {
                for (const call of delta.tool_calls) {
                  const idx = call.index ?? 0
                  let acc = toolAccs.get(idx)
                  if (!acc) {
                    acc = { id: '', name: '', argsStr: '' }
                    toolAccs.set(idx, acc)
                  }
                  if (call.id) acc.id += call.id
                  if (call.function?.name) acc.name += call.function.name
                  if (call.function?.arguments) acc.argsStr += call.function.arguments
                }
              }
            } catch {
              // 跳过无法解析的 SSE 行
            }
          }
        }

        // 流结束：若模型发起了客户端工具调用，交给上层执行
        if (toolAccs.size > 0) {
          const calls = finishToolCalls(toolAccs)
          for (const tc of calls) {
            yield { type: 'tool_call', content: '', toolCall: tc }
          }
          yield { type: 'stop', content: '' }
        } else {
          yield { type: 'stop', content: '' }
        }
        return
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          yield { type: 'stop', content: '' }
          return
        }
        const message = error instanceof Error ? error.message : String(error)
        yield { type: 'error', content: `请求失败: ${message}` }
        return
      }
    }

    // 所有尝试均失败（理论上不会走到这里，因为最后一次无工具尝试失败会直接 yield error）
    yield { type: 'error', content: `请求失败: ${lastError || '未知错误'}` }
  }
}
