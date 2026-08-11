import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import WelcomeOverlay from './WelcomeOverlay.vue'

const routerState = vi.hoisted(() => ({
  push: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => routerState,
}))

const WELCOME_KEY = 'study-thread-welcomed-v0.1'

async function mountOverlay() {
  const wrapper = mount(WelcomeOverlay, {
    global: { stubs: { teleport: true } },
  })
  await flushPromises()
  return wrapper
}

describe('WelcomeOverlay 首次启动引导', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('首次运行（无标记）时展示欢迎引导', async () => {
    const wrapper = await mountOverlay()

    expect(wrapper.find('.welcome-overlay').exists()).toBe(true)
    expect(wrapper.text()).toContain('欢迎使用知枝')
    expect(wrapper.text()).toContain('测试版')
    expect(wrapper.text()).toContain('前往设置完成配置')
  })

  it('已标记欢迎过（首次运行完成）时不展示', async () => {
    localStorage.setItem(WELCOME_KEY, JSON.stringify({ at: '2026-08-11T00:00:00.000Z' }))
    const wrapper = await mountOverlay()

    expect(wrapper.find('.welcome-overlay').exists()).toBe(false)
  })

  it('点击「前往设置完成配置」：跳转设置页并写入首次运行标记', async () => {
    const wrapper = await mountOverlay()

    await wrapper.find('.welcome-btn--primary').trigger('click')
    await flushPromises()

    expect(routerState.push).toHaveBeenCalledWith('/settings')
    expect(localStorage.getItem(WELCOME_KEY)).not.toBeNull()
    expect(wrapper.find('.welcome-overlay').exists()).toBe(false)
  })

  it('点击「稍后再说」：不跳转，仅写入首次运行标记并隐藏', async () => {
    const wrapper = await mountOverlay()

    await wrapper.find('.welcome-btn--ghost').trigger('click')
    await flushPromises()

    expect(routerState.push).not.toHaveBeenCalled()
    expect(localStorage.getItem(WELCOME_KEY)).not.toBeNull()
    expect(wrapper.find('.welcome-overlay').exists()).toBe(false)
  })
})
