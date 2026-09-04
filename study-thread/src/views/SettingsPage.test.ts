import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import * as authModule from '../stores/auth'
import SettingsPage from './SettingsPage.vue'
import GeneralSettingsPanel from '../components/settings/GeneralSettingsPanel.vue'
import ModelConfigPage from '../views/ModelConfigPage.vue'
import OfficialModelPage from '../views/OfficialModelPage.vue'
import CustomModelPage from '../views/CustomModelPage.vue'

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
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  sendCode: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  fetchPlans: vi.fn(),
  fetchUsageSummary: vi.fn(),
  redeemPlan: vi.fn(),
  forgotPassword: vi.fn(),
  resetPassword: vi.fn(),
  deleteAccount: vi.fn(),
}))

vi.mock('../composables/useToast', () => ({
  useToast: () => ({ error: state.toastError, success: state.toastSuccess, info: vi.fn() }),
}))

vi.mock('../api/zhizhi-api', () => ({
  ZhizhiApiError: class ZhizhiApiError extends Error {},
  fetchPlans: (...args: unknown[]) => state.fetchPlans(...args),
  fetchUsageSummary: (...args: unknown[]) => state.fetchUsageSummary(...args),
  redeemPlan: (...args: unknown[]) => state.redeemPlan(...args),
  forgotPassword: (...args: unknown[]) => state.forgotPassword(...args),
  resetPassword: (...args: unknown[]) => state.resetPassword(...args),
  deleteAccount: (...args: unknown[]) => state.deleteAccount(...args),
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
    login: async (username: string, password?: string, remember?: boolean) => {
      await state.login(username, password, remember)
      status.value = 'authenticated'
      user.value = { username, identifier: 'a@b.com', plan: { name: '标准' }, quota_tokens: 5000000 }
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
    getLastUsername: () => '',
    getRememberPreference: () => true,
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
    visionEnabled: false,
    visionBaseUrl: 'https://open.bigmodel.cn/api/paas',
    visionApiKey: '',
    visionModel: 'glm-4v-flash',
    saveSettings: vi.fn(),
  }),
}))

vi.mock('../api/openai-compat', () => ({
  PROVIDER_PRESETS: {},
}))

vi.mock('../api/provider-factory', () => ({
  createProvider: vi.fn(),
  createVisionProvider: vi.fn(),
}))

vi.mock('../utils/vault-fs', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
}))

// 与 src/router/index.ts 的设置嵌套路由保持一致
function createSettingsRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/settings',
        component: SettingsPage,
        children: [
          { path: '', redirect: { name: 'settings-general' } },
          {
            path: 'general',
            name: 'settings-general',
            component: GeneralSettingsPanel,
          },
          {
            path: 'models',
            name: 'settings-models',
            component: ModelConfigPage,
          },
          {
            path: 'models/official',
            name: 'settings-models-official',
            component: OfficialModelPage,
          },
          {
            path: 'models/custom',
            name: 'settings-models-custom',
            component: CustomModelPage,
          },
          {
            path: 'user',
            name: 'settings-user',
            component: OfficialModelPage,
          },
        ],
      },
    ],
  })
}

async function mountSettings() {
  const router = createSettingsRouter()
  await router.push('/settings')
  await router.isReady()

  const Host = defineComponent({ name: 'Host', render: () => h(RouterView) })
  const wrapper = mount(Host, {
    global: {
      plugins: [router],
      stubs: { VaultSettings: true },
    },
  })
  await flushPromises()
  return wrapper
}

