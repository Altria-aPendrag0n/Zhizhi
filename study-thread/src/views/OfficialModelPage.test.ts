import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import OfficialModelPage from './OfficialModelPage.vue'

const state = vi.hoisted(() => ({
  push: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: state.push }),
}))

vi.mock('../composables/useToast', () => ({
  useToast: () => ({ error: state.toastError }),
}))

describe('OfficialModelPage 知枝官方 API 页', () => {
  it('渲染登录引导、套餐预览与自动配置说明', () => {
    const wrapper = mount(OfficialModelPage)

    expect(wrapper.text()).toContain('知枝官方 API')
    expect(wrapper.text()).toContain('登录知枝账号')
    expect(wrapper.text()).toContain('套餐预览')
    expect(wrapper.text()).toContain('如何工作')
    expect(wrapper.text()).toContain('账号（邮箱 / 手机号）')
    expect(wrapper.text()).toContain('验证码')
  })

  it('登录按钮提示账号服务尚未上线', async () => {
    const wrapper = mount(OfficialModelPage)
    await wrapper.find('.btn-primary').trigger('click')

    expect(state.toastError).toHaveBeenCalledWith('账号服务尚未上线，敬请期待')
  })

  it('开通套餐按钮同样提示未上线', async () => {
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
