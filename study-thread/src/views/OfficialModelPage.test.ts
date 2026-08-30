import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import * as authModule from '../stores/auth'
import OfficialModelPage from './OfficialModelPage.vue'

const state = vi.hoisted(() => ({
  push: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  sendCode: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
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
    login: async (username: string, password?: string) => {
      await state.login(username, password)
      status.value = 'authenticated'
      user.value = { username, identifier: 'a@b.com', plan: { name: '标准' }, quota_tokens: 5000000 }
    },
    register: async (email: string, code: string, username: string, password: string) => {
      await state.register(email, code, username, password)
      status.value = 'authenticated'
      user.value = { username, identifier: email, plan: { name: '标准' }, quota_tokens: 5000000 }
    },
    logout: async () => {
      await state.logout()
      status.value = 'anonymous'
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

describe('OfficialModelPage 知枝官方 API 页', () => {
  afterEach(() => {
    vi.useRealTimers()
    ;(authModule as unknown as { __resetAuthMock(): void }).__resetAuthMock()
    state.push.mockClear()
    state.toastError.mockClear()
    state.toastSuccess.mockClear()
    state.sendCode.mockReset()
    state.login.mockReset()
    state.register.mockReset()
    state.logout.mockReset()
  })

  it('渲染登录/注册引导、套餐预览与自动配置说明', () => {
    const wrapper = mount(OfficialModelPage)

    expect(wrapper.text()).toContain('知枝官方 API')
    expect(wrapper.text()).toContain('知枝账号')
    expect(wrapper.text()).toContain('套餐预览')
    expect(wrapper.text()).toContain('如何工作')
    expect(wrapper.text()).toContain('用户名')
    expect(wrapper.text()).toContain('密码')
    expect(wrapper.text()).toContain('注册')
  })

  it('空用户名登录提示错误，不调用接口', async () => {
    const wrapper = mount(OfficialModelPage)
    await wrapper.find('form').trigger('submit')

    expect(state.toastError).toHaveBeenCalledWith('请输入用户名与密码')
    expect(state.login).not.toHaveBeenCalled()
  })

  it('注册模式：输入邮箱获取验证码并进入倒计时', async () => {
    vi.useFakeTimers()
    const wrapper = mount(OfficialModelPage)
    const modeButtons = wrapper.findAll('.mode-switch__item')
    await modeButtons[1].trigger('click')
    await wrapper.find('#account-email').setValue('a@b.com')

    const sendButton = wrapper.findAll('.btn').find((b) => b.text() === '获取验证码')!
    await sendButton.trigger('click')
    expect(state.sendCode).toHaveBeenCalled()

    expect(sendButton.text()).toBe('60s')
    expect(sendButton.attributes('disabled')).toBeDefined()
    await vi.advanceTimersByTimeAsync(1000)
    expect(sendButton.text()).toBe('59s')
  })

  it('登录成功进入已登录态并展示账号与套餐', async () => {
    state.login.mockResolvedValue(undefined)
    const wrapper = mount(OfficialModelPage)
    await wrapper.find('#account-username').setValue('Alice2026')
    await wrapper.find('#account-password').setValue('Passw0rd')

    await wrapper.find('form').trigger('submit')

    expect(state.login).toHaveBeenCalledWith('Alice2026', 'Passw0rd')
    expect(state.toastSuccess).toHaveBeenCalledWith('登录成功，官方 API 已启用')
    expect(wrapper.text()).toContain('Alice2026')
    expect(wrapper.text()).toContain('标准')
    expect(wrapper.text()).toContain('退出登录')
  })

  it('登录失败提示错误并保持登录表单', async () => {
    state.login.mockRejectedValue(new Error('用户名或密码错误'))
    const wrapper = mount(OfficialModelPage)
    await wrapper.find('#account-username').setValue('Alice2026')
    await wrapper.find('#account-password').setValue('WrongPass')

    await wrapper.find('form').trigger('submit')

    expect(state.toastError).toHaveBeenCalledWith('用户名或密码错误')
    expect(wrapper.text()).toContain('登录')
    expect(wrapper.text()).not.toContain('退出登录')
  })

  it('注册成功：调用 register 并提示「注册成功，已自动登录」', async () => {
    state.register.mockResolvedValue(undefined)
    const wrapper = mount(OfficialModelPage)
    const modeButtons = wrapper.findAll('.mode-switch__item')
    await modeButtons[1].trigger('click')
    await wrapper.find('#account-email').setValue('a@b.com')
    await wrapper.find('#account-code').setValue('123456')
    await wrapper.find('#account-reg-username').setValue('Alice2026')
    await wrapper.find('#account-reg-password').setValue('Passw0rd')
    await wrapper.find('#account-reg-password2').setValue('Passw0rd')

    await wrapper.find('form').trigger('submit')

    expect(state.register).toHaveBeenCalledWith('a@b.com', '123456', 'Alice2026', 'Passw0rd')
    expect(state.toastSuccess).toHaveBeenCalledWith('注册成功，已自动登录')
    expect(wrapper.text()).toContain('Alice2026')
    expect(wrapper.text()).toContain('退出登录')
  })

  it('已登录态登出后回到登录表单', async () => {
    state.login.mockResolvedValue(undefined)
    state.logout.mockResolvedValue(undefined)
    const wrapper = mount(OfficialModelPage)
    await wrapper.find('#account-username').setValue('Alice2026')
    await wrapper.find('#account-password').setValue('Passw0rd')
    await wrapper.find('form').trigger('submit')

    const logoutButton = wrapper.findAll('.btn').find((b) => b.text() === '退出登录')!
    await logoutButton.trigger('click')

    expect(state.logout).toHaveBeenCalled()
    expect(wrapper.text()).toContain('登录')
    expect(wrapper.text()).not.toContain('退出登录')
  })

  it('开通套餐按钮提示未上线', async () => {
    const wrapper = mount(OfficialModelPage)
    const buttons = wrapper.findAll('.btn--block')
    expect(buttons.length).toBeGreaterThan(0)
    await buttons[0].trigger('click')

    expect(state.toastError).toHaveBeenCalledWith('账号服务尚未上线，敬请期待')
  })

  it('返回按钮跳回模型配置入口页', async () => {
    const wrapper = mount(OfficialModelPage)
    await wrapper.find('.back-link').trigger('click')

    expect(state.push).toHaveBeenCalledWith({ name: 'settings-models' })
  })
})
