import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import UpdatePrompt from './UpdatePrompt.vue'
import { useToast } from '../../composables/useToast'

const updaterState = vi.hoisted(() => ({
  installUpdate: vi.fn(),
}))

vi.mock('../../utils/updater', () => ({
  installUpdate: updaterState.installUpdate,
}))

const fakeUpdate = {
  version: '0.2.0',
  currentVersion: '0.1.1',
}

function mountPrompt(update = fakeUpdate) {
  return mount(UpdatePrompt, {
    props: { visible: true, update: update as any },
    global: { stubs: { teleport: true } },
  })
}

function findButton(wrapper: ReturnType<typeof mount>, text: string) {
  const button = wrapper.findAll('button').find((b) => b.text().includes(text))
  expect(button, `找不到按钮：${text}`).toBeTruthy()
  return button!
}

/** 取最近一条 toast 消息（模块级 toasts 跨用例累积） */
function lastToastMessage(): string {
  const { toasts } = useToast()
  return toasts.value[toasts.value.length - 1]?.message ?? ''
}

describe('UpdatePrompt 更新提示对话框', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    updaterState.installUpdate.mockResolvedValue(undefined)
  })

  it('展示新旧版本号与更新按钮', () => {
    const wrapper = mountPrompt()

    expect(wrapper.text()).toContain('发现新版本')
    expect(wrapper.text()).toContain('v0.1.1 → v0.2.0')
    expect(wrapper.text()).toContain('立即更新')
    expect(wrapper.text()).toContain('稍后再说')
  })

  it('点击「立即更新」调用安装并进入更新中状态', async () => {
    const wrapper = mountPrompt()

    await findButton(wrapper, '立即更新').trigger('click')
    await flushPromises()

    expect(updaterState.installUpdate).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('请稍候…')
  })

  it('点击「稍后再说」触发 close 事件', async () => {
    const wrapper = mountPrompt()

    await findButton(wrapper, '稍后再说').trigger('click')

    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(updaterState.installUpdate).not.toHaveBeenCalled()
  })

  it('更新失败时提示错误并恢复可操作状态', async () => {
    updaterState.installUpdate.mockRejectedValueOnce(new Error('网络异常'))
    const wrapper = mountPrompt()

    await findButton(wrapper, '立即更新').trigger('click')
    await flushPromises()

    expect(lastToastMessage()).toContain('更新失败')
    expect(wrapper.text()).toContain('立即更新')
  })

  it('visible 为 false 时不渲染', () => {
    const wrapper = mount(UpdatePrompt, {
      props: { visible: false, update: fakeUpdate as any },
      global: { stubs: { teleport: true } },
    })

    expect(wrapper.text()).toBe('')
  })
})
