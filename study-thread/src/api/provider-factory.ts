/**
 * LLM 提供商工厂
 * 根据配置创建对应的 LLMProvider 实例
 */

import type { LLMProvider } from './llm-provider'
import type { ProviderConfig } from '../types'
import { AnthropicProvider } from './anthropic'

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
      // OpenAICompatProvider 将在 Task 11 中实现
      throw new Error('OpenAICompatProvider 尚未实现，将在后续任务中完成')

    default:
      throw new Error(`不支持的提供商类型: ${(config as ProviderConfig).type}`)
  }
}