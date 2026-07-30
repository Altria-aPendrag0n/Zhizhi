/**
 * LLM 提供商工厂
 * 根据配置创建对应的 LLMProvider 实例
 */

import type { LLMProvider } from './llm-provider'
import type { ProviderConfig } from '../types'
import { AnthropicProvider } from './anthropic'
import { OpenAICompatProvider } from './openai-compat'

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
      return new OpenAICompatProvider(config.apiKey, config.baseUrl, config.model)

    default:
      throw new Error(`不支持的提供商类型: ${(config as ProviderConfig).type}`)
  }
}