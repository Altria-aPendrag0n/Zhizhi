import { describe, it, expect, vi } from 'vitest'
import { createProvider } from './provider-factory'
import { AnthropicProvider } from './anthropic'
import { OpenAICompatProvider } from './openai-compat'
import { attachBusyController } from '../utils/busy-guard'
import type { ProviderConfig } from '../types'

// mock 底层 Provider：提供可控 chat 流（避免真实网络请求），实例属性与真实类保持一致
vi.mock('./anthropic', () => ({
  AnthropicProvider: class {
    apiKey: string
    baseUrl: string
    defaultModel?: string
    chat = vi.fn(async function* () {
      yield { type: 'text' as const, content: 'ok' }
      yield { type: 'stop' as const, content: '' }
    })
    constructor(apiKey: string, baseUrl: string, defaultModel?: string) {
      this.apiKey = apiKey
      this.baseUrl = baseUrl
      this.defaultModel = defaultModel
    }
  },
}))

vi.mock('./openai-compat', () => ({
  OpenAICompatProvider: class {
    apiKey: string
    baseUrl: string
    defaultModel?: string
    chat = vi.fn(async function* () {
      yield { type: 'text' as const, content: 'ok' }
      yield { type: 'stop' as const, content: '' }
    })
    constructor(apiKey: string, baseUrl: string, defaultModel?: string) {
      this.apiKey = apiKey
      this.baseUrl = baseUrl
      this.defaultModel = defaultModel
    }
  },
}))

/** 注册忙碌控制器 spy，返回事件序列（start/stop） */
function spyBusyController() {
  const events: string[] = []
  attachBusyController({
    start: (message) => events.push(`start:${message}`),
    stop: () => events.push('stop'),
  })
  return events
}

describe('createProvider', () => {
  it('DeepSeek 官方 API 路由到 AnthropicProvider 的 /anthropic 端点（用于联网搜索）', () => {
    const provider = createProvider({
      type: 'openai-compat',
      apiKey: 'key',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      enableWebSearch: true,
    } satisfies ProviderConfig)

    expect(provider).toBeInstanceOf(AnthropicProvider)
    expect((provider as unknown as { baseUrl: string }).baseUrl).toBe('https://api.deepseek.com/anthropic')
    expect((provider as unknown as { defaultModel: string }).defaultModel).toBe('deepseek-v4-flash')
  })

  it('DeepSeek baseUrl 带尾斜杠时正常拼接', () => {
    const provider = createProvider({
      type: 'openai-compat',
      apiKey: 'key',
      baseUrl: 'https://api.deepseek.com/',
      model: 'deepseek-v4-pro',
    } satisfies ProviderConfig)

    expect((provider as unknown as { baseUrl: string }).baseUrl).toBe('https://api.deepseek.com/anthropic')
  })

  it('非 DeepSeek 的 openai-compat 仍路由到 OpenAICompatProvider', () => {
    const provider = createProvider({
      type: 'openai-compat',
      apiKey: 'key',
      baseUrl: 'https://api.openai.com',
      model: 'gpt-4o',
    } satisfies ProviderConfig)

    expect(provider).toBeInstanceOf(OpenAICompatProvider)
  })

  it('anthropic 类型路由到 AnthropicProvider', () => {
    const provider = createProvider({
      type: 'anthropic',
      apiKey: 'key',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-sonnet-4-6',
    } satisfies ProviderConfig)

    expect(provider).toBeInstanceOf(AnthropicProvider)
    expect((provider as unknown as { baseUrl: string }).baseUrl).toBe('https://api.anthropic.com')
  })

  it('非流式调用传 busyMessage 时迭代输出期间自动打开并关闭忙碌遮罩', async () => {
    const events = spyBusyController()
    const provider = createProvider({
      type: 'openai-compat',
      apiKey: 'key',
      baseUrl: 'https://api.openai.com',
      model: 'gpt-4o',
    } satisfies ProviderConfig)

    const chunks: unknown[] = []
    for await (const chunk of provider.chat([{ role: 'user', content: 'hi' }], { busyMessage: 'AI 测试中…' })) {
      chunks.push(chunk)
    }

    expect(events).toEqual(['start:AI 测试中…', 'stop'])
    expect(chunks).toHaveLength(2)
  })

  it('不传 busyMessage（流式聊天场景）时不开关忙碌遮罩', async () => {
    const events = spyBusyController()
    const provider = createProvider({
      type: 'openai-compat',
      apiKey: 'key',
      baseUrl: 'https://api.openai.com',
      model: 'gpt-4o',
    } satisfies ProviderConfig)

    for await (const _chunk of provider.chat([{ role: 'user', content: 'hi' }])) {
      // 仅消费
    }

    expect(events).toEqual([])
  })

  it('调用方提前 break 时仍会关闭忙碌遮罩（finally 兜底）', async () => {
    const events = spyBusyController()
    const provider = createProvider({
      type: 'openai-compat',
      apiKey: 'key',
      baseUrl: 'https://api.openai.com',
      model: 'gpt-4o',
    } satisfies ProviderConfig)

    for await (const _chunk of provider.chat([{ role: 'user', content: 'hi' }], { busyMessage: 'AI 测试中…' })) {
      break
    }

    expect(events).toEqual(['start:AI 测试中…', 'stop'])
  })

  it('不消费迭代器（仅创建）时不打开忙碌遮罩', () => {
    const events = spyBusyController()
    const provider = createProvider({
      type: 'openai-compat',
      apiKey: 'key',
      baseUrl: 'https://api.openai.com',
      model: 'gpt-4o',
    } satisfies ProviderConfig)

    provider.chat([{ role: 'user', content: 'hi' }], { busyMessage: 'AI 测试中…' })

    expect(events).toEqual([])
  })
})
