import { describe, it, expect, vi, afterEach } from 'vitest'
import { AnthropicProvider } from './anthropic'
import type { Message, ToolDefinition } from './llm-provider'

/** 构造一个 SSE 响应体（data: 行序列） */
function sseBody(events: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const chunks = events.map((e) => encoder.encode(`data: ${e}\n\n`))
  return new ReadableStream({
    start(controller) {
      chunks.forEach((c) => controller.enqueue(c))
      controller.close()
    },
  })
}

function jsonResponse(status: number, body: ReadableStream<Uint8Array>) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

async function collect(provider: AnthropicProvider, messages: Message[], options?: { enableWebSearch?: boolean; model?: string; tools?: ToolDefinition[] }) {
  const chunks: string[] = []
  for await (const chunk of provider.chat(messages, options)) {
    chunks.push(`${chunk.type}:${chunk.content}`)
  }
  return chunks
}

const messages: Message[] = [{ role: 'user', content: '你好' }]

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AnthropicProvider', () => {
  it('enableWebSearch 时请求体附带 web_search_20250305 工具', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, sseBody([
        JSON.stringify({ type: 'message_start', message: { id: 'm1' } }),
        JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
        JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '你好' } }),
        JSON.stringify({ type: 'content_block_stop', index: 0 }),
        JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn' } }),
        JSON.stringify({ type: 'message_stop' }),
      ])),
    )
    vi.stubGlobal('fetch', fetchMock)

    const provider = new AnthropicProvider('key', 'https://api.deepseek.com/anthropic', 'deepseek-v4-flash')
    const chunks = await collect(provider, messages, { enableWebSearch: true })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.deepseek.com/anthropic/v1/messages')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.tools).toEqual([{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }])
    expect(body.model).toBe('deepseek-v4-flash')
    expect(chunks).toContain('text:你好')
    expect(chunks).toContain('stop:')
  })

  it('enableWebSearch 关闭（或不传）时请求体无 tools', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, sseBody([
        JSON.stringify({ type: 'message_start', message: { id: 'm1' } }),
        JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
        JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '你好' } }),
        JSON.stringify({ type: 'content_block_stop', index: 0 }),
        JSON.stringify({ type: 'message_stop' }),
      ])),
    )
    vi.stubGlobal('fetch', fetchMock)

    const provider = new AnthropicProvider('key', 'https://api.anthropic.com')
    await collect(provider, messages)

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.tools).toBeUndefined()
  })

  it('流式解析：thinking_delta 与 text_delta 分别输出', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, sseBody([
        JSON.stringify({ type: 'message_start', message: { id: 'm1' } }),
        JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } }),
        JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: '思考中' } }),
        JSON.stringify({ type: 'content_block_stop', index: 0 }),
        JSON.stringify({ type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } }),
        JSON.stringify({ type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: '回答' } }),
        JSON.stringify({ type: 'content_block_stop', index: 1 }),
        JSON.stringify({ type: 'message_stop' }),
      ])),
    )
    vi.stubGlobal('fetch', fetchMock)

    const provider = new AnthropicProvider('key', 'https://api.anthropic.com')
    const chunks = await collect(provider, messages)

    expect(chunks).toContain('thinking:思考中')
    expect(chunks).toContain('text:回答')
    expect(chunks).toContain('stop:')
  })

  it('web 搜索的服务端工具块（server_tool_use / web_search_tool_result）被跳过且文本正常输出', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, sseBody([
        JSON.stringify({ type: 'message_start', message: { id: 'm1' } }),
        JSON.stringify({
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'server_tool_use', id: 'toolu_1', name: 'web_search', input: { query: '测试' } },
        }),
        JSON.stringify({ type: 'content_block_stop', index: 0 }),
        JSON.stringify({ type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } }),
        JSON.stringify({ type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: '搜索后的回答' } }),
        JSON.stringify({ type: 'content_block_stop', index: 1 }),
        JSON.stringify({ type: 'content_block_start', index: 2, content_block: { type: 'web_search_tool_result', tool_use_id: 'toolu_1' } }),
        JSON.stringify({ type: 'content_block_delta', index: 2, delta: { type: 'text_delta', text: '[来源] 示例链接' } }),
        JSON.stringify({ type: 'content_block_stop', index: 2 }),
        JSON.stringify({ type: 'message_stop' }),
      ])),
    )
    vi.stubGlobal('fetch', fetchMock)

    const provider = new AnthropicProvider('key', 'https://api.deepseek.com/anthropic', 'deepseek-v4-flash')
    const chunks = await collect(provider, messages, { enableWebSearch: true })

    expect(chunks).toContain('text:搜索后的回答')
    expect(chunks).toContain('stop:')
    expect(chunks.some((c) => c.startsWith('error:'))).toBe(false)
  })

  it('传 tools 时请求体附带 input_schema 工具', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, sseBody([
        JSON.stringify({ type: 'message_start', message: { id: 'm1' } }),
        JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
        JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '回答' } }),
        JSON.stringify({ type: 'content_block_stop', index: 0 }),
        JSON.stringify({ type: 'message_stop' }),
      ])),
    )
    vi.stubGlobal('fetch', fetchMock)

    const provider = new AnthropicProvider('key', 'https://api.anthropic.com')
    await collect(provider, messages, {
      tools: [{ name: 'read_reference', description: '读取参考资料', parameters: { type: 'object', properties: { reference_id: { type: 'string' } } } }],
    })

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.tools).toEqual([
      {
        name: 'read_reference',
        description: '读取参考资料',
        input_schema: { type: 'object', properties: { reference_id: { type: 'string' } } },
      },
    ])
  })

  it('流式 tool_use 解析后 yield tool_call chunk', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, sseBody([
        JSON.stringify({ type: 'message_start', message: { id: 'm1' } }),
        JSON.stringify({
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'tool_use', id: 'toolu_1', name: 'read_reference', input: {} },
        }),
        JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"reference_id"' } }),
        JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: ':"ref-1"}' } }),
        JSON.stringify({ type: 'content_block_stop', index: 0 }),
        JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'tool_use' } }),
        JSON.stringify({ type: 'message_stop' }),
      ])),
    )
    vi.stubGlobal('fetch', fetchMock)

    const provider = new AnthropicProvider('key', 'https://api.anthropic.com')
    const chunks: Array<{ type: string; content: string; toolCall?: unknown }> = []
    for await (const chunk of provider.chat(messages)) {
      chunks.push(chunk)
    }

    const toolCall = chunks.find((c) => c.type === 'tool_call')
    expect(toolCall).toBeDefined()
    expect((toolCall?.toolCall as { name: string }).name).toBe('read_reference')
    expect((toolCall?.toolCall as { arguments: Record<string, unknown> }).arguments).toEqual({ reference_id: 'ref-1' })
    // 有工具调用时不重复输出 stop（由流结束统一上报）
    expect(chunks.filter((c) => c.type === 'stop')).toHaveLength(1)
  })

  it('tool 角色消息转换为 user 消息（tool_result 块）', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, sseBody([
        JSON.stringify({ type: 'message_start', message: { id: 'm1' } }),
        JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
        JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '回答' } }),
        JSON.stringify({ type: 'content_block_stop', index: 0 }),
        JSON.stringify({ type: 'message_stop' }),
      ])),
    )
    vi.stubGlobal('fetch', fetchMock)

    const provider = new AnthropicProvider('key', 'https://api.anthropic.com')
    const toolMessages: Message[] = [
      { role: 'assistant', content: '中间文本', toolCalls: [{ id: 'toolu_1', name: 'read_reference', arguments: { reference_id: 'ref-1' } }] },
      { role: 'tool', content: '工具结果', toolCallId: 'toolu_1' },
    ]
    await collect(provider, toolMessages)

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.messages[0]).toEqual({
      role: 'assistant',
      content: [
        { type: 'text', text: '中间文本' },
        { type: 'tool_use', id: 'toolu_1', name: 'read_reference', input: { reference_id: 'ref-1' } },
      ],
    })
    expect(body.messages[1]).toEqual({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: '工具结果' }],
    })
  })
})
