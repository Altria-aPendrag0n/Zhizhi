import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { LLMProvider, Message, StreamChunk } from './llm-provider'
import { chatWithTools, type ChatLoopOptions } from './chat-loop'

const { executeClientTool, CLIENT_TOOLS } = vi.hoisted(() => ({
  executeClientTool: vi.fn<(name: string, args: Record<string, unknown>) => Promise<string>>(),
  CLIENT_TOOLS: [{ name: 'read_reference', description: '读取参考资料', parameters: {} }],
}))

vi.mock('./tools', () => ({
  executeClientTool,
  CLIENT_TOOLS,
  MAX_TOOL_ROUNDS: 3,
}))

type MockProvider = Omit<LLMProvider, 'chat'> & {
  chat: ReturnType<typeof vi.fn>
}

/** 用一组 chunk 构造 provider.chat 的 mock 迭代器 */
function mockProvider(rounds: StreamChunk[][]): MockProvider {
  const chat = vi.fn().mockImplementation(async function* () {
    const round = rounds.shift()
    if (!round) return
    for (const c of round) yield c
  })
  return { chat } as unknown as MockProvider
}

async function collect(provider: MockProvider, extra: Partial<ChatLoopOptions> = {}): Promise<StreamChunk[]> {
  const out: StreamChunk[] = []
  for await (const chunk of chatWithTools({ provider: provider as unknown as LLMProvider, messages: [], systemPrompt: 'sys', toolContext: { vaultPath: '/vault' }, ...extra })) {
    out.push(chunk)
  }
  return out
}

const toolCallChunk = (name: string, args: Record<string, unknown>): StreamChunk => ({
  type: 'tool_call',
  content: '',
  toolCall: { id: 'call_1', name, arguments: args },
})

describe('chatWithTools 工具循环', () => {
  beforeEach(() => {
    executeClientTool.mockReset()
  })

  it('模型发起工具调用时执行工具并追加 tool 消息后继续请求', async () => {
    executeClientTool.mockResolvedValue('Showing lines 1-2 of 5 total lines.\n\n---\n\n内容')
    const provider = mockProvider([
      [toolCallChunk('read_reference', { reference_id: 'ref-1' }), { type: 'stop', content: '' }],
      [{ type: 'text', content: '基于全文的回答' }, { type: 'stop', content: '' }],
    ])

    const chunks = await collect(provider, { tools: CLIENT_TOOLS })

    expect(executeClientTool).toHaveBeenCalledWith('read_reference', { reference_id: 'ref-1' }, { vaultPath: '/vault' })
    expect(chunks.some((c) => c.type === 'tool_result' && c.content.includes('Showing lines'))).toBe(true)
    expect(chunks.some((c) => c.type === 'text' && c.content === '基于全文的回答')).toBe(true)
    // 工具调用轮的 stop 不应透传：只有最终轮（无工具调用）的 stop 出现，且在回答文本之后
    expect(chunks.filter((c) => c.type === 'stop')).toHaveLength(1)
    expect(chunks.indexOf(chunks.find((c) => c.type === 'stop')!)).toBeGreaterThan(
      chunks.indexOf(chunks.find((c) => c.type === 'text')!),
    )

    // 第二轮请求消息应包含 assistant(toolCalls) + tool 结果
    const secondCallMessages = provider.chat.mock.calls[1][0] as Message[]
    expect(secondCallMessages[0].role).toBe('assistant')
    expect(secondCallMessages[0].toolCalls?.[0].name).toBe('read_reference')
    expect(secondCallMessages[1].role).toBe('tool')
    expect(secondCallMessages[1].toolCallId).toBe('call_1')
  })

  it('模型未发起工具调用时直接透传回答', async () => {
    const provider = mockProvider([
      [{ type: 'text', content: '直接回答' }, { type: 'stop', content: '' }],
    ])

    const chunks = await collect(provider, { tools: CLIENT_TOOLS })

    expect(executeClientTool).not.toHaveBeenCalled()
    expect(chunks.some((c) => c.type === 'text' && c.content === '直接回答')).toBe(true)
  })

  it('超过轮次上限时上报错误', async () => {
    const provider = mockProvider([
      [toolCallChunk('read_reference', { reference_id: 'ref-1' }), { type: 'stop', content: '' }],
      [toolCallChunk('read_reference', { reference_id: 'ref-1', offset: 2 }), { type: 'stop', content: '' }],
      [toolCallChunk('read_reference', { reference_id: 'ref-1', offset: 4 }), { type: 'stop', content: '' }],
    ])
    executeClientTool.mockResolvedValue('ok')

    const chunks = await collect(provider, { tools: CLIENT_TOOLS })

    expect(chunks.some((c) => c.type === 'error' && c.content.includes('超过上限'))).toBe(true)
  })
})
