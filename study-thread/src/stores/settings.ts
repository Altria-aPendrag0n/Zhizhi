import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ProviderType, ProviderConfig, ReviewAlgorithm } from '../types'
import { useAuthStore } from './auth'

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
  /** 图片转笔记专用模型（独立于对话模型，OpenAI 兼容格式） */
  const visionEnabled = ref(false)
  const visionBaseUrl = ref('https://open.bigmodel.cn/api/paas')
  const visionApiKey = ref('')
  const visionModel = ref('glm-4v-flash')
  const recentVaults = ref<string[]>([])
  /** 知枝官方服务地址默认值：发布包注入生产域名，开发回环；可用 VITE_OFFICIAL_API_URL 覆盖（如自托管/灰度） */
  const defaultOfficialApiUrl = import.meta.env.PROD ? 'https://api.zhizhi.app' : 'http://127.0.0.1:8787'
  /** 知枝官方服务地址（设置页可改；非敏感，可明文持久化） */
  const officialApiBaseUrl = ref(import.meta.env.VITE_OFFICIAL_API_URL || defaultOfficialApiUrl)
  /** 知枝官方 API 是否启用（仅内存，由 auth store 登录/登出切换，不持久化） */
  const officialApiEnabled = ref(false)
  /** 官方 API 使用的模型（Phase 2 网关定档后随套餐/配置动态下发） */
  const officialModel = ref('glm-4.7-flash')

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
      visionEnabled: visionEnabled.value,
      visionBaseUrl: visionBaseUrl.value,
      visionApiKey: visionApiKey.value,
      visionModel: visionModel.value,
      officialApiBaseUrl: officialApiBaseUrl.value,
      officialModel: officialModel.value,
      officialApiEnabled: officialApiEnabled.value,
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
        visionEnabled.value = data.visionEnabled === true
        visionBaseUrl.value = data.visionBaseUrl || 'https://open.bigmodel.cn/api/paas'
        visionApiKey.value = data.visionApiKey || ''
        visionModel.value = data.visionModel || 'glm-4v-flash'
        officialApiBaseUrl.value = data.officialApiBaseUrl || import.meta.env.VITE_OFFICIAL_API_URL || defaultOfficialApiUrl
        officialModel.value = data.officialModel || 'glm-4.7-flash'
        officialApiEnabled.value = data.officialApiEnabled === true
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
    // 官方 API 启用时优先返回官方配置（apiKey 取自 auth store 内存，来自钥匙串，不落盘）
    if (officialApiEnabled.value) {
      return {
        type: 'openai-compat',
        apiKey: useAuthStore().apiKey,
        baseUrl: officialApiBaseUrl.value.trim() || 'http://127.0.0.1:8787',
        model: officialModel.value,
        enableWebSearch: enableWebSearch.value,
      }
    }
    return {
      type: activeProvider.value,
      apiKey: apiKey.value,
      baseUrl: baseUrl.value,
      model: model.value,
      enableWebSearch: enableWebSearch.value,
    }
  }

  /**
   * 获取图片转笔记专用模型配置（OpenAI 兼容格式）。
   * 未启用或未填写 API Key 时返回 null（调用方应引导用户去设置页配置）。
   */
  function getVisionProviderConfig(): ProviderConfig | null {
    if (!visionEnabled.value || !visionApiKey.value.trim()) return null
    return {
      type: 'openai-compat',
      apiKey: visionApiKey.value.trim(),
      baseUrl: visionBaseUrl.value.trim() || 'https://open.bigmodel.cn/api/paas',
      model: visionModel.value.trim() || 'glm-4v-flash',
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
    visionEnabled,
    visionBaseUrl,
    visionApiKey,
    visionModel,
    recentVaults,
    officialApiBaseUrl,
    officialApiEnabled,
    officialModel,
    saveSettings,
    loadSettings,
    addRecentVault,
    removeRecentVault,
    getProviderConfig,
    getVisionProviderConfig,
  }
})