import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ModelConfigPage from './ModelConfigPage.vue'

const state = vi.hoisted(() => ({
  push: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: state.push }),
}))

vi.mock('../stores/auth', () => ({
  useAuthStore: () => ({
    isOfficialActive: false,
  }),
}))

describe('ModelConfigPage 模型配置入口页', () => {
  it('渲染「知枝官方 API」与「自定义模型」两个入口', () => {
    const wrapper = mount(ModelConfigPage)

    expect(wrapper.text()).toContain('模型配置')
    expect(wrapper.text()).toContain('知枝官方 API')
    expect(wrapper.text()).toContain('自定义模型')
    expect(wrapper.text()).toContain('当前使用')
  })

  it('点击知枝官方入口跳转官方页', async () => {
    const wrapper = mount(ModelConfigPage)
    const cards = wrapper.findAll('.entry-card')
    await cards[0].trigger('click')

    expect(state.push).toHaveBeenCalledWith({ name: 'settings-models-official' })
  })

  it('点击自定义模型入口跳转自定义页', async () => {
    const wrapper = mount(ModelConfigPage)
    const cards = wrapper.findAll('.entry-card')
    await cards[1].trigger('click')

    expect(state.push).toHaveBeenCalledWith({ name: 'settings-models-custom' })
  })

  it('返回按钮跳回设置总览', async () => {
    const wrapper = mount(ModelConfigPage)
    await wrapper.find('.back-link').trigger('click')

    expect(state.push).toHaveBeenCalledWith({ name: 'settings' })
  })
})
