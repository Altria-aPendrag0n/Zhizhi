import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import SettingsPage from './SettingsPage.vue'

// 与 AboutSection.test.ts 一致：AboutSection 依赖的 Tauri 插件在测试环境需 mock
vi.mock('@tauri-apps/api/app', () => ({
  getVersion: vi.fn().mockResolvedValue('0.1.0'),
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  save: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: vi.fn().mockResolvedValue(null),
}))

vi.mock('@tauri-apps/plugin-process', () => ({
  relaunch: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../stores/settings', () => ({
  useSettingsStore: () => ({
    activeProvider: 'openai-compat',
    apiKey: '',
    baseUrl: 'https://api.openai.com',
    model: 'gpt-4o',
    enableWebSearch: true,
    autoGenerateNoteTitle: true,
    autoGenerateNoteTags: true,
    reviewAlgorithm: 'classic',
    saveSettings: vi.fn(),
  }),
}))

vi.mock('../api/openai-compat', () => ({
  PROVIDER_PRESETS: {},
}))

vi.mock('../api/provider-factory', () => ({
  createProvider: vi.fn(),
}))

vi.mock('../utils/vault-fs', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
}))

describe('SettingsPage 设置页', () => {
  it('渲染「关于知枝」区块与「检查更新」按钮', () => {
    const wrapper = mount(SettingsPage, {
      global: {
        stubs: { VaultSettings: true },
      },
    })

    // 回归防线：AboutSection 曾在模板中使用但未 import，导致「关于知枝」区块（含检查更新按钮）不渲染
    expect(wrapper.text()).toContain('关于知枝')
    expect(wrapper.text()).toContain('检查更新')
  })
})
