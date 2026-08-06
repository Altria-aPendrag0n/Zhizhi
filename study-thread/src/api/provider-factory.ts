/**
 * LLM 提供商工厂
 * 根据配置创建对应的 LLMProvider 实例
 */

import type { LLMProvider } from './llm-provider'
import type { ProviderConfig } from '../types'
import { AnthropicProvider } from './anthropic'
import { OpenAICompatProvider } from './openai-compat'

/** 是否为 DeepSeek 官方 API（其联网搜索仅支持 Anthropic 兼容端点） */
function isDeepSeekOfficial(baseUrl: string): boolean {
  return baseUrl.includes('api.deepseek.com')
}

/**
 * 根据配置创建 LLM 提供商实例
 * @param config 提供商配置（type, apiKey, baseUrl, model）
 * @returns 对应的 LLMProvider 实例
 * @throws 如果提供商类型不支持
 */
export function createProvider(config: ProviderConfig): LLMProvider {
  switch (config.type) {
    case 'anthropic':
      return new AnthropicProvider(config.apiKey, config.baseUrl)

    case 'openai-compat':
      // DeepSeek 官方 API 的联网搜索（web_search_20250305 工具）仅在 Anthropic 兼容端点提供，
      // 其 OpenAI Chat Completions 端点不识别 web_search 工具类型
      if (isDeepSeekOfficial(config.baseUrl)) {
        const baseUrl = config.baseUrl.replace(/\/+$/, '')
        return new AnthropicProvider(config.apiKey, `${baseUrl}/anthropic`, config.model)
      }
      return new OpenAICompatProvider(config.apiKey, config.baseUrl, config.model)

    default:
      throw new Error(`不支持的提供商类型: ${(config as ProviderConfig).type}`)
  }
}