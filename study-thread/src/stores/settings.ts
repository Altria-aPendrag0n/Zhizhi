import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ProviderType, ProviderConfig, ReviewAlgorithm } from '../types'

const STORAGE_KEY = 'study-thread-settings'
const RECENT_VAULTS_KEY = 'study-thread-recent-vaults'

export const useSettingsStore = defineStore('settings', () => {
  const activeProvider = ref<ProviderType>('openai-compat')
  const apiKey = ref('')
  const baseUrl = ref('https://api.openai.com')
  const model = ref('gpt-4o')
  const enableWebSearch = ref(true)
  const autoGenerateNoteTitle = ref(true)
  const autoGenerateNoteTags = ref(true)
  /** 复习间隔算法（P1 增强）：classic 经典间隔序列（默认） / fsrs 个性化遗忘曲线 */
  const reviewAlgorithm = ref<ReviewAlgorithm>('classic')
  const recentVaults = ref<string[]>([])

  function saveSettings() {
    const data = {
      activeProvider: activeProvider.value,
      apiKey: apiKey.value,
      baseUrl: baseUrl.value,
      model: model.value,
      enableWebSearch: enableWebSearch.value,
      autoGenerateNoteTitle: autoGenerateNoteTitle.value,
      autoGenerateNoteTags: autoGenerateNoteTags.value,
      reviewAlgorithm: reviewAlgorithm.value,
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
        enableWebSearch.value = data.enableWebSearch !== false
        autoGenerateNoteTitle.value = data.autoGenerateNoteTitle !== false
        autoGenerateNoteTags.value = data.autoGenerateNoteTags !== false
        reviewAlgorithm.value = data.reviewAlgorithm === 'fsrs' ? 'fsrs' : 'classic'
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

  /** 从最近打开列表移除（删除 Vault 后同步清理） */
  function removeRecentVault(path: string) {
    recentVaults.value = recentVaults.value.filter(v => v !== path)
    localStorage.setItem(RECENT_VAULTS_KEY, JSON.stringify(recentVaults.value))
  }

  function getProviderConfig(): ProviderConfig {
    return {
      type: activeProvider.value,
      apiKey: apiKey.value,
      baseUrl: baseUrl.value,
      model: model.value,
      enableWebSearch: enableWebSearch.value,
    }
  }

  // 初始化时加载设置
  loadSettings()

  return {
    activeProvider,
    apiKey,
    baseUrl,
    model,
    enableWebSearch,
    autoGenerateNoteTitle,
    autoGenerateNoteTags,
    reviewAlgorithm,
    recentVaults,
    saveSettings,
    loadSettings,
    addRecentVault,
    removeRecentVault,
    getProviderConfig,
  }
})