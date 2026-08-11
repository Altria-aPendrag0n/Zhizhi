import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import AboutSection from './AboutSection.vue'
import { logInfo, clearLogs } from '../../utils/logger'

vi.mock('@tauri-apps/api/app', () => ({
  getVersion: vi.fn().mockResolvedValue('0.1.0-beta'),
}))

const dialogState = vi.hoisted(() => ({
  save: vi.fn(),
}))

const fsState = vi.hoisted(() => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  save: dialogState.save,
}))

const openerState = vi.hoisted(() => ({
  openUrl: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: openerState.openUrl,
}))

vi.mock('../../utils/vault-fs', () => ({
  writeFile: fsState.writeFile,
}))

async function mountAbout() {
  const wrapper = mount(AboutSection)
  await flushPromises()
  return wrapper
}

function findButton(wrapper: ReturnType<typeof mount>, text: string) {
  const button = wrapper.findAll('button').find((b) => b.text().includes(text))
  expect(button, `找不到按钮：${text}`).toBeTruthy()
  return button!
}

describe('AboutSection 关于知枝', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearLogs()
    dialogState.save.mockResolvedValue(null)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('展示产品名、版本号与测试版声明', async () => {
    const wrapper = await mountAbout()

    expect(wrapper.text()).toContain('关于知枝')
    expect(wrapper.text()).toContain('v0.1.0-beta')
    expect(wrapper.text()).toContain('测试版')
    expect(wrapper.text()).toContain('数据不自动上传')
  })

  it('getVersion 失败时降级展示默认版本号', async () => {
    const getVersionMock = vi.mocked((await import('@tauri-apps/api/app')).getVersion)
    getVersionMock.mockRejectedValueOnce(new Error('not in tauri'))
    const wrapper = await mountAbout()

    expect(wrapper.text()).toContain('v0.1.0')
  })

  it('点击「导出调试日志」选择保存路径并写入格式化日志', async () => {
    logInfo('feedback-test', '这是一条测试日志')
    dialogState.save.mockResolvedValue('D:\\logs\\zhizhi-logs-2026-08-11.txt')
    const wrapper = await mountAbout()

    await findButton(wrapper, '导出调试日志').trigger('click')
    await flushPromises()

    expect(dialogState.save).toHaveBeenCalledWith(expect.objectContaining({ defaultPath: expect.stringContaining('zhizhi-logs-') }))
    expect(fsState.writeFile).toHaveBeenCalledTimes(1)
    const [path, content] = fsState.writeFile.mock.calls[0] as [string, string]
    expect(path).toBe('D:\\logs\\zhizhi-logs-2026-08-11.txt')
    expect(content).toContain('版本: v0.1.0-beta')
    expect(content).toContain('这是一条测试日志')
    expect(content).toContain('反馈指引')
  })

  it('导出日志：用户取消保存路径时不写入文件', async () => {
    dialogState.save.mockResolvedValue(null)
    const wrapper = await mountAbout()

    await findButton(wrapper, '导出调试日志').trigger('click')
    await flushPromises()

    expect(fsState.writeFile).not.toHaveBeenCalled()
  })

  it('导出日志：写入失败时给出错误提示', async () => {
    dialogState.save.mockResolvedValue('D:\\logs\\zhizhi-logs.txt')
    fsState.writeFile.mockRejectedValueOnce(new Error('磁盘满'))
    const wrapper = await mountAbout()

    await findButton(wrapper, '导出调试日志').trigger('click')
    await flushPromises()

    expect(fsState.writeFile).toHaveBeenCalledTimes(1)
  })

  it('点击「复制反馈信息」把版本与日志写入剪贴板', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    logInfo('feedback-test', '复制用日志')
    const wrapper = await mountAbout()

    await findButton(wrapper, '复制反馈信息').trigger('click')
    await flushPromises()

    expect(writeText).toHaveBeenCalledTimes(1)
    const text = writeText.mock.calls[0][0] as string
    expect(text).toContain('版本: v0.1.0-beta')
    expect(text).toContain('复制用日志')
    expect(text).toContain('1074253861@qq.com')
  })

  it('点击「邮件反馈」打开 mailto 链接，预填收件人/主题/正文模板', async () => {
    const wrapper = await mountAbout()

    await findButton(wrapper, '邮件反馈').trigger('click')
    await flushPromises()

    expect(openerState.openUrl).toHaveBeenCalledTimes(1)
    const href = openerState.openUrl.mock.calls[0][0] as string
    expect(href).toContain('mailto:1074253861@qq.com')
    expect(decodeURIComponent(href)).toContain('subject=知枝 v0.1.0-beta 反馈')
    expect(decodeURIComponent(href)).toContain('问题描述')
  })

  it('邮件反馈：打开失败时给出错误提示', async () => {
    openerState.openUrl.mockRejectedValueOnce(new Error('no mail client'))
    const wrapper = await mountAbout()

    await findButton(wrapper, '邮件反馈').trigger('click')
    await flushPromises()

    expect(openerState.openUrl).toHaveBeenCalledTimes(1)
  })
})
