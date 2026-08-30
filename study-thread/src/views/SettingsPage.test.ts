import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import * as authModule from '../stores/auth'
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

const state = vi.hoisted(() => ({
  push: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  sendCode: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: state.push }),
}))

vi.mock('../composables/useToast', () => ({
  useToast: () => ({ error: state.toastError, success: state.toastSuccess, info: vi.fn() }),
}))

vi.mock('../api/zhizhi-api', () => ({
  ZhizhiApiError: class ZhizhiApiError extends Error {},
}))

vi.mock('../stores/auth', async () => {
  const { ref, computed, reactive } = await import('vue')
  const status = ref<'anonymous' | 'authenticating' | 'authenticated'>('anonymous')
  const user = ref<Record<string, unknown> | null>(null)
  const isOfficialActive = computed(() => status.value === 'authenticated')
  const store = reactive({
    status,
    user,
    isOfficialActive,
    sendCode: async () => {
      state.sendCode()
      return 60
    },
    login: async (identifier: string, code?: string) => {
      await state.login(identifier, code)
      status.value = 'authenticated'
      user.value = { identifier, plan: { name: '标准' }, quota_tokens: 5000000 }
    },
    logout: async () => {
      await state.logout()
      status.value = 'anonymous'
      user.value = null
    },
  })
  return {
    __resetAuthMock: () => {
      status.value = 'anonymous'
      user.value = null
    },
    useAuthStore: () => store,
  }
})

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

describe('SettingsPage 设置页（侧边栏布局）', () => {
  afterEach(() => {
    vi.useRealTimers()
    ;(authModule as unknown as { __resetAuthMock(): void }).__resetAuthMock()
    state.push.mockClear()
    state.toastError.mockClear()
    state.toastSuccess.mockClear()
    state.sendCode.mockReset()
    state.login.mockReset()
    state.logout.mockReset()
  })

  it('渲染左侧导航栏（常规设置/模型配置/用户）与默认常规设置面板', () => {
    const wrapper = mount(SettingsPage, {
      global: {
        stubs: { VaultSettings: true },
      },
    })

    // 左侧三个栏目
    expect(wrapper.text()).toContain('常规设置')
    expect(wrapper.text()).toContain('模型配置')
    expect(wrapper.text()).toContain('用户')

    // 默认显示常规设置面板：关于知枝 + 检查更新（回归防线：AboutSection 曾在模板中使用但未 import）
    expect(wrapper.text()).toContain('关于知枝')
    expect(wrapper.text()).toContain('检查更新')
  })

  it('点击「模型配置」切换右侧面板并更新标题', async () => {
    const wrapper = mount(SettingsPage, {
      global: {
        stubs: { VaultSettings: true },
      },
    })

    const navItems = wrapper.findAll('.settings-nav__item')
    await navItems[1].trigger('click')

    expect(wrapper.find('.settings-content__title').text()).toBe('模型配置')
    expect(wrapper.text()).toContain('知枝官方 API')
    expect(wrapper.text()).toContain('自定义模型')
  })

  it('点击「用户」切换右侧登录/注册面板', async () => {
    const wrapper = mount(SettingsPage, {
      global: {
        stubs: { VaultSettings: true },
      },
    })

    const navItems = wrapper.findAll('.settings-nav__item')
    await navItems[2].trigger('click')

    expect(wrapper.find('.settings-content__title').text()).toBe('用户')
    expect(wrapper.text()).toContain('获取验证码')
    expect(wrapper.text()).toContain('注册')
  })

  it('用户面板登录成功后展示已登录态', async () => {
    state.login.mockResolvedValue(undefined)
    const wrapper = mount(SettingsPage, {
      global: {
        stubs: { VaultSettings: true },
      },
    })

    const navItems = wrapper.findAll('.settings-nav__item')
    await navItems[2].trigger('click')

    await wrapper.find('#user-account').setValue('user@example.com')
    await wrapper.find('#user-code').setValue('123456')
    await wrapper.find('.btn-primary').trigger('click')

    expect(state.login).toHaveBeenCalledWith('user@example.com', '123456')
    expect(wrapper.text()).toContain('user@example.com')
    expect(wrapper.text()).toContain('退出登录')
  })
})
