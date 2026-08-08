import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSettingsStore } from './settings'

describe('settings store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('初始状态为默认值', () => {
    const store = useSettingsStore()
    expect(store.activeProvider).toBe('openai-compat')
    expect(store.apiKey).toBe('')
    expect(store.baseUrl).toBe('https://api.openai.com')
    expect(store.model).toBe('gpt-4o')
    expect(store.enableWebSearch).toBe(true)
    expect(store.autoGenerateNoteTitle).toBe(true)
    expect(store.autoGenerateNoteTags).toBe(true)
    expect(store.reviewAlgorithm).toBe('classic')
    expect(store.recentVaults).toEqual([])
  })

  it('saveSettings 写入 localStorage', () => {
    const store = useSettingsStore()
    store.activeProvider = 'anthropic'
    store.apiKey = 'sk-test-key'
    store.baseUrl = 'https://api.anthropic.com'
    store.model = 'claude-sonnet-4-6'
    store.enableWebSearch = false
    store.autoGenerateNoteTitle = false
    store.autoGenerateNoteTags = false
    store.reviewAlgorithm = 'fsrs'
    store.saveSettings()

    const raw = localStorage.getItem('study-thread-settings')
    expect(raw).not.toBeNull()
    const data = JSON.parse(raw!)
    expect(data.activeProvider).toBe('anthropic')
    expect(data.apiKey).toBe('sk-test-key')
    expect(data.baseUrl).toBe('https://api.anthropic.com')
    expect(data.model).toBe('claude-sonnet-4-6')
    expect(data.enableWebSearch).toBe(false)
    expect(data.autoGenerateNoteTitle).toBe(false)
    expect(data.autoGenerateNoteTags).toBe(false)
    expect(data.reviewAlgorithm).toBe('fsrs')
  })

  it('loadSettings 从 localStorage 恢复设置', () => {
    localStorage.setItem('study-thread-settings', JSON.stringify({
      activeProvider: 'anthropic',
      apiKey: 'sk-saved-key',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-opus-4-1',
      enableWebSearch: false,
      autoGenerateNoteTitle: false,
      autoGenerateNoteTags: false,
      reviewAlgorithm: 'fsrs',
    }))

    const store = useSettingsStore()
    expect(store.activeProvider).toBe('anthropic')
    expect(store.apiKey).toBe('sk-saved-key')
    expect(store.baseUrl).toBe('https://api.anthropic.com')
    expect(store.model).toBe('claude-opus-4-1')
    expect(store.enableWebSearch).toBe(false)
    expect(store.autoGenerateNoteTitle).toBe(false)
    expect(store.autoGenerateNoteTags).toBe(false)
    expect(store.reviewAlgorithm).toBe('fsrs')
  })

  it('loadSettings 处理无效的 reviewAlgorithm 回退 classic', () => {
    localStorage.setItem('study-thread-settings', JSON.stringify({ reviewAlgorithm: 'unknown' }))
    const store = useSettingsStore()
    expect(store.reviewAlgorithm).toBe('classic')
  })

  it('loadSettings 处理无效 JSON 使用默认值', () => {
    localStorage.setItem('study-thread-settings', 'invalid json')
    const store = useSettingsStore()
    expect(store.activeProvider).toBe('openai-compat')
    expect(store.apiKey).toBe('')
  })

  it('loadSettings 处理缺失字段使用默认值', () => {
    localStorage.setItem('study-thread-settings', JSON.stringify({}))
    const store = useSettingsStore()
    expect(store.activeProvider).toBe('openai-compat')
    expect(store.baseUrl).toBe('https://api.openai.com')
    expect(store.model).toBe('gpt-4o')
    expect(store.enableWebSearch).toBe(true)
  })

  it('addRecentVault 添加最近 vault 并去重', () => {
    const store = useSettingsStore()
    store.addRecentVault('/path/to/vault1')
    store.addRecentVault('/path/to/vault2')
    store.addRecentVault('/path/to/vault1') // 重复

    expect(store.recentVaults).toEqual(['/path/to/vault1', '/path/to/vault2'])
  })

  it('addRecentVault 最多保留 5 个', () => {
    const store = useSettingsStore()
    for (let i = 1; i <= 7; i++) {
      store.addRecentVault(`/vault${i}`)
    }
    expect(store.recentVaults).toHaveLength(5)
    expect(store.recentVaults[0]).toBe('/vault7')
  })

  it('getProviderConfig 返回正确的配置', () => {
    const store = useSettingsStore()
    store.activeProvider = 'anthropic'
    store.apiKey = 'sk-key'
    store.baseUrl = 'https://custom.api'
    store.model = 'custom-model'
    store.enableWebSearch = false

    const config = store.getProviderConfig()
    expect(config).toEqual({
      type: 'anthropic',
      apiKey: 'sk-key',
      baseUrl: 'https://custom.api',
      model: 'custom-model',
      enableWebSearch: false,
    })
  })
})