import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import * as authModule from '../../stores/auth'
import UserSettingsPanel from './UserSettingsPanel.vue'

const state = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  sendCode: vi.fn(),
  login: vi.fn(),
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

async function fillForm(wrapper: ReturnType<typeof mount>, account: string, code: string) {
  await wrapper.find('#user-account').setValue(account)
  await wrapper.find('#user-code').setValue(code)
}

describe('UserSettingsPanel 设置-用户面板', () => {
  afterEach(() => {
    vi.useRealTimers()
    ;(authModule as unknown as { __resetAuthMock(): void }).__resetAuthMock()
    state.toastError.mockClear()
    state.toastSuccess.mockClear()
    state.sendCode.mockReset()
    state.login.mockReset()
    state.logout.mockReset()
  })

  it('默认登录模式：渲染账号/验证码表单与「登录」「注册」切换', () => {
    const wrapper = mount(UserSettingsPanel)

    expect(wrapper.text()).toContain('账号（邮箱 / 手机号）')
    expect(wrapper.text()).toContain('验证码')
    expect(wrapper.text()).toContain('获取验证码')
    expect(wrapper.find('.btn-primary').text()).toBe('登录')
    expect(wrapper.text()).toContain('注册')
  })

  it('切换到注册模式：提交按钮文案与提示变化', async () => {
    const wrapper = mount(UserSettingsPanel)

    const modeButtons = wrapper.findAll('.mode-switch__item')
    await modeButtons[1].trigger('click')

    expect(wrapper.find('.btn-primary').text()).toBe('注册')
    expect(wrapper.text()).toContain('注册新账号')
  })

  it('空账号获取验证码提示错误，不调用接口', async () => {
    const wrapper = mount(UserSettingsPanel)

    const sendButton = wrapper.findAll('.btn').find((b) => b.text() === '获取验证码')!
    await sendButton.trigger('click')

    expect(state.toastError).toHaveBeenCalledWith('请先输入账号（邮箱或手机号）')
    expect(state.sendCode).not.toHaveBeenCalled()
  })

  it('输入账号获取验证码：调用 sendCode 并进入倒计时', async () => {
    vi.useFakeTimers()
    const wrapper = mount(UserSettingsPanel)
    await wrapper.find('#user-account').setValue('user@example.com')

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
    const wrapper = mount(UserSettingsPanel)
    await fillForm(wrapper, 'user@example.com', '123456')

    await wrapper.find('.btn-primary').trigger('click')

    expect(state.login).toHaveBeenCalledWith('user@example.com', '123456')
    expect(state.toastSuccess).toHaveBeenCalledWith('登录成功，官方 API 已启用')
    expect(wrapper.text()).toContain('user@example.com')
    expect(wrapper.text()).toContain('标准')
    expect(wrapper.text()).toContain('退出登录')
  })

  it('注册模式提交成功后提示「注册成功，已自动登录」', async () => {
    state.login.mockResolvedValue(undefined)
    const wrapper = mount(UserSettingsPanel)

    const modeButtons = wrapper.findAll('.mode-switch__item')
    await modeButtons[1].trigger('click')
    await fillForm(wrapper, 'new@example.com', '123456')

    await wrapper.find('.btn-primary').trigger('click')

    expect(state.login).toHaveBeenCalledWith('new@example.com', '123456')
    expect(state.toastSuccess).toHaveBeenCalledWith('注册成功，已自动登录')
    expect(wrapper.text()).toContain('new@example.com')
  })

  it('登录失败提示错误并保持表单', async () => {
    state.login.mockRejectedValue(new Error('验证码错误'))
    const wrapper = mount(UserSettingsPanel)
    await fillForm(wrapper, 'user@example.com', '000000')

    await wrapper.find('.btn-primary').trigger('click')

    expect(state.toastError).toHaveBeenCalledWith('验证码错误')
    expect(wrapper.text()).toContain('登录')
    expect(wrapper.text()).not.toContain('退出登录')
  })

  it('已登录态登出后回到登录表单', async () => {
    state.login.mockResolvedValue(undefined)
    state.logout.mockResolvedValue(undefined)
    const wrapper = mount(UserSettingsPanel)
    await fillForm(wrapper, 'user@example.com', '123456')
    await wrapper.find('.btn-primary').trigger('click')

    const logoutButton = wrapper.findAll('.btn').find((b) => b.text() === '退出登录')!
    await logoutButton.trigger('click')

    expect(state.logout).toHaveBeenCalled()
    expect(wrapper.text()).toContain('获取验证码')
    expect(wrapper.text()).not.toContain('退出登录')
  })
})
