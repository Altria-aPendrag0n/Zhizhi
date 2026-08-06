import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Message, StreamChunk } from '../llm-provider'

const chatWithTools = vi.hoisted(() => vi.fn())
vi.mock('../chat-loop', () => ({ chatWithTools }))

import { branchFollowupStream } from './branch-followup'

const forkContext: Message[] = [
  { role: 'user', content: '主会话的问题' },
  { role: 'assistant', content: '主会话的回答' },
]

const branchHistory: Message[] = [
  { role: 'user', content: '分支里的第一个追问' },
  { role: 'assistant', content: '分支里的第一个回答' },
]

function mockChat() {
  chatWithTools.mockImplementation(async function* () {
    yield { type: 'text', content: '分支的回答' }
  })
}

function lastChatArgs() {
  return chatWithTools.mock.calls[chatWithTools.mock.calls.length - 1][0] as {
    messages: Message[]
    systemPrompt: string
  }
}

describe('branchFollowupStream', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockChat()
  })

  it('将分支自身历史与当前问题一起作为多轮消息传给 LLM', async () => {
    const chunks: StreamChunk[] = []
    for await (const chunk of branchFollowupStream('分支里的第二个追问', forkContext, branchHistory, [], {} as never)) {
      chunks.push(chunk)
    }

    const { messages } = lastChatArgs()
    expect(messages).toEqual([
      { role: 'user', content: '分支里的第一个追问' },
      { role: 'assistant', content: '分支里的第一个回答' },
      { role: 'user', content: '分支里的第二个追问' },
    ])
    expect(chunks).toEqual([{ type: 'text', content: '分支的回答' }])
  })

  it('没有分支历史时只传当前问题', async () => {
    for await (const _ of branchFollowupStream('追问', forkContext, [], [], {} as never)) {
      // 消费迭代器
    }

    const { messages } = lastChatArgs()
    expect(messages).toEqual([{ role: 'user', content: '追问' }])
  })

  it('分叉点前的主会话历史注入 systemPrompt 的 fork_context', async () => {
    for await (const _ of branchFollowupStream('追问', forkContext, branchHistory, [], {} as never)) {
      // 消费迭代器
    }

    const { systemPrompt } = lastChatArgs()
    expect(systemPrompt).toContain('主会话的问题')
    expect(systemPrompt).toContain('主会话的回答')
    expect(systemPrompt).toContain('## 知枝')
  })

  it('传入的历史消息不会被修改（内部拷贝）', async () => {
    const original = JSON.stringify(branchHistory)
    for await (const _ of branchFollowupStream('追问', forkContext, branchHistory, [], {} as never)) {
      // 消费迭代器
    }
    expect(JSON.stringify(branchHistory)).toBe(original)
  })

  it('知识检索上下文追加到 systemPrompt 之后', async () => {
    for await (const _ of branchFollowupStream('追问', forkContext, [], [], {} as never, '知识库内容')) {
      // 消费迭代器
    }

    const { systemPrompt } = lastChatArgs()
    expect(systemPrompt.endsWith('知识库内容')).toBe(true)
  })

  it('chatWithTools 抛错时转换为 error chunk', async () => {
    chatWithTools.mockImplementationOnce(async function* () {
      throw new Error('provider down')
    })

    const chunks: StreamChunk[] = []
    for await (const chunk of branchFollowupStream('追问', forkContext, [], [], {} as never)) {
      chunks.push(chunk)
    }
    expect(chunks[0]).toMatchObject({ type: 'error', content: expect.stringContaining('provider down') })
  })
})
