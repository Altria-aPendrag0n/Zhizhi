import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import * as authModule from '../stores/auth'
import OfficialModelPage from './OfficialModelPage.vue'

const state = vi.hoisted(() => ({
  push: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toastInfo: vi.fn(),
  sendCode: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  fetchMe: vi.fn(),
  fetchPlans: vi.fn(),
  fetchUsageSummary: vi.fn(),
  redeemPlan: vi.fn(),
  forgotPassword: vi.fn(),
  resetPassword: vi.fn(),
  deleteAccount: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: state.push }),
}))

vi.mock('../composables/useToast', () => ({
  useToast: () => ({ error: state.toastError, success: state.toastSuccess, info: state.toastInfo }),
}))

vi.mock('../api/zhizhi-api', () => ({
  ZhizhiApiError: class ZhizhiApiError extends Error {},
  fetchPlans: (...args: unknown[]) => state.fetchPlans(...args),
  fetchUsageSummary: (...args: unknown[]) => state.fetchUsageSummary(...args),
  redeemPlan: (...args: unknown[]) => state.redeemPlan(...args),
  forgotPassword: (...args: unknown[]) => state.forgotPassword(...args),
  resetPassword: (...args: unknown[]) => state.resetPassword(...args),
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
      user.value = {
        username,
        identifier: 'a@b.com',
        plan: { name: '标准' },
        plan_expires_at: 1800000000000,
        quota_tokens: 5000000,
      }
    },
    register: async (email: string, code: string, username: string, password: string) => {
      await state.register(email, code, username, password)
      status.value = 'authenticated'
      user.value = {
        username,
        identifier: email,
        plan: { name: '标准' },
        plan_expires_at: 1800000000000,
        quota_tokens: 5000000,
      }
    },
    logout: async () => {
      await state.logout()
      status.value = 'anonymous'
    },
    fetchMe: async () => {
      state.fetchMe()
    },
    deleteAccount: async () => {
      await state.deleteAccount()
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

const MOCK_PLANS = [
  { id: 'plan-lite', name: '轻量', price_cents: 990, token_quota: 1_000_000, model_group: 'lite' },
  { id: 'plan-standard', name: '标准', price_cents: 2990, token_quota: 5_000_000, model_group: 'standard' },
]

describe('OfficialModelPage 知枝官方 API 页', () => {
  afterEach(() => {
    vi.useRealTimers()
    ;(authModule as unknown as { __resetAuthMock(): void }).__resetAuthMock()
    for (const fn of [
      state.push,
      state.toastError,
      state.toastSuccess,
      state.toastInfo,
      state.fetchMe,
      state.fetchPlans,
      state.fetchUsageSummary,
      state.redeemPlan,
      state.forgotPassword,
      state.resetPassword,
      state.deleteAccount,
    ]) {
      fn.mockClear()
    }
    for (const fn of [state.sendCode, state.login, state.register, state.logout]) {
      fn.mockReset()
    }
  })

  it('渲染登录/注册引导、套餐中心与自动配置说明', () => {
    const wrapper = mount(OfficialModelPage)

    expect(wrapper.text()).toContain('知枝官方 API')
    expect(wrapper.text()).toContain('知枝账号')
    expect(wrapper.text()).toContain('套餐中心')
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
    state.fetchUsageSummary.mockResolvedValue({
      days: 30,
      quota_tokens: 5_000_000,
      totals: { requests: 0, prompt_tokens: 0, completion_tokens: 0, cost_cents: 0 },
      daily: [],
      models: [],
    })
    const wrapper = mount(OfficialModelPage)
    await wrapper.find('#account-username').setValue('Alice2026')
    await wrapper.find('#account-password').setValue('Passw0rd')

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(state.login).toHaveBeenCalledWith('Alice2026', 'Passw0rd')
    expect(state.toastSuccess).toHaveBeenCalledWith('登录成功，官方 API 已启用')
    expect(wrapper.text()).toContain('Alice2026')
    expect(wrapper.text()).toContain('标准')
    expect(wrapper.text()).toContain('套餐到期')
    expect(wrapper.text()).toContain('退出登录')
    expect(state.fetchUsageSummary).toHaveBeenCalledWith(30)
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

  it('套餐中心渲染服务端套餐列表（价格/额度/兑换按钮）', async () => {
    state.fetchPlans.mockResolvedValue({ plans: MOCK_PLANS })
    const wrapper = mount(OfficialModelPage)
    await flushPromises()

    expect(wrapper.text()).toContain('轻量')
    expect(wrapper.text()).toContain('标准')
    expect(wrapper.text()).toContain('¥10 / 期')
    expect(wrapper.text()).toContain('¥30 / 期')
    expect(wrapper.text()).toContain('每期 1.0M tokens')
    expect(wrapper.text()).toContain('登录后兑换')
  })

  it('未登录点击开通提示登录后兑换', async () => {
    state.fetchPlans.mockResolvedValue({ plans: MOCK_PLANS })
    const wrapper = mount(OfficialModelPage)
    await flushPromises()

    const buttons = wrapper.findAll('.btn--block')
    expect(buttons.length).toBeGreaterThan(0)
    await buttons[0].trigger('click')

    expect(state.toastInfo).toHaveBeenCalledWith('登录后使用兑换码开通套餐')
  })

  it('登录后兑换成功：调用 redeemPlan 并刷新账户', async () => {
    state.login.mockResolvedValue(undefined)
    state.fetchUsageSummary.mockResolvedValue({
      days: 30,
      quota_tokens: 5_000_000,
      totals: { requests: 0, prompt_tokens: 0, completion_tokens: 0, cost_cents: 0 },
      daily: [],
      models: [],
    })
    state.redeemPlan.mockResolvedValue({
      success: true,
      plan: { id: 'plan-lite', name: '轻量', token_quota: 1_000_000 },
      plan_expires_at: 1800000000000,
      quota_tokens: 6_000_000,
    })
    const wrapper = mount(OfficialModelPage)
    await wrapper.find('#account-username').setValue('Alice2026')
    await wrapper.find('#account-password').setValue('Passw0rd')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    await wrapper.find('.redeem-input').setValue('zhizhi-AAAA-BBBB-CCCC')
    await wrapper.find('.redeem-row .btn-primary').trigger('click')
    await flushPromises()

    expect(state.redeemPlan).toHaveBeenCalledWith('zhizhi-AAAA-BBBB-CCCC')
    expect(state.toastSuccess).toHaveBeenCalledWith(
      '兑换成功：轻量 已开通，当前额度 6.0M tokens',
    )
    expect(state.fetchMe).toHaveBeenCalled()
  })

  it('兑换失败提示服务端错误', async () => {
    state.login.mockResolvedValue(undefined)
    state.fetchUsageSummary.mockResolvedValue({
      days: 30,
      quota_tokens: 5_000_000,
      totals: { requests: 0, prompt_tokens: 0, completion_tokens: 0, cost_cents: 0 },
      daily: [],
      models: [],
    })
    state.redeemPlan.mockRejectedValue(new Error('already-used'))
    const wrapper = mount(OfficialModelPage)
    await wrapper.find('#account-username').setValue('Alice2026')
    await wrapper.find('#account-password').setValue('Passw0rd')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    await wrapper.find('.redeem-input').setValue('zhizhi-AAAA-BBBB-CCCC')
    await wrapper.find('.redeem-row .btn-primary').trigger('click')
    await flushPromises()

    expect(state.toastError).toHaveBeenCalledWith('already-used')
  })

  it('返回按钮跳回模型配置入口页', async () => {
    const wrapper = mount(OfficialModelPage)
    await wrapper.find('.back-link').trigger('click')

    expect(state.push).toHaveBeenCalledWith({ name: 'settings-models' })
  })

  it('忘记密码入口切换到重置表单并发送重置验证码', async () => {
    state.forgotPassword.mockResolvedValue({ success: true, cooldown_seconds: 60 })
    const wrapper = mount(OfficialModelPage)

    const forgotButton = wrapper.findAll('button').find((b) => b.text() === '忘记密码？')!
    await forgotButton.trigger('click')

    expect(wrapper.find('#reset-email').exists()).toBe(true)
    await wrapper.find('#reset-email').setValue('a@b.com')

    const sendButton = wrapper.findAll('.btn').find((b) => b.text() === '获取验证码')!
    await sendButton.trigger('click')

    expect(state.forgotPassword).toHaveBeenCalledWith('a@b.com')
    expect(state.toastSuccess).toHaveBeenCalledWith('重置验证码已发送，请查收邮箱')
  })

  it('重置密码成功后回到登录表单', async () => {
    state.resetPassword.mockResolvedValue({ success: true })
    const wrapper = mount(OfficialModelPage)

    await wrapper.findAll('button').find((b) => b.text() === '忘记密码？')!.trigger('click')
    await wrapper.find('#reset-email').setValue('a@b.com')
    await wrapper.find('#reset-code').setValue('123456')
    await wrapper.find('#reset-password').setValue('NewPass9')
    await wrapper.find('#reset-password2').setValue('NewPass9')
    await wrapper.find('form').trigger('submit')

    expect(state.resetPassword).toHaveBeenCalledWith('a@b.com', '123456', 'NewPass9')
    expect(state.toastSuccess).toHaveBeenCalledWith('密码已重置，请使用新密码登录')
    expect(wrapper.find('#reset-email').exists()).toBe(false)
    expect(wrapper.find('#account-username').exists()).toBe(true)
  })

  it('两次新密码不一致提示错误且不提交', async () => {
    const wrapper = mount(OfficialModelPage)
    await wrapper.findAll('button').find((b) => b.text() === '忘记密码？')!.trigger('click')
    await wrapper.find('#reset-email').setValue('a@b.com')
    await wrapper.find('#reset-code').setValue('123456')
    await wrapper.find('#reset-password').setValue('NewPass9')
    await wrapper.find('#reset-password2').setValue('Other1')
    await wrapper.find('form').trigger('submit')

    expect(state.toastError).toHaveBeenCalledWith('两次输入的密码不一致')
    expect(state.resetPassword).not.toHaveBeenCalled()
  })

  it('注销账号：两击确认后调用删除并回到登录表单', async () => {
    state.login.mockResolvedValue(undefined)
    state.fetchUsageSummary.mockResolvedValue({
      days: 30,
      quota_tokens: 5_000_000,
      totals: { requests: 0, prompt_tokens: 0, completion_tokens: 0, cost_cents: 0 },
      daily: [],
      models: [],
    })
    state.deleteAccount.mockResolvedValue(undefined)
    const wrapper = mount(OfficialModelPage)
    await wrapper.find('#account-username').setValue('Alice2026')
    await wrapper.find('#account-password').setValue('Passw0rd')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const deleteButton = wrapper.findAll('.btn').find((b) => b.text() === '注销账号')!
    await deleteButton.trigger('click')
    expect(state.deleteAccount).not.toHaveBeenCalled()
    const confirmButton = wrapper.findAll('.btn').find((b) => b.text() === '确认注销（不可恢复）')!

    await confirmButton.trigger('click')
    expect(state.deleteAccount).toHaveBeenCalled()
    expect(wrapper.text()).toContain('登录')
    expect(wrapper.text()).not.toContain('退出登录')
  })
})