describe('SettingsPage 设置页（侧边栏常驻嵌套路由布局）', () => {
  afterEach(() => {
    vi.useRealTimers()
    ;(authModule as unknown as { __resetAuthMock(): void }).__resetAuthMock()
    state.toastError.mockClear()
    state.toastSuccess.mockClear()
    state.sendCode.mockReset()
    state.login.mockReset()
    state.logout.mockReset()
    state.fetchPlans.mockReset()
    state.fetchUsageSummary.mockReset()
    state.redeemPlan.mockReset()
    state.forgotPassword.mockReset()
    state.resetPassword.mockReset()
    state.deleteAccount.mockReset()
  })

  it('渲染左侧导航栏（常规设置/模型配置/用户）并默认进入常规设置面板', async () => {
    const wrapper = await mountSettings()

    const navItems = wrapper.findAll('.settings-nav__item')
    expect(navItems).toHaveLength(3)
    expect(navItems[0].classes()).toContain('settings-nav__item--active')

    expect(wrapper.text()).toContain('常规设置')
    expect(wrapper.text()).toContain('模型配置')
    expect(wrapper.text()).toContain('用户')

    expect(wrapper.find('.settings-content__title').text()).toBe('常规设置')
    expect(wrapper.text()).toContain('关于知枝')
    expect(wrapper.text()).toContain('检查更新')
  })

  it('点击「模型配置」切换子路由且侧边栏常驻', async () => {
    const wrapper = await mountSettings()

    const navItems = wrapper.findAll('.settings-nav__item')
    await navItems[1].trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('返回设置')
    expect(wrapper.text()).toContain('知枝官方 API')
    expect(wrapper.text()).toContain('自定义模型')
    expect(wrapper.find('.settings-page__title').text()).toBe('模型配置')

    expect(wrapper.findAll('.settings-nav__item')).toHaveLength(3)
    expect(wrapper.findAll('.settings-nav__item')[1].classes()).toContain('settings-nav__item--active')
  })

  it('进入官方 API 子页后侧边栏仍常驻', async () => {
    const wrapper = await mountSettings()

    await wrapper.findAll('.settings-nav__item')[1].trigger('click')
    await flushPromises()

    const cards = wrapper.findAll('.entry-card')
    await cards[0].trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('套餐中心')
    expect(wrapper.findAll('.settings-nav__item')).toHaveLength(3)
    expect(wrapper.findAll('.settings-nav__item')[1].classes()).toContain('settings-nav__item--active')
  })

  it('进入自定义模型子页后侧边栏仍常驻', async () => {
    const wrapper = await mountSettings()

    await wrapper.findAll('.settings-nav__item')[1].trigger('click')
    await flushPromises()

    const cards = wrapper.findAll('.entry-card')
    await cards[1].trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('服务商')
    expect(wrapper.text()).toContain('API 地址')
    expect(wrapper.findAll('.settings-nav__item')).toHaveLength(3)
    expect(wrapper.findAll('.settings-nav__item')[1].classes()).toContain('settings-nav__item--active')
  })

  it('点击「用户」切换右侧登录/注册面板', async () => {
    const wrapper = await mountSettings()

    await wrapper.findAll('.settings-nav__item')[2].trigger('click')
    await flushPromises()

    expect(wrapper.find('.settings-content__title').text()).toBe('用户')
    expect(wrapper.text()).toContain('用户名')
    expect(wrapper.text()).toContain('密码')
    expect(wrapper.text()).toContain('注册')
    expect(wrapper.findAll('.settings-nav__item')).toHaveLength(3)
  })

  it('用户面板登录成功后展示已登录态', async () => {
    state.login.mockResolvedValue(undefined)
    state.fetchPlans.mockResolvedValue({ plans: [] })
    state.fetchUsageSummary.mockResolvedValue({
      days: 30,
      quota_tokens: 5_000_000,
      totals: { requests: 0, prompt_tokens: 0, completion_tokens: 0, cost_cents: 0 },
      daily: [],
      models: [],
    })
    const wrapper = await mountSettings()

    await wrapper.findAll('.settings-nav__item')[2].trigger('click')
    await flushPromises()

    await wrapper.find('#account-username').setValue('Alice2026')
    await wrapper.find('#account-password').setValue('Passw0rd')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(state.login).toHaveBeenCalledWith('Alice2026', 'Passw0rd', true)
    expect(wrapper.text()).toContain('Alice2026')
    expect(wrapper.text()).toContain('退出登录')
  })
})
