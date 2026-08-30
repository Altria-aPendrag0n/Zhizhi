import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import CustomModelPage from './CustomModelPage.vue'

const state = vi.hoisted(() => ({
  push: vi.fn(),
  saveSettings: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: state.push }),
}))

vi.mock('../stores/settings', () => ({
  useSettingsStore: () => ({
    activeProvider: 'openai-compat',
    apiKey: '',
    baseUrl: 'https://api.openai.com',
    model: 'gpt-4o',
    enableWebSearch: true,
    visionEnabled: false,
    visionBaseUrl: 'https://open.bigmodel.cn/api/paas',
    visionApiKey: '',
    visionModel: 'glm-4v-flash',
    saveSettings: state.saveSettings,
  }),
}))

vi.mock('../api/openai-compat', () => ({
  PROVIDER_PRESETS: {},
}))

vi.mock('../api/provider-factory', () => ({
  createProvider: vi.fn(),
  createVisionProvider: vi.fn(),
}))

describe('CustomModelPage 自定义模型页', () => {
  it('渲染服务商选择与模型表单（含保存/连接测试按钮）', () => {
    const wrapper = mount(CustomModelPage)

    expect(wrapper.text()).toContain('自定义模型')
    expect(wrapper.text()).toContain('服务商')
    expect(wrapper.text()).toContain('API 地址')
    expect(wrapper.text()).toContain('API Key')
    expect(wrapper.text()).toContain('模型名称')
    expect(wrapper.text()).toContain('保存设置')
    expect(wrapper.text()).toContain('连接测试')
  })

  it('开启图片转笔记模型后显示视觉模型配置', async () => {
    const wrapper = mount(CustomModelPage)
    expect(wrapper.text()).not.toContain('转笔记模型名称')

    await wrapper.find('#vision-enabled').setValue(true)
    expect(wrapper.text()).toContain('转笔记 API 地址')
    expect(wrapper.text()).toContain('转笔记 API Key')
    expect(wrapper.text()).toContain('转笔记模型名称')
  })

  it('保存设置写入 store 并提示已保存', async () => {
    const wrapper = mount(CustomModelPage)
    await wrapper.find('.btn-primary').trigger('click')

    expect(state.saveSettings).toHaveBeenCalled()
    expect(wrapper.text()).toContain('设置已保存')
  })

  it('返回按钮跳回模型配置入口页', async () => {
    const wrapper = mount(CustomModelPage)
    await wrapper.find('.back-link').trigger('click')

    expect(state.push).toHaveBeenCalledWith({ name: 'settings-models' })
  })
})
