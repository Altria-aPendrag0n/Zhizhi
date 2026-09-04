import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import ReferenceEditDialog from './ReferenceEditDialog.vue'
import type { ReferenceMeta } from '../../types'

const state = vi.hoisted(() => ({
  loadReferencePreview: vi.fn(),
  updateReference: vi.fn(),
  deleteReference: vi.fn(),
  openPath: vi.fn().mockResolvedValue(undefined),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('../../stores/references', () => ({
  useReferenceStore: () => ({
    loadReferencePreview: state.loadReferencePreview,
    updateReference: state.updateReference,
    deleteReference: state.deleteReference,
  }),
}))

vi.mock('../../composables/useToast', () => ({
  useToast: () => ({ success: state.toastSuccess, error: state.toastError }),
}))

vi.mock('@tauri-apps/plugin-opener', () => ({
  openPath: state.openPath,
}))

const baseReference: ReferenceMeta = {
  id: 'ref-md',
  path: '/vault/references/ref-md.json',
  title: '工作记忆容量',
  description: '关于工作记忆容量的综述',
  tags: ['认知科学', '论文'],
  fileType: 'md',
  fileName: '工作记忆容量.md',
  filePath: '/vault/references/ref-md.md',
  created: '2026-01-01T00:00:00.000Z',
  updated: '2026-01-01T00:00:00.000Z',
}

const mdReference = baseReference

const pngReference: ReferenceMeta = {
  ...baseReference,
  id: 'ref-png',
  path: '/vault/references/ref-png.json',
  fileType: 'png',
  fileName: '示意图.png',
  filePath: '/vault/references/ref-png.png',
}

const pdfReference: ReferenceMeta = {
  ...baseReference,
  id: 'ref-pdf',
  path: '/vault/references/ref-pdf.json',
  fileType: 'pdf',
  fileName: '论文.pdf',
  filePath: '/vault/references/ref-pdf.pdf',
}

function createDialog() {
  return mount(ReferenceEditDialog, { props: { visible: false, reference: null } })
}

async function openDialog(wrapper: ReturnType<typeof createDialog>, reference: ReferenceMeta = mdReference) {
  await wrapper.setProps({ visible: true, reference })
  await flushPromises()
}

function setInputValue(selector: string, value: string) {
  const el = document.body.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)
  expect(el).toBeTruthy()
  el!.value = value
  el!.dispatchEvent(new Event('input'))
}

function findButton(predicate: (text: string) => boolean) {
  const button = Array.from(document.body.querySelectorAll<HTMLButtonElement>('.ref-edit__btn')).find((b) =>
    predicate(b.textContent?.trim() ?? ''),
  )
  expect(button).toBeTruthy()
  return button!
}

beforeEach(() => {
  state.loadReferencePreview.mockReset()
  state.updateReference.mockReset()
  state.deleteReference.mockReset()
  state.openPath.mockReset().mockResolvedValue(undefined)
  state.toastSuccess.mockClear()
  state.toastError.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('ReferenceEditDialog', () => {
  it('打开时表单回填标题/描述/标签', async () => {
    const wrapper = createDialog()
    await openDialog(wrapper)

    expect((document.body.querySelector('#ref-edit-title') as HTMLInputElement).value).toBe('工作记忆容量')
    expect((document.body.querySelector('#ref-edit-desc') as HTMLTextAreaElement).value).toBe(
      '关于工作记忆容量的综述',
    )
    expect((document.body.querySelector('#ref-edit-tags') as HTMLInputElement).value).toBe('认知科学，论文')
    wrapper.unmount()
  })

  it('md 类型加载预览文本并展示', async () => {
    state.loadReferencePreview.mockResolvedValue('# 引言\n认知科学是研究心智的学科。')
    const wrapper = createDialog()
    await openDialog(wrapper)

    expect(state.loadReferencePreview).toHaveBeenCalledWith(mdReference)
    expect(document.body.querySelector('.ref-edit__pre')?.textContent).toContain('认知科学是研究心智的学科')
    wrapper.unmount()
  })

  it('png 类型加载并展示图片预览', async () => {
    state.loadReferencePreview.mockResolvedValue('data:image/png;base64,aGVsbG8=')
    const wrapper = createDialog()
    await openDialog(wrapper, pngReference)

    const img = document.body.querySelector<HTMLImageElement>('.ref-edit__img')
    expect(img).toBeTruthy()
    expect(img?.getAttribute('src')).toBe('data:image/png;base64,aGVsbG8=')
    wrapper.unmount()
  })

  it('pdf 类型显示打开原文件提示', async () => {
    const wrapper = createDialog()
    await openDialog(wrapper, pdfReference)

    expect(state.loadReferencePreview).not.toHaveBeenCalled()
    expect(document.body.querySelector('.ref-edit__hint')?.textContent).toContain('PDF 文件请点击「打开原文件」查看')
    wrapper.unmount()
  })

  it('保存按钮 emit save 且 meta 包含新标题/描述/标签', async () => {
    const wrapper = createDialog()
    await openDialog(wrapper)

    setInputValue('#ref-edit-title', '  新的标题  ')
    setInputValue('#ref-edit-desc', '新的描述')
    setInputValue('#ref-edit-tags', '认知科学, 论文，算法')
    await nextTick()

    findButton((text) => text === '保存').click()
    await nextTick()

    const saved = wrapper.emitted('save')![0][0] as ReferenceMeta
    expect(saved.title).toBe('新的标题')
    expect(saved.description).toBe('新的描述')
    expect(saved.tags).toEqual(['认知科学', '论文', '算法'])
    expect(saved.path).toBe(mdReference.path)
    wrapper.unmount()
  })

  it('标题为空时保存按钮禁用且不 emit save', async () => {
    const wrapper = createDialog()
    await openDialog(wrapper)

    setInputValue('#ref-edit-title', '   ')
    await nextTick()

    const saveButton = findButton((text) => text === '保存')
    expect((saveButton as HTMLButtonElement).disabled).toBe(true)
    saveButton.click()
    expect(wrapper.emitted('save')).toBeUndefined()
    wrapper.unmount()
  })

  it('删除按钮 confirm 后 emit delete', async () => {
    const confirmSpy = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('confirm', confirmSpy)
    const wrapper = createDialog()
    await openDialog(wrapper)

    findButton((text) => text === '删除').click()
    await flushPromises()

    expect(confirmSpy).toHaveBeenCalledWith('确定要删除“工作记忆容量”吗？此操作无法撤销。')
    expect(wrapper.emitted('delete')).toEqual([[mdReference.path]])
    wrapper.unmount()
  })

  it('confirm 取消时不 emit delete', async () => {
    vi.stubGlobal('confirm', vi.fn().mockResolvedValue(false))
    const wrapper = createDialog()
    await openDialog(wrapper)

    findButton((text) => text === '删除').click()
    await flushPromises()

    expect(wrapper.emitted('delete')).toBeUndefined()
    wrapper.unmount()
  })

  it('打开按钮调用 openPath', async () => {
    const wrapper = createDialog()
    await openDialog(wrapper)

    findButton((text) => text === '打开原文件').click()
    await flushPromises()

    expect(state.openPath).toHaveBeenCalledWith(mdReference.filePath)
    expect(state.toastError).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('打开文件失败时提示错误', async () => {
    state.openPath.mockRejectedValue(new Error('denied'))
    const wrapper = createDialog()
    await openDialog(wrapper)

    findButton((text) => text === '打开原文件').click()
    await flushPromises()

    expect(state.toastError).toHaveBeenCalledWith('无法打开文件')
    wrapper.unmount()
  })

  it('点击遮罩关闭弹窗', async () => {
    const wrapper = createDialog()
    await openDialog(wrapper)

    document.body.querySelector<HTMLElement>('.ref-edit__mask')?.click()
    expect(wrapper.emitted('close')).toBeTruthy()
    wrapper.unmount()
  })
})
