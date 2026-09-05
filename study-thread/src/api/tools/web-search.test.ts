import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { executeWebSearch, webSearchTool, SEARCH_AGENT_SYSTEM_PROMPT } from './web-search'
import { useSettingsStore } from '../../stores/settings'
import { useAuthStore } from '../../stores/auth'
import type { StreamChunk, LLMProvider } from '../llm-provider'

vi.mock('../provider-factory', () => ({ createProvider: vi.fn() }))
vi.mock('../openai-compat', () => ({
  OpenAICompatProvider: vi.fn(),
  PROVIDER_PRESETS: {},
  webSearchUnsupportedChannels: new Set<string>(),
}))

function providerOf(chunks: StreamChunk[], calls: { systemPrompt?: string; enableWebSearch?: boolean; extraHeaders?: Record<string, string> }[] = []): LLMProvider {
  return {
    chat(_messages: unknown, options?: { systemPrompt?: string; enableWebSearch?: boolean; extraHeaders?: Record<string, string> }) {
      calls.push({ systemPrompt: options?.systemPrompt, enableWebSearch: options?.enableWebSearch, extraHeaders: options?.extraHeaders })
      return (async function* () {
        for (const c of chunks) yield c
      })()
    },
  } as unknown as LLMProvider
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('web_search 子代理', () => {
  it('工具定义：query 必填，description 说明委托场景', () => {
    expect(webSearchTool.name).toBe('web_search')
    expect((webSearchTool.parameters as unknown as { required: string[] }).required).toEqual(['query'])
    expect(webSearchTool.description).toContain('联网搜索')
  })

  it('缺少 query 参数时返回错误提示', async () => {
    const result = await executeWebSearch({})
    expect(result).toContain('错误：缺少有效的 query')
  })

  it('direct 模式（默认）未配置子代理时返回明确错误', async () => {
    useSettingsStore().searchAgentMode = 'direct'
    const result = await executeWebSearch({ query: '最新新闻' })
    expect(result).toContain('联网搜索子代理未配置')
  })

  it('custom 模式：子代理调用带联网与系统提示词，输出作为工具结果返回', async () => {
    const settings = useSettingsStore()
    settings.searchAgentMode = 'custom'
    settings.apiKey = 'sk-main'
    settings.baseUrl = 'https://main.example.com'
    settings.model = 'main-model'
    const calls: { systemPrompt?: string; enableWebSearch?: boolean; extraHeaders?: Record<string, string> }[] = []
    const provider = providerOf(
      [{ type: 'text', content: '搜索结果要点' }, { type: 'stop', content: '' }],
      calls,
    )
    const result = await executeWebSearch({ query: '今天的日期' }, { provider })

    expect(result).toBe('搜索结果要点')
    expect(calls).toHaveLength(1)
    expect(calls[0].systemPrompt).toBe(SEARCH_AGENT_SYSTEM_PROMPT)
    expect(calls[0].enableWebSearch).toBe(true)
    expect(calls[0].extraHeaders).toBeUndefined()
  })

  it('official 模式：解析器返回官方通道配置与 X-Zhizhi-Purpose 头', async () => {
    const settings = useSettingsStore()
    settings.searchAgentMode = 'official'
    const auth = useAuthStore()
    auth.$patch({ apiKey: 'sk-zhizhi-official' } as never)
    expect(auth.apiKey).toBe('sk-zhizhi-official')

    // resolveSearchProvider 通过模块内 OpenAICompatProvider 构造，这里验证其结果链路：
    // executeWebSearch 收到带 extraHeaders 的调用（由 mock 的 provider 断言）
    const { resolveSearchProvider } = await import('./web-search')
    const resolved = resolveSearchProvider()
    expect(resolved).not.toBeNull()
    expect(resolved!.extraHeaders).toEqual({ 'X-Zhizhi-Purpose': 'web_search' })

    const calls: { extraHeaders?: Record<string, string> }[] = []
    const provider = providerOf([{ type: 'text', content: 'ok' }, { type: 'stop', content: '' }], calls)
    const result = await executeWebSearch({ query: 'x' }, { provider })
    expect(result).toBe('ok')
    expect(calls[0].extraHeaders).toEqual({ 'X-Zhizhi-Purpose': 'web_search' })
  })

  it('子代理返回 error chunk 时透传失败信息', async () => {
    const provider = providerOf([{ type: 'error', content: 'API 错误 (402)' }])
    const result = await executeWebSearch({ query: 'x' }, { provider })
    expect(result).toContain('联网搜索失败')
    expect(result).toContain('402')
  })

  it('子代理输出为空时返回兜底文案', async () => {
    const provider = providerOf([{ type: 'stop', content: '' }])
    const result = await executeWebSearch({ query: 'x' }, { provider })
    expect(result).toBe('联网搜索未返回内容。')
  })
})
