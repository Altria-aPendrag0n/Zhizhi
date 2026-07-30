import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ProviderType, ProviderConfig } from '../types'

const STORAGE_KEY = 'study-thread-settings'
const RECENT_VAULTS_KEY = 'study-thread-recent-vaults'

export const useSettingsStore = defineStore('settings', () => {
  const activeProvider = ref<ProviderType>('openai-compat')
  const apiKey = ref('')
  const baseUrl = ref('https://api.openai.com')
  const model = ref('gpt-4o')
  const recentVaults = ref<string[]>([])

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
    // 加载最近 vault 列表
    try {
      const rawVaults = localStorage.getItem(RECENT_VAULTS_KEY)
      if (rawVaults) recentVaults.value = JSON.parse(rawVaults)
    } catch {}
  }

  function addRecentVault(path: string) {
    const updated = [path, ...recentVaults.value.filter(v => v !== path)].slice(0, 5)
    recentVaults.value = updated
    localStorage.setItem(RECENT_VAULTS_KEY, JSON.stringify(updated))
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
    recentVaults,
    saveSettings,
    loadSettings,
    addRecentVault,
    getProviderConfig,
  }
})