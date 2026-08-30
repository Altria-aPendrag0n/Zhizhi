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
    sendCode: async (...args: unknown[]) => {
      state.sendCode(...args)
      return 60
    },
    login: async (identifier: string, _code: string) => {
      await state.login(identifier, _code)
      status.value = 'authenticated'
      user.value = { identifier, plan: { name: '标准' }, quota_tokens: 5000000 }
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

async function fillLoginForm(wrapper: ReturnType<typeof mount>, account: string, code: string) {
  await wrapper.find('#account').setValue(account)
  await wrapper.find('#verify-code').setValue(code)
}

describe('OfficialModelPage 知枝官方 API 页', () => {
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

  it('渲染登录引导、套餐预览与自动配置说明', () => {
    const wrapper = mount(OfficialModelPage)

    expect(wrapper.text()).toContain('知枝官方 API')
    expect(wrapper.text()).toContain('登录知枝账号')
    expect(wrapper.text()).toContain('套餐预览')
    expect(wrapper.text()).toContain('如何工作')
    expect(wrapper.text()).toContain('账号（邮箱 / 手机号）')
    expect(wrapper.text()).toContain('验证码')
  })

  it('空账号获取验证码提示错误，不调用接口', async () => {
    const wrapper = mount(OfficialModelPage)
    await wrapper.find('.btn-secondary').trigger('click')

    expect(state.toastError).toHaveBeenCalledWith('请先输入账号（邮箱或手机号）')
    expect(state.sendCode).not.toHaveBeenCalled()
  })

  it('输入账号获取验证码：调用 sendCode 并进入倒计时', async () => {
    vi.useFakeTimers()
    state.sendCode.mockResolvedValue({ success: true, cooldown_seconds: 60 })
    const wrapper = mount(OfficialModelPage)
    await wrapper.find('#account').setValue('user@example.com')

    await wrapper.findAll('button')[1].trigger('click')
    expect(state.sendCode).toHaveBeenCalledWith('user@example.com')

    const sendButton = wrapper.findAll('button')[1]
    expect(sendButton.text()).toBe('60s')
    expect(sendButton.attributes('disabled')).toBeDefined()

    await vi.advanceTimersByTimeAsync(1000)
    expect(sendButton.text()).toBe('59s')
  })

  it('登录成功进入已登录态并展示账号与套餐', async () => {
    state.login.mockResolvedValue(undefined)
    const wrapper = mount(OfficialModelPage)
    await fillLoginForm(wrapper, 'user@example.com', '123456')

    await wrapper.find('.btn-primary').trigger('click')

    expect(state.login).toHaveBeenCalledWith('user@example.com', '123456')
    expect(state.toastSuccess).toHaveBeenCalledWith('登录成功，官方 API 已启用')
    expect(wrapper.text()).toContain('user@example.com')
    expect(wrapper.text()).toContain('标准')
    expect(wrapper.text()).toContain('退出登录')
  })

  it('登录失败提示错误并保持登录表单', async () => {
    state.login.mockRejectedValue(new Error('验证码错误'))
    const wrapper = mount(OfficialModelPage)
    await fillLoginForm(wrapper, 'user@example.com', '000000')

    await wrapper.find('.btn-primary').trigger('click')

    expect(state.toastError).toHaveBeenCalledWith('验证码错误')
    expect(wrapper.text()).toContain('登录')
    expect(wrapper.text()).not.toContain('退出登录')
  })

  it('已登录态登出后回到登录表单', async () => {
    state.login.mockResolvedValue(undefined)
    const wrapper = mount(OfficialModelPage)
    await fillLoginForm(wrapper, 'user@example.com', '123456')
    await wrapper.find('.btn-primary').trigger('click')

    state.logout.mockResolvedValue(undefined)
    await wrapper.find('.btn-secondary').trigger('click')

    expect(state.logout).toHaveBeenCalled()
    expect(wrapper.text()).toContain('获取验证码')
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
