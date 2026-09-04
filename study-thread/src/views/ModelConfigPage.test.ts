import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ModelConfigPage from './ModelConfigPage.vue'

const state = vi.hoisted(() => ({
  push: vi.fn(),
  officialApiEnabled: false,
  isOfficialActive: false,
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: state.push }),
}))

vi.mock('../stores/auth', () => ({
  useAuthStore: () => ({
    get isOfficialActive() {
      return state.isOfficialActive
    },
  }),
}))

vi.mock('../stores/settings', () => ({
  useSettingsStore: () => ({
    get officialApiEnabled() {
      return state.officialApiEnabled
    },
    set officialApiEnabled(value: boolean) {
      state.officialApiEnabled = value
    },
  }),
}))

function mountPage() {
  return mount(ModelConfigPage)
}

describe('ModelConfigPage 模型配置入口页', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.officialApiEnabled = false
    state.isOfficialActive = false
  })

  it('渲染「知枝官方 API」与「自定义模型」两个入口', () => {
    const wrapper = mountPage()

    expect(wrapper.text()).toContain('模型配置')
    expect(wrapper.text()).toContain('知枝官方 API')
    expect(wrapper.text()).toContain('自定义模型')
  })

  it('点击知枝官方入口跳转官方页', async () => {
    const wrapper = mountPage()
    const cards = wrapper.findAll('.entry-card')
    await cards[0].trigger('click')

    expect(state.push).toHaveBeenCalledWith({ name: 'settings-models-official' })
  })

  it('点击自定义模型入口跳转自定义页', async () => {
    const wrapper = mountPage()
    const cards = wrapper.findAll('.entry-card')
    await cards[1].trigger('click')

    expect(state.push).toHaveBeenCalledWith({ name: 'settings-models-custom' })
  })

  it('返回按钮跳回设置总览', async () => {
    const wrapper = mountPage()
    await wrapper.find('.back-link').trigger('click')

    expect(state.push).toHaveBeenCalledWith({ name: 'settings' })
  })

  it('默认状态：自定义使用中，官方卡显示「去登录」', async () => {
    const wrapper = mountPage()
    const switches = wrapper.findAll('.entry-card__switch')

    expect(switches).toHaveLength(2)
    expect(switches[0].text()).toBe('去登录')
    expect(switches[1].text()).toBe('使用中')
    expect(switches[1].attributes('disabled')).toBeDefined()
  })

  it('已登录但官方未启用：官方卡「切换使用」一键启用且不触发卡片跳转', async () => {
    state.isOfficialActive = true
    const wrapper = mountPage()
    const officialSwitch = wrapper.findAll('.entry-card__switch')[0]
    expect(officialSwitch.text()).toBe('切换使用')

    await officialSwitch.trigger('click')

    expect(state.officialApiEnabled).toBe(true)
    expect(state.push).not.toHaveBeenCalled()
  })

  it('官方使用中：徽标「使用中」、官方按钮禁用、自定义卡可一键切回', async () => {
    state.officialApiEnabled = true
    state.isOfficialActive = true
    const wrapper = mountPage()
    const switches = wrapper.findAll('.entry-card__switch')

    expect(switches[0].text()).toBe('使用中')
    expect(switches[0].attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('未启用')

    await switches[1].trigger('click')
    expect(state.officialApiEnabled).toBe(false)
    expect(state.push).not.toHaveBeenCalled()
  })

  it('徽标随使用状态联动：官方「已登录」+ 自定义「当前使用」', () => {
    state.isOfficialActive = true
    const wrapper = mountPage()

    const badges = wrapper.findAll('.entry-card__badge')
    expect(badges[0].text()).toBe('已登录')
    expect(badges[0].classes()).not.toContain('entry-card__badge--active')
    expect(badges[1].text()).toBe('当前使用')
    expect(badges[1].classes()).toContain('entry-card__badge--active')
  })
})
