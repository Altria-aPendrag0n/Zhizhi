import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import NotesPage from './NotesPage.vue'
import type { ReferenceMeta } from '../types'

/**
 * mock 工厂在模块加载早期执行（早于本文件顶层变量初始化），
 * 因此共享状态分两部分：
 * - vi.fn 等工具函数放在 vi.hoisted 中；
 * - 响应式状态（route / vaultPath / references）在工厂内部创建并挂到 globalThis 上供测试读写。
 */
const state = vi.hoisted(() => ({
  routerPush: vi.fn(),
  loadAllNotes: vi.fn().mockResolvedValue(undefined),
  loadAllReferences: vi.fn().mockResolvedValue(undefined),
  uploadReference: vi.fn().mockResolvedValue({ id: 'ref-1', path: '/vault/references/ref-1.json' }),
  deleteReference: vi.fn().mockResolvedValue(true),
  updateReference: vi.fn().mockImplementation((meta: unknown) => Promise.resolve(meta)),
  loadReferencePreview: vi.fn().mockResolvedValue(''),
  listReviewSessions: vi.fn().mockResolvedValue([]),
  saveNote: vi.fn().mockResolvedValue('/vault/notes/无标题笔记.md'),
}))

interface NotesPageTestGlobals {
  __notesPageRoute?: { query: Record<string, string> }
  __notesPageVaultPath?: { value: string | null }
  __notesPageVaultReady?: { value: boolean }
  __notesPageReferences?: { value: unknown[] }
  __notesPageNotes?: { value: unknown[] }
}

vi.mock('vue-router', async () => {
  const { reactive } = await import('vue')
  const route = reactive<{ query: Record<string, string> }>({ query: {} })
  ;(globalThis as unknown as NotesPageTestGlobals).__notesPageRoute = route
  return {
    useRoute: () => route,
    useRouter: () => ({ push: state.routerPush }),
  }
})

vi.mock('../stores/notes', async () => {
  const { ref } = await import('vue')
  const notes = ref<unknown[]>([])
  ;(globalThis as unknown as NotesPageTestGlobals).__notesPageNotes = notes
  return {
    useNoteStore: () => ({
      get notes() {
        return notes.value
      },
      loadAllNotes: state.loadAllNotes,
      deleteNote: vi.fn().mockResolvedValue(true),
      saveNote: state.saveNote,
    }),
  }
})

vi.mock('../stores/references', async () => {
  const { ref } = await import('vue')
  const references = ref<unknown[]>([])
  ;(globalThis as unknown as NotesPageTestGlobals).__notesPageReferences = references
  return {
    useReferenceStore: () => ({
      get references() {
        return references.value
      },
      loadAllReferences: state.loadAllReferences,
      uploadReference: state.uploadReference,
      deleteReference: state.deleteReference,
      updateReference: state.updateReference,
      loadReferencePreview: state.loadReferencePreview,
    }),
  }
})

vi.mock('../stores/vault', async () => {
  const { ref } = await import('vue')
  const vaultPath = ref<string | null>(null)
  const vaultReady = ref(false)
  ;(globalThis as unknown as NotesPageTestGlobals).__notesPageVaultPath = vaultPath
  ;(globalThis as unknown as NotesPageTestGlobals).__notesPageVaultReady = vaultReady
  return {
    useVaultStore: () => ({
      get vaultPath() {
        return vaultPath.value
      },
      get vaultReady() {
        return vaultReady.value
      },
    }),
  }
})

