import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ProviderType, ProviderConfig } from '../types'

const STORAGE_KEY = 'study-thread-settings'

export const useSettingsStore = defineStore('settings', () => {
  const activeProvider = ref<ProviderType>('openai-compat')
  const apiKey = ref('')
  const baseUrl = ref('https://api.openai.com')
  const model = ref('gpt-4o')

  function saveSettings() {
    const data = {
      activeProvider: activeProvider.value,
      apiKey: apiKey.value,
      baseUrl: baseUrl.value,
      model: model.value,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }

  function loadSettings() {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      try {
        const data = JSON.parse(raw)
        activeProvider.value = data.activeProvider || 'openai-compat'
        apiKey.value = data.apiKey || ''
        baseUrl.value = data.baseUrl || 'https://api.openai.com'
        model.value = data.model || 'gpt-4o'
      } catch {
        // 解析失败则使用默认值
      }
    }
  }

  function getProviderConfig(): ProviderConfig {
    return {
      type: activeProvider.value,
      apiKey: apiKey.value,
      baseUrl: baseUrl.value,
      model: model.value,
    }
  }

  // 初始化时加载设置
  loadSettings()

  return {
    activeProvider,
    apiKey,
    baseUrl,
    model,
    saveSettings,
    loadSettings,
    getProviderConfig,
  }
})