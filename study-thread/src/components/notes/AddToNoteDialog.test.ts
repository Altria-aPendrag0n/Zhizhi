import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import AddToNoteDialog from './AddToNoteDialog.vue'
import type { NoteMeta } from '../../types'

const readFile = vi.hoisted(() => vi.fn())
vi.mock('../../utils/vault-fs', () => ({ readFile }))

const notes: NoteMeta[] = [
  {
    path: 'notes/旧笔记.md',
    title: '旧笔记',
    type: 'concept',
    tags: [],
    created: '2026-01-01T00:00:00.000Z',
    updated: '2026-01-01T00:00:00.000Z',
  },
  {
    path: 'notes/最近编辑.md',
    title: '最近编辑',
    type: 'concept',
    tags: [],
    created: '2026-01-01T00:00:00.000Z',
    updated: '2026-03-01T00:00:00.000Z',
  },
]

/** 笔记正文：二级标题 + 三级标题 */
const NOTE_CONTENT = `---
title: 最近编辑
type: concept
created: 2026-01-01T00:00:00.000Z
updated: 2026-03-01T00:00:00.000Z
---

## 二级标题
内容

### 三级标题
细节`

const NOTE_BODY = '## 二级标题\n内容\n\n### 三级标题\n细节'

function mountDialog(overrides: Record<string, unknown> = {}) {
  return mount(AddToNoteDialog, {
    props: {
      visible: true,
      highlightedText: '划线内容',
      notes,
      ...overrides,
    },
    global: {
      stubs: { teleport: true },
    },
    attachTo: document.body,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  document.body.innerHTML = ''
})

describe('AddToNoteDialog', () => {
  it('打开时按最近编辑排序并默认选中第一篇', () => {
    const wrapper = mountDialog()
    const items = wrapper.findAll('.add-note-item')
    expect(items).toHaveLength(2)
    // 最近编辑的笔记排在首位并默认选中
    expect(items[0].text()).toContain('最近编辑')
    expect(items[0].classes()).toContain('add-note-item--active')
    wrapper.unmount()
  })

  it('没有笔记时显示空提示且下一步不可用', () => {
    const wrapper = mountDialog({ notes: [] })
    expect(wrapper.find('.add-note-empty').text()).toContain('还没有笔记')
    expect(wrapper.find('.add-note-dialog__btn--primary').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('点击笔记后进入标题层级选择', async () => {
    readFile.mockResolvedValue(NOTE_CONTENT)
    const wrapper = mountDialog()
    await wrapper.findAll('.add-note-item')[0].trigger('click')
    await flushPromises()
    await nextTick()

    // 进入第二步：展示标题层级
    expect(wrapper.text()).toContain('选择插入位置')
    const headingBtns = wrapper.findAll('.add-note-heading')
    const headingTexts = headingBtns.map((btn) => btn.text())
    expect(headingTexts.some((t) => t.includes('文件末尾'))).toBe(true)
    expect(headingTexts.some((t) => t.includes('二级标题'))).toBe(true)
    expect(headingTexts.some((t) => t.includes('三级标题'))).toBe(true)
    wrapper.unmount()
  })

  it('点击标题并确认时发出带标题行号的 confirm 事件', async () => {
    readFile.mockResolvedValue(NOTE_CONTENT)
    const wrapper = mountDialog()
    await wrapper.findAll('.add-note-item')[0].trigger('click')
    await flushPromises()
    await nextTick()

    // 选择"三级标题"
    const headingBtns = wrapper.findAll('.add-note-heading')
    const thirdHeading = headingBtns.find((btn) => btn.text().includes('三级标题'))
    expect(thirdHeading).toBeDefined()
    await thirdHeading!.trigger('click')

    await wrapper.findAll('.add-note-dialog__btn--primary')[0].trigger('click')
    expect(wrapper.emitted('confirm')).toHaveLength(1)
    expect(wrapper.emitted('confirm')![0][0]).toEqual({
      notePath: 'notes/最近编辑.md',
      headingLine: 3,
      headingText: '三级标题',
      body: NOTE_BODY,
    })
    wrapper.unmount()
  })

  it('默认选中文件末尾，确认时 headingLine 为 null', async () => {
    readFile.mockResolvedValue(NOTE_CONTENT)
    const wrapper = mountDialog()
    // 用"下一步"按钮进入标题选择（默认选中最近编辑的笔记）
    await wrapper.findAll('.add-note-dialog__btn--primary')[0].trigger('click')
    await flushPromises()
    await nextTick()

    // 文件末尾默认激活
    const endOption = wrapper.findAll('.add-note-heading')[0]
    expect(endOption.text()).toContain('文件末尾')
    expect(endOption.classes()).toContain('add-note-heading--active')

    await wrapper.findAll('.add-note-dialog__btn--primary')[0].trigger('click')
    expect(wrapper.emitted('confirm')![0][0]).toMatchObject({
      notePath: 'notes/最近编辑.md',
      headingLine: null,
      headingText: '',
      body: NOTE_BODY,
    })
    wrapper.unmount()
  })

  it('读取笔记失败时显示错误且可返回', async () => {
    readFile.mockRejectedValue(new Error('read failed'))
    const wrapper = mountDialog()
    await wrapper.findAll('.add-note-dialog__btn--primary')[0].trigger('click')
    await flushPromises()
    await nextTick()

    expect(wrapper.find('.add-note-dialog__error').text()).toContain('无法读取笔记内容')
    // 返回按钮回到第一步
    await wrapper.findAll('.add-note-dialog__btn--ghost')[0].trigger('click')
    expect(wrapper.text()).toContain('选择要将划线内容加入的笔记')
    wrapper.unmount()
  })
})