vi.mock('../composables/useToast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}))

vi.mock('../stores/settings', () => ({
  useSettingsStore: () => ({
    getVisionProviderConfig: vi.fn().mockReturnValue(null),
  }),
}))

vi.mock('../utils/review-session', () => ({
  listReviewSessions: state.listReviewSessions,
}))

function testGlobals() {
  return globalThis as unknown as NotesPageTestGlobals
}

function createWrapper() {
  return mount(NotesPage, {
    global: {
      stubs: {
        NoteList: { name: 'NoteList', template: '<div class="note-list-stub" />' },
        ReferenceList: { name: 'ReferenceList', template: '<div class="ref-list-stub" />' },
      },
    },
  })
}

const referenceMeta: ReferenceMeta = {
  id: 'ref-1',
  path: '/vault/references/ref-1.json',
  title: '认知科学导论',
  description: '关于认知科学的一篇综述论文',
  tags: ['认知科学'],
  fileType: 'md',
  fileName: '认知科学导论.md',
  filePath: '/vault/references/ref-1.md',
  created: '2026-01-01T00:00:00.000Z',
  updated: '2026-01-01T00:00:00.000Z',
}

describe('NotesPage', () => {
  beforeEach(() => {
    state.routerPush.mockClear()
    state.loadAllNotes.mockClear()
    state.loadAllReferences.mockClear()
    state.uploadReference.mockClear()
    state.deleteReference.mockClear()
    state.updateReference.mockClear()
    state.loadReferencePreview.mockClear()
    state.listReviewSessions.mockClear()
    state.listReviewSessions.mockResolvedValue([])
    state.saveNote.mockClear()
    state.saveNote.mockResolvedValue('/vault/notes/无标题笔记.md')
    const globals = testGlobals()
    if (globals.__notesPageRoute) globals.__notesPageRoute.query = {}
    if (globals.__notesPageVaultPath) globals.__notesPageVaultPath.value = null
    if (globals.__notesPageVaultReady) globals.__notesPageVaultReady.value = false
    if (globals.__notesPageReferences) globals.__notesPageReferences.value = []
    if (globals.__notesPageNotes) globals.__notesPageNotes.value = []
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('默认显示笔记 tab', () => {
    testGlobals().__notesPageVaultPath!.value = '/vault'
    testGlobals().__notesPageVaultReady!.value = true
    const wrapper = createWrapper()
    expect(wrapper.findComponent({ name: 'NoteList' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'ReferenceList' }).exists()).toBe(false)
    expect(state.loadAllNotes).toHaveBeenCalledWith('/vault')
    wrapper.unmount()
  })

  it('vault 恢复完成前显示加载占位，不闪未打开 vault 的提示', () => {
    const wrapper = createWrapper()
    expect(wrapper.find('.vault-loading-state').exists()).toBe(true)
    expect(wrapper.text()).toContain('正在打开资料库')
    expect(wrapper.find('.vault-empty-state').exists()).toBe(false)
    wrapper.unmount()
  })

  it('vault 恢复完成但未打开 vault 时显示缓存笔记与打开提示横幅', () => {
    testGlobals().__notesPageVaultReady!.value = true
    testGlobals().__notesPageNotes!.value = [{ path: '/cache/1.md', title: '缓存笔记' }]
    const wrapper = createWrapper()
    expect(wrapper.find('.vault-loading-state').exists()).toBe(false)
    // 不再显示旧版“请先打开 Vault”死胡同页，而是展示本地缓存笔记
    expect(wrapper.find('.vault-empty-state').exists()).toBe(false)
    expect(wrapper.find('.vault-offline-banner').exists()).toBe(true)
    expect(wrapper.text()).toContain('未连接 Vault')
    expect(wrapper.findComponent({ name: 'NoteList' }).exists()).toBe(true)
    wrapper.unmount()
  })

  it('vault 恢复完成但未打开 vault 时仍展示笔记 tab 内容区', () => {
    testGlobals().__notesPageVaultReady!.value = true
    const wrapper = createWrapper()
    expect(wrapper.findComponent({ name: 'NoteList' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'ReferenceList' }).exists()).toBe(false)
    expect(state.loadAllNotes).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('点击「参考资料」携带 tab query 并切换内容区', async () => {
    testGlobals().__notesPageVaultPath!.value = '/vault'
    testGlobals().__notesPageVaultReady!.value = true
    const wrapper = createWrapper()

    const referencesButton = wrapper.findAll('.sidebar-item').find((b) => b.text() === '参考资料')!
    await referencesButton.trigger('click')
    expect(state.routerPush).toHaveBeenCalledWith({ query: { tab: 'references' } })

    testGlobals().__notesPageRoute!.query = { tab: 'references' }
    await nextTick()

    expect(wrapper.findComponent({ name: 'ReferenceList' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'NoteList' }).exists()).toBe(false)
    expect(state.loadAllReferences).toHaveBeenCalledWith('/vault')
    wrapper.unmount()
  })

  it('点击「笔记」移除 tab query', async () => {
    testGlobals().__notesPageRoute!.query = { tab: 'references' }
    testGlobals().__notesPageVaultPath!.value = '/vault'
    testGlobals().__notesPageVaultReady!.value = true
    const wrapper = createWrapper()

    const notesButton = wrapper.findAll('.sidebar-item').find((b) => b.text() === '笔记')!
    await notesButton.trigger('click')
    expect(state.routerPush).toHaveBeenCalledWith({ query: {} })
    wrapper.unmount()
  })

  it('点击「复习会话」携带 tab query 并展示复习会话列表', async () => {
    testGlobals().__notesPageVaultPath!.value = '/vault'
    testGlobals().__notesPageVaultReady!.value = true
    state.listReviewSessions.mockResolvedValue([
      {
        id: 'review_1',
        title: '复习：费曼学习法',
        created: '2026-08-10T08:00:00.000Z',
        reviewedNote: '/vault/notes/费曼学习法.md',
        completed: true,
        questionCount: 3,
      },
    ])
    const wrapper = createWrapper()

    const reviewsButton = wrapper.findAll('.sidebar-item').find((b) => b.text() === '复习会话')!
    await reviewsButton.trigger('click')
    expect(state.routerPush).toHaveBeenCalledWith({ query: { tab: 'reviews' } })

    testGlobals().__notesPageRoute!.query = { tab: 'reviews' }
    await flushPromises()

    expect(state.listReviewSessions).toHaveBeenCalledWith('/vault')
    expect(wrapper.text()).toContain('复习：费曼学习法')
    expect(wrapper.text()).toContain('已完成')
    wrapper.unmount()
  })

  it('点击复习会话条目跳转到对应复习页', async () => {
    testGlobals().__notesPageRoute!.query = { tab: 'reviews' }
    testGlobals().__notesPageVaultPath!.value = '/vault'
    testGlobals().__notesPageVaultReady!.value = true
    state.listReviewSessions.mockResolvedValue([
      {
        id: 'review_1',
        title: '复习：费曼学习法',
        created: '2026-08-10T08:00:00.000Z',
        reviewedNote: '/vault/notes/费曼学习法.md',
        completed: false,
        questionCount: 3,
      },
    ])
    const wrapper = createWrapper()
    await flushPromises()

    await wrapper.find('.review-session-item').trigger('click')
    expect(state.routerPush).toHaveBeenCalledWith('/review/review_1')
    wrapper.unmount()
  })

  it('references tab 下 vaultPath 变化触发 loadAllReferences', async () => {
    testGlobals().__notesPageRoute!.query = { tab: 'references' }
    // vaultPath 初始为 null：不加载任何数据，仅显示空态引导
    testGlobals().__notesPageVaultReady!.value = true
    const wrapper = createWrapper()
    await nextTick()
    expect(state.loadAllReferences).not.toHaveBeenCalled()
    expect(state.loadAllNotes).not.toHaveBeenCalled()

    testGlobals().__notesPageVaultPath!.value = '/vault'
    await nextTick()

    expect(state.loadAllReferences).toHaveBeenCalledWith('/vault')
    expect(state.loadAllNotes).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('参考资料上传事件调用 referenceStore.uploadReference（逐文件上传）', async () => {
    testGlobals().__notesPageRoute!.query = { tab: 'references' }
    testGlobals().__notesPageVaultPath!.value = '/vault'
    testGlobals().__notesPageVaultReady!.value = true
    const wrapper = createWrapper()
    await flushPromises()

    const fileA = new File(['# A'], 'a.md', { type: 'text/markdown' })
    const fileB = new File(['# B'], 'b.pdf', { type: 'application/pdf' })
    wrapper.findComponent({ name: 'ReferenceList' }).vm.$emit('upload', [fileA, fileB])
    await flushPromises()

    expect(state.uploadReference).toHaveBeenCalledTimes(2)
    expect(state.uploadReference).toHaveBeenCalledWith('/vault', fileA)
    expect(state.uploadReference).toHaveBeenCalledWith('/vault', fileB)
    wrapper.unmount()
  })

  it('上传 PNG 后自动弹出图片转笔记确认框（reference 模式）', async () => {
    testGlobals().__notesPageRoute!.query = { tab: 'references' }
    testGlobals().__notesPageVaultPath!.value = '/vault'
    testGlobals().__notesPageVaultReady!.value = true
    const pngMeta: ReferenceMeta = {
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
    state.uploadReference.mockResolvedValue(pngMeta)
    const wrapper = createWrapper()
    await flushPromises()

    const file = new File(['x'], '示意图.png', { type: 'image/png' })
    wrapper.findComponent({ name: 'ReferenceList' }).vm.$emit('upload', [file])
    await flushPromises()

    // 异步加载的弹窗渲染到 body（Teleport），reference 模式标题为「识别图片为 Markdown」
    await vi.waitFor(() => {
      expect(document.querySelector('.imd')?.textContent).toContain('识别图片为 Markdown')
    })
    expect(document.querySelector('.imd')?.textContent).toContain('取消')
    wrapper.unmount()
  })

  it('参考资料卡片「转为 Markdown」按钮打开 reference 模式弹窗', async () => {
    testGlobals().__notesPageRoute!.query = { tab: 'references' }
    testGlobals().__notesPageVaultPath!.value = '/vault'
    testGlobals().__notesPageVaultReady!.value = true
    const pngMeta: ReferenceMeta = {
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
    testGlobals().__notesPageReferences!.value = [pngMeta]
    const wrapper = createWrapper()
    await flushPromises()

    wrapper.findComponent({ name: 'ReferenceList' }).vm.$emit('recognize', pngMeta.path)
    await flushPromises()

    await vi.waitFor(() => {
      expect(document.querySelector('.imd')?.textContent).toContain('识别图片为 Markdown')
    })
    wrapper.unmount()
  })

  it('「新建笔记 → 从图片导入」打开 note 模式弹窗', async () => {
    testGlobals().__notesPageVaultPath!.value = '/vault'
    testGlobals().__notesPageVaultReady!.value = true
    const wrapper = createWrapper()
    await flushPromises()

    wrapper.findComponent({ name: 'NoteList' }).vm.$emit('create-from-image')
    await flushPromises()

    await vi.waitFor(() => {
      expect(document.querySelector('.imd')?.textContent).toContain('从图片导入笔记')
    })
    wrapper.unmount()
  })

  it('「新建笔记 → 空白笔记」创建空白笔记并跳转编辑', async () => {
    testGlobals().__notesPageVaultPath!.value = '/vault'
    testGlobals().__notesPageVaultReady!.value = true
    state.saveNote.mockResolvedValue('/vault/notes/无标题笔记.md')
    const wrapper = createWrapper()
    await flushPromises()

    wrapper.findComponent({ name: 'NoteList' }).vm.$emit('create-blank')
    await flushPromises()

    expect(state.saveNote).toHaveBeenCalledWith(
      '/vault',
      expect.objectContaining({ title: '无标题笔记', type: 'concept', tags: [] }),
      '',
      '',
      '',
    )
    expect(state.routerPush).toHaveBeenCalledWith('/notes/' + encodeURIComponent('/vault/notes/无标题笔记.md'))
    wrapper.unmount()
  })

  it('空白笔记与已有笔记重名时自动追加序号', async () => {
    testGlobals().__notesPageVaultPath!.value = '/vault'
    testGlobals().__notesPageVaultReady!.value = true
    testGlobals().__notesPageNotes!.value = [{ title: '无标题笔记' }]
    state.saveNote.mockResolvedValue('/vault/notes/无标题笔记 2.md')
    const wrapper = createWrapper()
    await flushPromises()

    wrapper.findComponent({ name: 'NoteList' }).vm.$emit('create-blank')
    await flushPromises()

    expect(state.saveNote).toHaveBeenCalledWith(
      '/vault',
      expect.objectContaining({ title: '无标题笔记 2' }),
      '',
      '',
      '',
    )
    wrapper.unmount()
  })

  it('未打开 Vault 时新建空白笔记给出提示', async () => {
    testGlobals().__notesPageVaultPath!.value = null
    testGlobals().__notesPageVaultReady!.value = true
    const wrapper = createWrapper()
    await flushPromises()

    wrapper.findComponent({ name: 'NoteList' }).vm.$emit('create-blank')
    await flushPromises()

    expect(state.saveNote).not.toHaveBeenCalled()
    expect(state.routerPush).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('点击 ReferenceList select 事件后弹出编辑弹窗', async () => {
    testGlobals().__notesPageRoute!.query = { tab: 'references' }
    testGlobals().__notesPageVaultPath!.value = '/vault'
    testGlobals().__notesPageVaultReady!.value = true
    testGlobals().__notesPageReferences!.value = [referenceMeta]
    const wrapper = createWrapper()
    await flushPromises()

    wrapper.findComponent({ name: 'ReferenceList' }).vm.$emit('select', referenceMeta.path)
    await flushPromises()

    // 弹窗已渲染到 body（Teleport），标题回填自 meta
    const dialog = document.body.querySelector('.ref-edit')
    expect(dialog).toBeTruthy()
    expect((dialog!.querySelector('#ref-edit-title') as HTMLInputElement).value).toBe('认知科学导论')
    // 弹窗打开时异步加载预览
    expect(state.loadReferencePreview).toHaveBeenCalledWith(referenceMeta)
    wrapper.unmount()
  })

  it('弹窗 save 事件调用 store.updateReference 并关闭', async () => {
    testGlobals().__notesPageRoute!.query = { tab: 'references' }
    testGlobals().__notesPageVaultPath!.value = '/vault'
    testGlobals().__notesPageVaultReady!.value = true
    testGlobals().__notesPageReferences!.value = [referenceMeta]
    const wrapper = createWrapper()
    await flushPromises()

    wrapper.findComponent({ name: 'ReferenceList' }).vm.$emit('select', referenceMeta.path)
    await flushPromises()

    const titleInput = document.body.querySelector<HTMLInputElement>('#ref-edit-title')!
    titleInput.value = '新的标题'
    titleInput.dispatchEvent(new Event('input'))
    await nextTick()

    const saveButton = Array.from(document.body.querySelectorAll<HTMLButtonElement>('.ref-edit__btn')).find(
      (b) => b.textContent?.trim() === '保存',
    )!
    saveButton.click()
    await flushPromises()

    expect(state.updateReference).toHaveBeenCalledWith(
      expect.objectContaining({ path: referenceMeta.path, title: '新的标题' }),
    )
    expect(document.body.querySelector('.ref-edit')).toBeNull()
    wrapper.unmount()
  })

  it('弹窗 delete 事件调用 store.deleteReference 并关闭、清空选中', async () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
    testGlobals().__notesPageRoute!.query = { tab: 'references' }
    testGlobals().__notesPageVaultPath!.value = '/vault'
    testGlobals().__notesPageVaultReady!.value = true
    testGlobals().__notesPageReferences!.value = [referenceMeta]
    const wrapper = createWrapper()
    await flushPromises()

    wrapper.findComponent({ name: 'ReferenceList' }).vm.$emit('select', referenceMeta.path)
    await flushPromises()

    const deleteButton = Array.from(document.body.querySelectorAll<HTMLButtonElement>('.ref-edit__btn')).find(
      (b) => b.textContent?.trim() === '删除',
    )!
    deleteButton.click()
    await flushPromises()

    expect(state.deleteReference).toHaveBeenCalledWith(referenceMeta.path)
    expect(document.body.querySelector('.ref-edit')).toBeNull()
    wrapper.unmount()
  })
})
