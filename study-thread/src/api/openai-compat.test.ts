import { describe, it, expect, vi, afterEach } from 'vitest'
import { OpenAICompatProvider } from './openai-compat'
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

async function collect(provider: OpenAICompatProvider, messages: Message[], options?: { enableWebSearch?: boolean; tools?: ToolDefinition[]; disableThinking?: boolean }) {
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

describe('OpenAICompatProvider', () => {
  it('enableWebSearch 时请求体附带 tools web_search', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, sseBody([
        JSON.stringify({ choices: [{ delta: { content: '你好' } }] }),
        JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] }),
        '[DONE]',
      ])),
    )
    vi.stubGlobal('fetch', fetchMock)

    const provider = new OpenAICompatProvider('key', 'https://api.deepseek.com', 'deepseek-v4-flash')
    await collect(provider, messages, { enableWebSearch: true })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.deepseek.com/v1/chat/completions')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.tools).toEqual([{ type: 'web_search' }])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('enableWebSearch 关闭时请求体无 tools', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, sseBody([
        JSON.stringify({ choices: [{ delta: { content: '你好' } }] }),
        JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] }),
        '[DONE]',
      ])),
    )
    vi.stubGlobal('fetch', fetchMock)

    const provider = new OpenAICompatProvider('key', 'https://api.deepseek.com', 'deepseek-v4-flash')
    await collect(provider, messages, { enableWebSearch: false })

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.tools).toBeUndefined()
  })

  it('disableThinking 时请求体附带 thinking disabled（防止思考挤空正文）', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, sseBody([
        JSON.stringify({ choices: [{ delta: { content: '你好' } }] }),
        '[DONE]',
      ])),
    )
    vi.stubGlobal('fetch', fetchMock)

    const provider = new OpenAICompatProvider('key', 'https://api.deepseek.com', 'deepseek-v4-flash')
    await collect(provider, messages, { disableThinking: true })

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.thinking).toEqual({ type: 'disabled' })
  })

  it('默认（不传 enableWebSearch）请求体无 tools', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, sseBody([
        JSON.stringify({ choices: [{ delta: { content: '你好' } }] }),
        '[DONE]',
      ])),
    )
    vi.stubGlobal('fetch', fetchMock)

    const provider = new OpenAICompatProvider('key', 'https://api.deepseek.com', 'deepseek-v4-flash')
    await collect(provider, messages)

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.tools).toBeUndefined()
  })

  it('带 tools 请求 4xx 时自动降级重发普通请求并正常输出', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('tools unsupported', { status: 400 }))
      .mockResolvedValueOnce(
        jsonResponse(200, sseBody([
          JSON.stringify({ choices: [{ delta: { content: '降级回答' } }] }),
          JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] }),
          '[DONE]',
        ])),
      )
    vi.stubGlobal('fetch', fetchMock)

    const provider = new OpenAICompatProvider('key', 'https://api.deepseek.com', 'deepseek-v4-flash')
    const chunks = await collect(provider, messages, { enableWebSearch: true })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const firstBody = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(firstBody.tools).toEqual([{ type: 'web_search' }])
    const secondBody = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string)
    expect(secondBody.tools).toBeUndefined()
    expect(chunks).toContain('text:降级回答')
    expect(chunks).toContain('stop:')
  })

  it('SSE 解析：web_search tool_calls 被忽略且 content 正常输出', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, sseBody([
        JSON.stringify({ choices: [{ delta: { tool_calls: [{ function: { name: 'web_search', arguments: '{"query":"a"}' } }] } }] }),
        JSON.stringify({ choices: [{ delta: { content: '搜索后回答' } }] }),
        JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] }),
        '[DONE]',
      ])),
    )
    vi.stubGlobal('fetch', fetchMock)

    const provider = new OpenAICompatProvider('key', 'https://api.deepseek.com', 'deepseek-v4-flash')
    const chunks = await collect(provider, messages, { enableWebSearch: true })

    expect(chunks).toContain('text:搜索后回答')
    expect(chunks).toContain('stop:')
    expect(chunks.some((c) => c.startsWith('error:'))).toBe(false)
  })

  it('只返回 tool_calls 无文本时正常结束（不执行搜索）', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, sseBody([
        JSON.stringify({ choices: [{ delta: { tool_calls: [{ function: { name: 'web_search', arguments: '{}' } }] } }] }),
        JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }),
        '[DONE]',
      ])),
    )
    vi.stubGlobal('fetch', fetchMock)

    const provider = new OpenAICompatProvider('key', 'https://api.deepseek.com', 'deepseek-v4-flash')
    const chunks = await collect(provider, messages, { enableWebSearch: true })

    expect(chunks.some((c) => c.startsWith('text:'))).toBe(false)
    expect(chunks.some((c) => c.startsWith('error:'))).toBe(false)
  })

  it('API 错误（非工具相关）直接上报', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('auth failed', { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)

    const provider = new OpenAICompatProvider('key', 'https://api.deepseek.com', 'deepseek-v4-flash')
    const chunks = await collect(provider, messages, { enableWebSearch: true })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(chunks.some((c) => c.startsWith('error:') && c.includes('401'))).toBe(true)
  })

  it('传 tools 时请求体附带 function 工具', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, sseBody([
        JSON.stringify({ choices: [{ delta: { content: '回答' } }] }),
        JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] }),
        '[DONE]',
      ])),
    )
    vi.stubGlobal('fetch', fetchMock)

    const provider = new OpenAICompatProvider('key', 'https://api.deepseek.com', 'deepseek-v4-flash')
    await collect(provider, messages, {
      tools: [{ name: 'read_reference', description: '读取参考资料', parameters: { type: 'object', properties: {} } }],
    })

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.tools).toEqual([
      {
        type: 'function',
        function: {
          name: 'read_reference',
          description: '读取参考资料',
          parameters: { type: 'object', properties: {} },
        },
      },
    ])
  })

  it('流式 tool_calls 分片累积后 yield tool_call chunk', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, sseBody([
        JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'read_reference', arguments: '{"reference_id"' } }] } }] }),
        JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: ':"ref-1"}' } }] } }] }),
        JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }),
        '[DONE]',
      ])),
    )
    vi.stubGlobal('fetch', fetchMock)

    const provider = new OpenAICompatProvider('key', 'https://api.deepseek.com', 'deepseek-v4-flash')
    const chunks: Array<{ type: string; content: string; toolCall?: { name: string; arguments: Record<string, unknown> } }> = []
    for await (const chunk of provider.chat(messages)) {
      chunks.push(chunk)
    }

    expect(chunks.some((c) => c.type === 'tool_call')).toBe(true)
    const toolCall = chunks.find((c) => c.type === 'tool_call')
    expect(toolCall?.toolCall?.name).toBe('read_reference')
    expect(toolCall?.toolCall?.arguments).toEqual({ reference_id: 'ref-1' })
  })

  it('tool 角色消息转换为 role=tool 且带 tool_call_id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, sseBody([
        JSON.stringify({ choices: [{ delta: { content: '回答' } }] }),
        '[DONE]',
      ])),
    )
    vi.stubGlobal('fetch', fetchMock)

    const provider = new OpenAICompatProvider('key', 'https://api.deepseek.com', 'deepseek-v4-flash')
    const toolMessages: Message[] = [
      { role: 'assistant', content: '', toolCalls: [{ id: 'call_1', name: 'read_reference', arguments: { reference_id: 'ref-1' } }] },
      { role: 'tool', content: '工具结果', toolCallId: 'call_1' },
    ]
    await collect(provider, toolMessages)

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.messages[0]).toEqual({
      role: 'assistant',
      content: null,
      tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'read_reference', arguments: '{"reference_id":"ref-1"}' } }],
    })
    expect(body.messages[1]).toEqual({ role: 'tool', tool_call_id: 'call_1', content: '工具结果' })
  })

  it('带 images 的 user 消息转换为 content 数组（text + image_url data URL）', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, sseBody([
        JSON.stringify({ choices: [{ delta: { content: '识别结果' } }] }),
        '[DONE]',
      ])),
    )
    vi.stubGlobal('fetch', fetchMock)

    const provider = new OpenAICompatProvider('key', 'https://open.bigmodel.cn/api/paas', 'glm-4v-flash')
    const imageMessages: Message[] = [
      { role: 'user', content: '识别这张图', images: [{ mimeType: 'image/jpeg', base64: 'AAA' }] },
    ]
    await collect(provider, imageMessages)

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.messages[0]).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: '识别这张图' },
        { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAA' } },
      ],
    })
  })

  it('无 images 的消息 content 保持字符串（多模态分支不影响原有行为）', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, sseBody([
        JSON.stringify({ choices: [{ delta: { content: '你好' } }] }),
        '[DONE]',
      ])),
    )
    vi.stubGlobal('fetch', fetchMock)

    const provider = new OpenAICompatProvider('key', 'https://api.openai.com', 'gpt-4o')
    await collect(provider, [{ role: 'user', content: '你好' }])

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.messages[0]).toEqual({ role: 'user', content: '你好' })
  })
})
