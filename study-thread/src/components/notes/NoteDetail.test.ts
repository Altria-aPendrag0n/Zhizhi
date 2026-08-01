import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import NoteDetail from './NoteDetail.vue'
import type { Note } from '../../types'

vi.mock('../editor/MarkdownEditor.vue', () => ({
  default: {
    template: '<div class="cm-content" data-highlightable="true">笔记正文选中文本</div>',
  },
}))

const note: Note = {
  path: 'notes/test.md',
  title: '测试笔记',
  type: 'concept',
  tags: [],
  created: '2026-01-01T00:00:00.000Z',
  updated: '2026-01-01T00:00:00.000Z',
  confidence: 1,
  review: { next: null, interval: 0, mastery: 0 },
  content: '笔记正文选中文本',
}

afterEach(() => {
  window.getSelection()?.removeAllRanges()
})

describe('NoteDetail', () => {
  it('为笔记正文和源码编辑区提供划线菜单语义标记', () => {
    const wrapper = mount(NoteDetail, { props: { note } })

    expect(wrapper.find('.note-editor[data-highlightable="true"]').exists()).toBe(true)
    expect(wrapper.find('.cm-content[data-highlightable="true"]').exists()).toBe(true)
  })

  it('选中笔记正文时显示 HighlightMenu', async () => {
    const wrapper = mount(NoteDetail, { props: { note }, attachTo: document.body })
    const body = wrapper.find('.cm-content').element
    const range = document.createRange()
    range.selectNodeContents(body)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)

    await wrapper.find('.note-editor').trigger('mouseup')
    await nextTick()

    expect(document.querySelector('.highlight-menu')).not.toBeNull()
    expect(document.querySelector('.highlight-menu')?.textContent).toContain('摘录为笔记')
    wrapper.unmount()
  })

  it('清空或移出笔记正文的选区时关闭 HighlightMenu', async () => {
    const wrapper = mount(NoteDetail, { props: { note }, attachTo: document.body })
    const body = wrapper.find('.cm-content').element
    const range = document.createRange()
    range.selectNodeContents(body)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)

    await wrapper.find('.note-editor').trigger('mouseup')
    await nextTick()
    expect(document.querySelector('.highlight-menu')).not.toBeNull()

    selection.removeAllRanges()
    await wrapper.find('.note-editor').trigger('mouseup')
    await nextTick()

    expect(document.querySelector('.highlight-menu')).toBeNull()
    wrapper.unmount()
  })

  it('关闭划线菜单时不得调用 getSelection().removeAllRanges 破坏 CodeMirror 光标选区', async () => {
    const wrapper = mount(NoteDetail, { props: { note }, attachTo: document.body })
    const body = wrapper.find('.cm-content').element
    const selection = window.getSelection()!

    // 先选中正文以打开划线菜单（此时尚未安装 spy，设置选区属测试自身操作）
    const range = document.createRange()
    range.selectNodeContents(body)
    selection.removeAllRanges()
    selection.addRange(range)

    // 监控组件是否清除浏览器选区
    const removeAllRangesSpy = vi.spyOn(selection, 'removeAllRanges')

    // 选中正文时打开划线菜单：不得清除选区
    await wrapper.find('.note-editor').trigger('mouseup')
    await nextTick()
    expect(removeAllRangesSpy).not.toHaveBeenCalled()
    expect(document.querySelector('.highlight-menu')).not.toBeNull()

    // 模拟 CodeMirror 光标：将选区折叠为插入点（collapse 不经过 removeAllRanges）
    selection.collapse(body, 0)

    // 光标场景下 mouseup → 仅关闭划线菜单：不得调用 removeAllRanges
    await wrapper.find('.note-editor').trigger('mouseup')
    await nextTick()
    expect(document.querySelector('.highlight-menu')).toBeNull()
    expect(removeAllRangesSpy).not.toHaveBeenCalled()

    removeAllRangesSpy.mockRestore()
    wrapper.unmount()
  })

  it('created/updated 为空时日期区域不显示 Invalid Date', () => {
    const wrapper = mount(NoteDetail, {
      props: { note: { ...note, created: '', updated: '' } },
    })
    const metaText = wrapper.find('.note-meta').text()
    expect(metaText).not.toContain('Invalid')
    expect(metaText).toContain('创建于')
  })

  it('created/updated 为非法字符串时兜底不显示 Invalid Date', () => {
    const wrapper = mount(NoteDetail, {
      props: { note: { ...note, created: 'not-a-date', updated: 'not-a-date' } },
    })
    expect(wrapper.find('.note-meta').text()).not.toContain('Invalid')
  })
})
