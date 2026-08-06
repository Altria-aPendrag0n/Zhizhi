import { describe, it, expect } from 'vitest'
import { createProvider } from './provider-factory'
import { AnthropicProvider } from './anthropic'
import { OpenAICompatProvider } from './openai-compat'
import type { ProviderConfig } from '../types'

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
})
