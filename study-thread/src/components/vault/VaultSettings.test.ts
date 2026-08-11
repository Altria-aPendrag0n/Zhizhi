import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import VaultSettings from './VaultSettings.vue'

const state = vi.hoisted(() => ({
  open: vi.fn(),
  openVault: vi.fn().mockResolvedValue(undefined),
  closeVault: vi.fn().mockResolvedValue(undefined),
  addRecentVault: vi.fn(),
  createDir: vi.fn().mockResolvedValue(undefined),
  prompt: vi.fn(),
  vaultPath: '',
  recentVaults: [] as string[],
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: state.open,
}))

vi.mock('../../stores/vault', () => ({
  useVaultStore: () => ({
    vaultPath: state.vaultPath,
    openVault: state.openVault,
    closeVault: state.closeVault,
  }),
}))

vi.mock('../../stores/settings', () => ({
  useSettingsStore: () => ({
    recentVaults: state.recentVaults,
    addRecentVault: state.addRecentVault,
  }),
}))

vi.mock('../../utils/vault-fs', () => ({
  createDir: state.createDir,
}))

async function mountSettings() {
  const wrapper = mount(VaultSettings)
  await flushPromises()
  return wrapper
}

function findButton(wrapper: ReturnType<typeof mount>, text: string) {
  const button = wrapper.findAll('button').find((b) => b.text() === text)
  expect(button, `找不到按钮：${text}`).toBeTruthy()
  return button!
}

describe('VaultSettings 资料库选择', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.vaultPath = ''
    state.recentVaults = []
    vi.stubGlobal('prompt', state.prompt)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('点击「打开 Vault」弹出资源管理器，选中目录后打开并加入最近列表', async () => {
    state.open.mockResolvedValue('D:\\MyVault')
    const wrapper = await mountSettings()

    await findButton(wrapper, '打开 Vault').trigger('click')
    await flushPromises()

    expect(state.open).toHaveBeenCalledWith(expect.objectContaining({ directory: true }))
    expect(state.openVault).toHaveBeenCalledWith('D:\\MyVault')
    expect(state.addRecentVault).toHaveBeenCalledWith('D:\\MyVault')
  })

  it('在资源管理器中取消选择时不执行任何打开操作', async () => {
    state.open.mockResolvedValue(null)
    const wrapper = await mountSettings()

    await findButton(wrapper, '打开 Vault').trigger('click')
    await flushPromises()

    expect(state.openVault).not.toHaveBeenCalled()
    expect(state.addRecentVault).not.toHaveBeenCalled()
  })

  it('已打开 Vault 时「切换 Vault」同样使用资源管理器选择目录', async () => {
    state.vaultPath = 'D:\\OldVault'
    state.open.mockResolvedValue('D:\\NewVault')
    const wrapper = await mountSettings()

    await findButton(wrapper, '切换 Vault').trigger('click')
    await flushPromises()

    expect(state.open).toHaveBeenCalledWith(expect.objectContaining({ directory: true }))
    expect(state.openVault).toHaveBeenCalledWith('D:\\NewVault')
    expect(state.addRecentVault).toHaveBeenCalledWith('D:\\NewVault')
  })

  it('新建 Vault：资源管理器选父目录 + 输入名称，创建子目录并打开', async () => {
    state.open.mockResolvedValue('D:\\work')
    state.prompt.mockReturnValue('我的知识库')
    const wrapper = await mountSettings()

    await findButton(wrapper, '新建 Vault').trigger('click')
    await flushPromises()

    expect(state.open).toHaveBeenCalledWith(expect.objectContaining({ directory: true }))
    expect(state.prompt).toHaveBeenCalled()
    expect(state.createDir).toHaveBeenCalledTimes(4)
    expect(state.createDir).toHaveBeenCalledWith('D:\\work\\我的知识库\\notes')
    expect(state.createDir).toHaveBeenCalledWith('D:\\work\\我的知识库\\sessions')
    expect(state.createDir).toHaveBeenCalledWith('D:\\work\\我的知识库\\attachments')
    expect(state.createDir).toHaveBeenCalledWith('D:\\work\\我的知识库\\.study-thread')
    expect(state.openVault).toHaveBeenCalledWith('D:\\work\\我的知识库')
    expect(state.addRecentVault).toHaveBeenCalledWith('D:\\work\\我的知识库')
  })

  it('新建 Vault：在资源管理器中取消选择父目录时不创建任何目录', async () => {
    state.open.mockResolvedValue(null)
    const wrapper = await mountSettings()

    await findButton(wrapper, '新建 Vault').trigger('click')
    await flushPromises()

    expect(state.prompt).not.toHaveBeenCalled()
    expect(state.createDir).not.toHaveBeenCalled()
    expect(state.openVault).not.toHaveBeenCalled()
  })
})
