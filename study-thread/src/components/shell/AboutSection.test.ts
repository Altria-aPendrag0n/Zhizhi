import { describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import AboutSection from './AboutSection.vue'

vi.mock('@tauri-apps/api/app', () => ({
  getVersion: vi.fn().mockResolvedValue('0.1.0-beta'),
}))

describe('AboutSection 关于知枝', () => {
  it('展示产品名、版本号与测试版声明', async () => {
    const wrapper = mount(AboutSection)
    await flushPromises()

    expect(wrapper.text()).toContain('关于知枝')
    expect(wrapper.text()).toContain('v0.1.0-beta')
    expect(wrapper.text()).toContain('测试版')
    expect(wrapper.text()).toContain('数据不自动上传')
  })

  it('getVersion 失败时降级展示默认版本号', async () => {
    const getVersionMock = vi.mocked((await import('@tauri-apps/api/app')).getVersion)
    getVersionMock.mockRejectedValueOnce(new Error('not in tauri'))
    const wrapper = mount(AboutSection)
    await flushPromises()

    expect(wrapper.text()).toContain('v0.1.0')
  })
})
