import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import * as authModule from '../../stores/auth'
import UserSettingsPanel from './UserSettingsPanel.vue'

const state = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  sendCode: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
}))

vi.mock('../../composables/useToast', () => ({
  useToast: () => ({ error: state.toastError, success: state.toastSuccess, info: vi.fn() }),
}))

vi.mock('../../api/zhizhi-api', () => ({
  ZhizhiApiError: class ZhizhiApiError extends Error {},
}))

vi.mock('../../stores/auth', async () => {
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

describe('UserSettingsPanel 设置-用户面板', () => {
  afterEach(() => {
    vi.useRealTimers()
    ;(authModule as unknown as { __resetAuthMock(): void }).__resetAuthMock()
    state.toastError.mockClear()
    state.toastSuccess.mockClear()
    state.sendCode.mockReset()
    state.login.mockReset()
    state.register.mockReset()
    state.logout.mockReset()
  })

  it('默认登录模式：渲染用户名/密码表单与「登录」「注册」切换', () => {
    const wrapper = mount(UserSettingsPanel)

    expect(wrapper.find('#user-username').exists()).toBe(true)
    expect(wrapper.find('#user-password').exists()).toBe(true)
    expect(wrapper.find('.btn-primary').text()).toBe('登录')
    expect(wrapper.text()).toContain('注册')
  })

  it('切换到注册模式：渲染邮箱/验证码/用户名/密码/确认密码', async () => {
    const wrapper = mount(UserSettingsPanel)

    const modeButtons = wrapper.findAll('.mode-switch__item')
    await modeButtons[1].trigger('click')

    expect(wrapper.find('#user-email').exists()).toBe(true)
    expect(wrapper.find('#user-code').exists()).toBe(true)
    expect(wrapper.find('#user-reg-username').exists()).toBe(true)
    expect(wrapper.find('#user-reg-password').exists()).toBe(true)
    expect(wrapper.find('#user-reg-password2').exists()).toBe(true)
    expect(wrapper.find('.btn-primary').text()).toBe('注册')
  })

  it('登录模式空提交提示错误，不调用接口', async () => {
    const wrapper = mount(UserSettingsPanel)

    await wrapper.find('form').trigger('submit')
    expect(state.toastError).toHaveBeenCalledWith('请输入用户名与密码')
    expect(state.login).not.toHaveBeenCalled()
  })

  it('注册模式：非法邮箱发验证码提示错误', async () => {
    const wrapper = mount(UserSettingsPanel)
    const modeButtons = wrapper.findAll('.mode-switch__item')
    await modeButtons[1].trigger('click')

    const sendButton = wrapper.findAll('.btn').find((b) => b.text() === '获取验证码')!
    await sendButton.trigger('click')

    expect(state.toastError).toHaveBeenCalledWith('请输入有效的邮箱地址')
    expect(state.sendCode).not.toHaveBeenCalled()
  })

  it('注册模式：输入邮箱获取验证码并进入倒计时', async () => {
    vi.useFakeTimers()
    const wrapper = mount(UserSettingsPanel)
    const modeButtons = wrapper.findAll('.mode-switch__item')
    await modeButtons[1].trigger('click')
    await wrapper.find('#user-email').setValue('a@b.com')

    const sendButton = wrapper.findAll('.btn').find((b) => b.text() === '获取验证码')!
    await sendButton.trigger('click')
    expect(state.sendCode).toHaveBeenCalled()

    expect(sendButton.text()).toBe('60s')
    expect(sendButton.attributes('disabled')).toBeDefined()
    await vi.advanceTimersByTimeAsync(1000)
    expect(sendButton.text()).toBe('59s')
  })

  it('登录成功进入已登录态并展示用户名与套餐', async () => {
    state.login.mockResolvedValue(undefined)
    const wrapper = mount(UserSettingsPanel)
    await wrapper.find('#user-username').setValue('Alice2026')
    await wrapper.find('#user-password').setValue('Passw0rd')

    await wrapper.find('form').trigger('submit')

    expect(state.login).toHaveBeenCalledWith('Alice2026', 'Passw0rd')
    expect(state.toastSuccess).toHaveBeenCalledWith('登录成功，官方 API 已启用')
    expect(wrapper.text()).toContain('Alice2026')
    expect(wrapper.text()).toContain('标准')
    expect(wrapper.text()).toContain('退出登录')
  })

  it('注册提交校验：用户名含非法字符提示错误', async () => {
    const wrapper = mount(UserSettingsPanel)
    const modeButtons = wrapper.findAll('.mode-switch__item')
    await modeButtons[1].trigger('click')
    await wrapper.find('#user-email').setValue('a@b.com')
    await wrapper.find('#user-code').setValue('123456')
    await wrapper.find('#user-reg-username').setValue('bad name!')
    await wrapper.find('#user-reg-password').setValue('Passw0rd')
    await wrapper.find('#user-reg-password2').setValue('Passw0rd')

    await wrapper.find('form').trigger('submit')

    expect(state.toastError).toHaveBeenCalledWith('用户名仅允许 3-32 位数字与大小写字母')
    expect(state.register).not.toHaveBeenCalled()
  })

  it('注册提交校验：两次密码不一致提示错误', async () => {
    const wrapper = mount(UserSettingsPanel)
    const modeButtons = wrapper.findAll('.mode-switch__item')
    await modeButtons[1].trigger('click')
    await wrapper.find('#user-email').setValue('a@b.com')
    await wrapper.find('#user-code').setValue('123456')
    await wrapper.find('#user-reg-username').setValue('Alice2026')
    await wrapper.find('#user-reg-password').setValue('Passw0rd')
    await wrapper.find('#user-reg-password2').setValue('Passw0rX')

    await wrapper.find('form').trigger('submit')

    expect(state.toastError).toHaveBeenCalledWith('两次输入的密码不一致')
    expect(state.register).not.toHaveBeenCalled()
  })

  it('注册成功：调用 register 并提示「注册成功，已自动登录」', async () => {
    state.register.mockResolvedValue(undefined)
    const wrapper = mount(UserSettingsPanel)
    const modeButtons = wrapper.findAll('.mode-switch__item')
    await modeButtons[1].trigger('click')
    await wrapper.find('#user-email').setValue('a@b.com')
    await wrapper.find('#user-code').setValue('123456')
    await wrapper.find('#user-reg-username').setValue('Alice2026')
    await wrapper.find('#user-reg-password').setValue('Passw0rd')
    await wrapper.find('#user-reg-password2').setValue('Passw0rd')

    await wrapper.find('form').trigger('submit')

    expect(state.register).toHaveBeenCalledWith('a@b.com', '123456', 'Alice2026', 'Passw0rd')
    expect(state.toastSuccess).toHaveBeenCalledWith('注册成功，已自动登录')
    expect(wrapper.text()).toContain('Alice2026')
    expect(wrapper.text()).toContain('退出登录')
  })

  it('登录失败提示错误并保持表单', async () => {
    state.login.mockRejectedValue(new Error('用户名或密码错误'))
    const wrapper = mount(UserSettingsPanel)
    await wrapper.find('#user-username').setValue('Alice2026')
    await wrapper.find('#user-password').setValue('WrongPass')

    await wrapper.find('form').trigger('submit')

    expect(state.toastError).toHaveBeenCalledWith('用户名或密码错误')
    expect(wrapper.text()).toContain('登录')
    expect(wrapper.text()).not.toContain('退出登录')
  })

  it('已登录态登出后回到登录表单', async () => {
    state.login.mockResolvedValue(undefined)
    state.logout.mockResolvedValue(undefined)
    const wrapper = mount(UserSettingsPanel)
    await wrapper.find('#user-username').setValue('Alice2026')
    await wrapper.find('#user-password').setValue('Passw0rd')
    await wrapper.find('form').trigger('submit')

    const logoutButton = wrapper.findAll('.btn').find((b) => b.text() === '退出登录')!
    await logoutButton.trigger('click')

    expect(state.logout).toHaveBeenCalled()
    expect(wrapper.text()).toContain('登录')
    expect(wrapper.text()).not.toContain('退出登录')
  })
})
