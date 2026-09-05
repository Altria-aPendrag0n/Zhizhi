import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useChatRunner } from './chat-runner'
import type { Message } from '../types'
import type { StreamChunk } from '../api/llm-provider'

const messages: Message[] = [
  { role: 'user', content: '问题' },
  { role: 'assistant', content: '' },
]

/** 构造一个按序 emit chunk 的 run 实现（emit 间让出微任务，便于 waitFor 观察） */
function streamWith(chunks: StreamChunk[]) {
  return async (_signal: AbortSignal, emit: (chunk: StreamChunk) => void) => {
    for (const chunk of chunks) {
      emit(chunk)
      await Promise.resolve()
    }
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('useChatRunner', () => {
  it('startChat 后台运行：流式内容累积到 job，完成后填充占位并调用 onFinalize', async () => {
    const runner = useChatRunner()
    const onFinalize = vi.fn().mockResolvedValue(undefined)

    runner.startChat({
      threadId: 'sess-1',
      messages,
      noteRefs: [],
      onFinalize,
      run: streamWith([
        { type: 'text', content: '你好' },
        { type: 'thinking', content: '思考' },
        { type: 'stop', content: '' },
      ]),
    })

    await vi.waitFor(() => {
      expect(onFinalize).toHaveBeenCalledTimes(1)
    })

    const job = runner.getJob('sess-1')
    expect(job).not.toBeNull()
    expect(job!.isStreaming).toBe(false)
    expect(job!.messages).toEqual([
      { role: 'user', content: '问题' },
      { role: 'assistant', content: '你好', thinking: '思考' },
    ])
    expect(job!.streamingText).toBe('')
    expect(job!.streamingThinking).toBe('')
    expect(onFinalize).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 'sess-1',
        aborted: false,
        error: null,
        messages: expect.any(Array),
        noteRefs: expect.any(Array),
      }),
    )
  })

  it('流式过程中 getJob 可见进行中状态（切换会话后仍可读，不受组件生命周期影响）', async () => {
    const runner = useChatRunner()
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })

    runner.startChat({
      threadId: 'sess-1',
      messages,
      noteRefs: [],
      onFinalize: vi.fn(),
      run: async (_signal, emit) => {
        emit({ type: 'text', content: '流式内容' })
        await gate
        emit({ type: 'stop', content: '' })
      },
    })

    await vi.waitFor(() => {
      expect(runner.getJob('sess-1')?.streamingText).toBe('流式内容')
    })
    expect(runner.getJob('sess-1')!.isStreaming).toBe(true)
    release()
  })

  it('abort 中止：保留已流式内容并标记 aborted', async () => {
    const runner = useChatRunner()
    const onFinalize = vi.fn().mockResolvedValue(undefined)

    runner.startChat({
      threadId: 'sess-1',
      messages,
      noteRefs: [],
      onFinalize,
      run: async (signal, emit) => {
        emit({ type: 'text', content: '半截回答' })
        await new Promise<void>((resolve) => {
          signal.addEventListener('abort', () => resolve())
        })
        throw new DOMException('The user aborted a request.', 'AbortError')
      },
    })

    await vi.waitFor(() => {
      expect(runner.getJob('sess-1')?.streamingText).toBe('半截回答')
    })
    runner.abort('sess-1')

    await vi.waitFor(() => {
      expect(onFinalize).toHaveBeenCalledTimes(1)
    })
    const info = onFinalize.mock.calls[0][0] as { aborted: boolean; messages: Message[] }
    expect(info.aborted).toBe(true)
    expect(info.messages).toEqual([
      { role: 'user', content: '问题' },
      { role: 'assistant', content: '半截回答' },
    ])
  })

  it('error chunk：job 记录错误并移除占位消息（错误信息组件仍可读取）', async () => {
    const runner = useChatRunner()
    const onFinalize = vi.fn().mockResolvedValue(undefined)

    runner.startChat({
      threadId: 'sess-1',
      messages,
      noteRefs: [],
      onFinalize,
      run: streamWith([{ type: 'error', content: 'LLM 调用失败: 401' }]),
    })

    await vi.waitFor(() => {
      expect(onFinalize).toHaveBeenCalledTimes(1)
    })
    const job = runner.getJob('sess-1')
    expect(job!.error).toBe('LLM 调用失败: 401')
    expect(job!.messages).toEqual([{ role: 'user', content: '问题' }])
  })

  it('run 抛出非 abort 异常时记录请求失败', async () => {
    const runner = useChatRunner()
    const onFinalize = vi.fn().mockResolvedValue(undefined)

    runner.startChat({
      threadId: 'sess-1',
      messages,
      noteRefs: [],
      onFinalize,
      run: async () => {
        throw new Error('network error')
      },
    })

    await vi.waitFor(() => {
      expect(onFinalize).toHaveBeenCalledTimes(1)
    })
    expect(runner.getJob('sess-1')!.error).toContain('network error')
    expect(runner.getJob('sess-1')!.isStreaming).toBe(false)
  })

  it('cleanupIdleJob：清理已完成 job，保留进行中 job（切会话后后台回答继续）', async () => {
    const runner = useChatRunner()
    const doneFinalize = vi.fn().mockResolvedValue(undefined)
    runner.startChat({
      threadId: 'done',
      messages,
      noteRefs: [],
      onFinalize: doneFinalize,
      run: streamWith([{ type: 'text', content: 'x' }, { type: 'stop', content: '' }]),
    })
    await vi.waitFor(() => {
      expect(doneFinalize).toHaveBeenCalledTimes(1)
    })

    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    runner.startChat({
      threadId: 'running',
      messages,
      noteRefs: [],
      onFinalize: vi.fn(),
      run: async (_signal, emit) => {
        emit({ type: 'text', content: 'y' })
        await gate
        emit({ type: 'stop', content: '' })
      },
    })
    await vi.waitFor(() => {
      expect(runner.getJob('running')?.isStreaming).toBe(true)
    })

    runner.cleanupIdleJob('done')
    runner.cleanupIdleJob('running')
    expect(runner.getJob('done')).toBeNull()
    expect(runner.getJob('running')).not.toBeNull()
    release()
  })

  it('同会话重复 startChat 时中止旧 job，避免并发覆盖', async () => {
    const runner = useChatRunner()
    let firstRunAborted = false
    const onFinalize = vi.fn().mockResolvedValue(undefined)

    runner.startChat({
      threadId: 'sess-1',
      messages,
      noteRefs: [],
      onFinalize,
      run: async (signal) => {
        await new Promise<void>((resolve) => {
          signal.addEventListener('abort', () => {
            firstRunAborted = true
            resolve()
          })
        })
      },
    })
    await vi.waitFor(() => {
      expect(runner.getJob('sess-1')?.isStreaming).toBe(true)
    })

    runner.startChat({
      threadId: 'sess-1',
      messages,
      noteRefs: [],
      onFinalize,
      run: streamWith([{ type: 'stop', content: '' }]),
    })
    await vi.waitFor(() => {
      expect(firstRunAborted).toBe(true)
    })
  })

  it('findLatestAutoJob：无 new_* job 时返回 null（普通会话 job 不算）', async () => {
    const runner = useChatRunner()
    expect(runner.findLatestAutoJob()).toBeNull()

    runner.startChat({
      threadId: 'sess-1',
      messages,
      noteRefs: [],
      onFinalize: vi.fn().mockResolvedValue(undefined),
      run: streamWith([{ type: 'stop', content: '' }]),
    })
    await vi.waitFor(() => {
      expect(runner.getJob('sess-1')?.isStreaming).toBe(false)
    })
    expect(runner.findLatestAutoJob()).toBeNull()
  })

  it('findLatestAutoJob：返回最近创建的 new_* job（后台化切回恢复用）', async () => {
    const runner = useChatRunner()
    let release1!: () => void
    const gate1 = new Promise<void>((resolve) => { release1 = resolve })
    let release2!: () => void
    const gate2 = new Promise<void>((resolve) => { release2 = resolve })

    runner.startChat({
      threadId: 'new_1',
      messages,
      noteRefs: [],
      onFinalize: vi.fn(),
      run: async (_signal, emit) => {
        emit({ type: 'text', content: '第一问的回答' })
        await gate1
        emit({ type: 'stop', content: '' })
      },
    })
    await vi.waitFor(() => {
      expect(runner.getJob('new_1')?.isStreaming).toBe(true)
    })

    // 中间穿插一个普通会话 job（会正常结束），不应影响 new_* 的判定
    runner.startChat({
      threadId: 'sess-9',
      messages,
      noteRefs: [],
      onFinalize: vi.fn().mockResolvedValue(undefined),
      run: streamWith([{ type: 'stop', content: '' }]),
    })
    await vi.waitFor(() => {
      expect(runner.getJob('sess-9')?.isStreaming).toBe(false)
    })

    runner.startChat({
      threadId: 'new_2',
      messages,
      noteRefs: [],
      onFinalize: vi.fn(),
      run: async (_signal, emit) => {
        emit({ type: 'text', content: '第二问的回答' })
        await gate2
        emit({ type: 'stop', content: '' })
      },
    })
    await vi.waitFor(() => {
      expect(runner.getJob('new_2')?.isStreaming).toBe(true)
    })

    expect(runner.findLatestAutoJob()?.threadId).toBe('new_2')
    release1()
    release2()
  })
})
