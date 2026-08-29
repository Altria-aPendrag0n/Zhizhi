import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ImageToMarkdownDialog from './ImageToMarkdownDialog.vue'
import { useSettingsStore } from '../../stores/settings'
import { useVaultStore } from '../../stores/vault'
import type { ReferenceMeta } from '../../types'

const state = vi.hoisted(() => ({
  saveNote: vi.fn().mockResolvedValue('/vault/notes/图片笔记.md'),
  recognizePngReference: vi.fn().mockResolvedValue(true),
  readFileBytes: vi.fn(),
  imageToMarkdown: vi.fn(),
  createVisionProvider: vi.fn(),
  compressImageFile: vi.fn().mockResolvedValue({ mimeType: 'image/jpeg', base64: 'QUJD' }),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('../../stores/notes', () => ({
  useNoteStore: () => ({ saveNote: state.saveNote }),
}))

vi.mock('../../stores/references', () => ({
  useReferenceStore: () => ({ recognizePngReference: state.recognizePngReference }),
}))

vi.mock('../../api/skills/image-to-note', () => ({
  imageToMarkdown: state.imageToMarkdown,
}))

vi.mock('../../api/provider-factory', () => ({
  createVisionProvider: state.createVisionProvider,
}))

vi.mock('../../utils/vault-fs', () => ({
  readFileBytes: state.readFileBytes,
}))

vi.mock('../../utils/image-compress', () => ({
  compressImageFile: state.compressImageFile,
}))

vi.mock('../../composables/useToast', () => ({
  useToast: () => ({ success: state.toastSuccess, error: state.toastError }),
}))

const result = {
  title: '课程表',
  description: '一周课程安排',
  tags: ['课程表'],
  markdown: '| 时间 | 课程 |\n| --- | --- |\n| 周一 | 数学 |',
}

const pngReference: ReferenceMeta = {
  id: 'ref-png',
  path: '/vault/references/ref-png/ref-png.json',
  title: '示意图',
  description: '',
  tags: [],
  fileType: 'png',
  fileName: '示意图.png',
  filePath: '/vault/references/ref-png/ref-png.png',
  created: '2026-01-01T00:00:00.000Z',
  updated: '2026-01-01T00:00:00.000Z',
}

function createDialog(props: Partial<{
  mode: 'note' | 'insert' | 'reference'
  reference?: ReferenceMeta | null
}>) {
  return mount(ImageToMarkdownDialog, {
    props: { visible: true, mode: 'note', ...props },
    global: { stubs: { teleport: true } },
  })
}

/** 通过 file input 选择一张图片（Canvas 不可用环境下降级为原图 base64） */
async function selectFile(wrapper: ReturnType<typeof createDialog>) {
  const input = wrapper.find('input[type="file"]')
  expect(input.exists()).toBe(true)
  Object.defineProperty(input.element, 'files', {
    value: [new File(['fake'], 'test.png', { type: 'image/png' })],
  })
  await input.trigger('change')
  await flushPromises()
}

function findButton(wrapper: ReturnType<typeof createDialog>, text: string) {
  const button = wrapper.findAll('button').find((b) => b.text().includes(text))
  expect(button).toBeTruthy()
  return button!
}

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  const settings = useSettingsStore()
  settings.visionEnabled = true
  settings.visionApiKey = 'sk-vision'
  const vault = useVaultStore()
  vault.vaultPath = '/vault'
  state.imageToMarkdown.mockResolvedValue(result)
  state.saveNote.mockResolvedValue('/vault/notes/图片笔记.md')
  state.recognizePngReference.mockResolvedValue(true)
  state.compressImageFile.mockResolvedValue({ mimeType: 'image/jpeg', base64: 'QUJD' })
  state.createVisionProvider.mockReturnValue({ chat: vi.fn() } as never)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('ImageToMarkdownDialog', () => {
  it('note 模式：选图→识别→预览→保存为笔记', async () => {
    const wrapper = createDialog({ mode: 'note' })
    await flushPromises()

    await selectFile(wrapper)
    findButton(wrapper, '识别图片').trigger('click')
    await flushPromises()

    expect(state.imageToMarkdown).toHaveBeenCalled()
    expect(wrapper.text()).toContain('Markdown 预览')

    findButton(wrapper, '保存为笔记').trigger('click')
    await flushPromises()

    expect(state.saveNote).toHaveBeenCalledWith(
      '/vault',
      expect.objectContaining({ title: '课程表', tags: ['课程表'], type: 'concept' }),
      '',
      result.markdown,
      result.markdown,
    )
    expect(wrapper.emitted('saved')?.[0]).toEqual(['/vault/notes/图片笔记.md'])
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('insert 模式：识别后确认 emit insert（不保存笔记）', async () => {
    const wrapper = createDialog({ mode: 'insert' })
    await flushPromises()

    await selectFile(wrapper)
    findButton(wrapper, '识别图片').trigger('click')
    await flushPromises()
    findButton(wrapper, '插入笔记').trigger('click')
    await flushPromises()

    expect(wrapper.emitted('insert')?.[0]).toEqual([result.markdown])
    expect(state.saveNote).not.toHaveBeenCalled()
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('未配置转笔记模型时提示去设置且不发起识别', async () => {
    useSettingsStore().visionEnabled = false
    const wrapper = createDialog({ mode: 'note' })
    await flushPromises()

    await selectFile(wrapper)
    findButton(wrapper, '识别图片').trigger('click')
    await flushPromises()

    expect(state.imageToMarkdown).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('尚未配置图片转笔记模型')
  })

  it('reference 模式：自动读取参考资料图片并可保存识别结果', async () => {
    state.readFileBytes.mockResolvedValue(new Uint8Array([1, 2, 3]))
    const wrapper = createDialog({ mode: 'reference', reference: pngReference })
    await flushPromises()

    expect(state.readFileBytes).toHaveBeenCalledWith(pngReference.filePath)

    findButton(wrapper, '识别图片').trigger('click')
    await flushPromises()
    expect(state.imageToMarkdown).toHaveBeenCalledWith(
      { mimeType: 'image/jpeg', base64: 'QUJD' },
      expect.anything(),
      'reference',
    )

    findButton(wrapper, '保存识别结果').trigger('click')
    await flushPromises()

    expect(state.recognizePngReference).toHaveBeenCalledWith(pngReference, '/vault', result)
    expect(wrapper.emitted('saved')?.[0]).toEqual([pngReference.path])
  })

  it('note 模式未打开 Vault 时提示且不保存', async () => {
    useVaultStore().vaultPath = null
    const wrapper = createDialog({ mode: 'note' })
    await flushPromises()

    await selectFile(wrapper)
    findButton(wrapper, '识别图片').trigger('click')
    await flushPromises()
    findButton(wrapper, '保存为笔记').trigger('click')
    await flushPromises()

    expect(state.toastError).toHaveBeenCalledWith('请先打开 Vault 再保存')
    expect(state.saveNote).not.toHaveBeenCalled()
  })
})
