/**
 * web_search 客户端工具（联网搜索子代理）
 *
 * 主模型通过调用本工具，把「需要联网」的检索委托给搜索子代理：
 * 子代理是一次独立的 LLM 调用，其请求携带 X-Zhizhi-Purpose: web_search 头
 * （官方通道）由服务端网关路由到「用途=web_search」的上游渠道——
 * 该渠道的上游需支持 web_search 服务端工具（如 DeepSeek 官方 API）。
 *
 * 这样主模型（如 GLM）无需自身支持联网工具，也能获得联网检索能力。
 */

import type { LLMProvider } from '../llm-provider'
import { OpenAICompatProvider } from '../openai-compat'
import { createProvider } from '../provider-factory'
import { useSettingsStore } from '../../stores/settings'
import { useAuthStore } from '../../stores/auth'

/** 联网搜索子代理的系统提示词 */
export const SEARCH_AGENT_SYSTEM_PROMPT = `你是知枝的联网搜索代理。根据给定的检索请求，使用你可用的联网搜索能力查找最新信息，并输出一份简明的调研结果：
- 关键事实：3-6 条分点摘要，每条尽量附来源（标题 + 链接）
- 直接给出事实与数据，不要寒暄，不要复述请求
- 若搜索无结果或信息不足，如实说明「未找到相关信息」，不要编造`

export const webSearchTool = {
  name: 'web_search',
  description:
    '联网搜索：查询实时信息、新闻、最新版本、时效性事实等，返回带来源的要点摘要。仅在回答需要最新/实时信息时调用；普通概念解释不要调用。',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '搜索查询词（提炼后的关键词，而非用户的原话）',
      },
    },
    required: ['query'],
  },
} as const

/** 子代理执行配置（测试可注入 provider） */
export interface WebSearchExecutorOptions {
  /** 注入子代理 provider（测试用）；缺省按设置解析 */
  provider?: LLMProvider
}

/**
 * 解析联网搜索子代理的 Provider。
 *
 * - official：官方通道的联网子代理——请求携带 X-Zhizhi-Purpose: web_search 头，
 *   由网关路由到「用途=web_search」的渠道
 * - custom：自定义子代理模型配置（留空的字段回退主模型配置）；
 *   经 createProvider 创建以复用 DeepSeek 官方的 Anthropic 端点特判
 * - 未配置/凭据缺失：返回 null（调用方得到明确的错误提示）
 */
export function resolveSearchProvider(): { provider: LLMProvider; extraHeaders?: Record<string, string> } | null {
  const settings = useSettingsStore()
  const auth = useAuthStore()

  if (settings.searchAgentMode === 'official') {
    if (!auth.apiKey) return null
    return {
      provider: new OpenAICompatProvider(auth.apiKey, settings.officialApiBaseUrl, settings.officialModel),
      extraHeaders: { 'X-Zhizhi-Purpose': 'web_search' },
    }
  }

  if (settings.searchAgentMode === 'custom') {
    const config = settings.getProviderConfig()
    return {
      provider: createProvider({
        type: 'openai-compat',
        apiKey: settings.searchAgentApiKey || config.apiKey,
        baseUrl: settings.searchAgentBaseUrl || config.baseUrl,
        model: settings.searchAgentModel || config.model,
      }),
    }
  }

  return null
}

/**
 * 执行联网搜索子代理
 *
 * @param args - 模型传入的工具参数（query 必填）
 * @returns 子代理输出的调研结果文本（作为工具结果回传给主模型）
 */
export async function executeWebSearch(
  args: Record<string, unknown>,
  executorOptions: WebSearchExecutorOptions = {},
): Promise<string> {
  const query = typeof args.query === 'string' ? args.query.trim() : ''
  if (!query) {
    return '错误：缺少有效的 query 参数。'
  }

  // 显式 provider（测试注入）时仍解析 extraHeaders（官方 purpose 头）；
  // 未注入 provider 时按设置解析完整的子代理配置
  const resolved = executorOptions.provider
    ? { provider: executorOptions.provider, extraHeaders: resolveSearchProvider()?.extraHeaders }
    : resolveSearchProvider()
  if (!resolved) {
    return '错误：联网搜索子代理未配置或未登录官方账号，无法执行联网搜索。'
  }

  let output = ''
  try {
    for await (const chunk of resolved.provider.chat([{ role: 'user', content: query }], {
      systemPrompt: SEARCH_AGENT_SYSTEM_PROMPT,
      enableWebSearch: true,
      maxTokens: 2048,
      extraHeaders: resolved.extraHeaders,
    })) {
      if (chunk.type === 'text') output += chunk.content
      if (chunk.type === 'error') return `联网搜索失败：${chunk.content}`
    }
  } catch (e) {
    return `联网搜索失败：${(e as Error).message}`
  }

  return output.trim() || '联网搜索未返回内容。'
}
