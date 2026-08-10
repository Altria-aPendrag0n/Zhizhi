/**
 * LLM 提供商工厂
 * 根据配置创建对应的 LLMProvider 实例
 */

import type { LLMProvider } from './llm-provider'
import type { ProviderConfig } from '../types'
import { AnthropicProvider } from './anthropic'
import { OpenAICompatProvider } from './openai-compat'
import { busyStart, busyStop } from '../utils/busy-guard'

/** 是否为 DeepSeek 官方 API（其联网搜索仅支持 Anthropic 兼容端点） */
function isDeepSeekOfficial(baseUrl: string): boolean {
  return baseUrl.includes('api.deepseek.com')
}

/**
 * 根据配置创建 LLM 提供商实例
 * @param config 提供商配置（type, apiKey, baseUrl, model）
 * @returns 对应的 LLMProvider 实例（chat 已包装：非流式调用传 busyMessage 时自动开关全局忙碌遮罩）
 * @throws 如果提供商类型不支持
 */
export function createProvider(config: ProviderConfig): LLMProvider {
  const provider = createRawProvider(config)
  provider.chat = withBusyOverlay(provider.chat.bind(provider))
  return provider
}

/** 未包装的原始提供商创建逻辑 */
function createRawProvider(config: ProviderConfig): LLMProvider {
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

/**
 * 包装 chat：调用方传入 ChatOptions.busyMessage（非流式 AI 调用）时，
 * 在迭代输出期间自动打开/关闭全局忙碌遮罩。
 * 流式聊天（学习会话、复习对话）不传 busyMessage，保持原样透传。
 */
function withBusyOverlay(chat: LLMProvider['chat']): LLMProvider['chat'] {
  return (messages, options) => {
    const iter = chat(messages, options)
    const busyMessage = options?.busyMessage
    if (!busyMessage) return iter
    return (async function* () {
      busyStart(busyMessage)
      try {
        for await (const chunk of iter) yield chunk
      } finally {
        busyStop()
      }
    })()
  }
}