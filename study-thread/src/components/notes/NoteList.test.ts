import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import NoteList from './NoteList.vue'
import type { NoteMeta } from '../../types'

const note: NoteMeta = {
  path: '/vault/notes/测试笔记.md',
  title: '测试笔记',
  type: 'concept',
  tags: ['记忆', '学习方法'],
  created: '2026-01-01T00:00:00.000Z',
  updated: '2026-01-01T00:00:00.000Z',
}

const note2: NoteMeta = {
  path: '/vault/notes/另一篇.md',
  title: '另一篇',
  type: 'concept',
  tags: ['费曼'],
  created: '2026-01-01T00:00:00.000Z',
  updated: '2026-01-02T00:00:00.000Z',
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('NoteList', () => {
  it('右键菜单可发出删除事件，并可通过 Escape 关闭', async () => {
    const wrapper = mount(NoteList, {
      props: { notes: [note] },
      attachTo: document.body,
    })

    await wrapper.find('.note-card').trigger('contextmenu', { clientX: 120, clientY: 120 })
    await nextTick()

    expect(document.querySelector('.note-context-menu')?.textContent).toContain('删除笔记')

    await document.querySelector<HTMLButtonElement>('.note-context-menu button')?.click()
    expect(wrapper.emitted('delete')).toEqual([[note.path]])

    await wrapper.find('.note-card').trigger('contextmenu', { clientX: 120, clientY: 120 })
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()

    expect(document.querySelector('.note-context-menu')).toBeNull()
    wrapper.unmount()
  })

  it('按标签筛选：输入标签仅展示包含该标签的笔记', async () => {
    const wrapper = mount(NoteList, { props: { notes: [note, note2] } })
    expect(wrapper.findAll('.note-card')).toHaveLength(2)

    const input = wrapper.find('.tag-filter-input')
    await input.setValue('记忆')
    await nextTick()

    const cards = wrapper.findAll('.note-card')
    expect(cards).toHaveLength(1)
    expect(cards[0].text()).toContain('测试笔记')
  })

  it('按标签筛选：多个标签需同时包含（AND），且忽略大小写', async () => {
    const noteWithBoth: NoteMeta = {
      ...note,
      path: '/vault/notes/双标签.md',
      title: '双标签',
      tags: ['记忆', '学习方法', '费曼'],
    }
    const wrapper = mount(NoteList, { props: { notes: [noteWithBoth, note2] } })

    await wrapper.find('.tag-filter-input').setValue('记忆, 费曼')
    await nextTick()

    const cards = wrapper.findAll('.note-card')
    expect(cards).toHaveLength(1)
    expect(cards[0].text()).toContain('双标签')
  })

  it('标签筛选提示列出所有已有标签（去重）', async () => {
    const wrapper = mount(NoteList, { props: { notes: [note, note2] } })
    const options = wrapper.findAll('#note-tags option')
    const values = options.map((o) => o.attributes('value'))
    expect(values).toContain('记忆')
    expect(values).toContain('学习方法')
    expect(values).toContain('费曼')
  })

  it('标签筛选支持单字匹配：输入"虾"命中所有含"虾"字的标签', async () => {
    const shrimpNote: NoteMeta = {
      path: '/vault/notes/虾类.md',
      title: '虾类知识',
      type: 'concept',
      tags: ['淡水虾', '小龙虾'],
      created: '2026-01-01T00:00:00.000Z',
      updated: '2026-01-03T00:00:00.000Z',
    }
    const wrapper = mount(NoteList, { props: { notes: [shrimpNote, note2] } })

    await wrapper.find('.tag-filter-input').setValue('虾')
    await nextTick()

    const cards = wrapper.findAll('.note-card')
    expect(cards).toHaveLength(1)
    expect(cards[0].text()).toContain('虾类知识')
  })

  it('标签筛选支持拼音匹配：输入全拼"xia"或首字母"dsx"命中对应标签', async () => {
    const shrimpNote: NoteMeta = {
      path: '/vault/notes/虾类.md',
      title: '虾类知识',
      type: 'concept',
      tags: ['淡水虾', '小龙虾'],
      created: '2026-01-01T00:00:00.000Z',
      updated: '2026-01-03T00:00:00.000Z',
    }
    const wrapper = mount(NoteList, { props: { notes: [shrimpNote, note2] } })

    // 全拼
    await wrapper.find('.tag-filter-input').setValue('xia')
    await nextTick()
    expect(wrapper.findAll('.note-card')).toHaveLength(1)

    // 首字母缩写
    await wrapper.find('.tag-filter-input').setValue('dsx')
    await nextTick()
    expect(wrapper.findAll('.note-card')).toHaveLength(1)
    expect(wrapper.findAll('.note-card')[0].text()).toContain('虾类知识')
  })

  it('搜索框支持拼音匹配标题或标签', async () => {
    const wrapper = mount(NoteList, { props: { notes: [note, note2] } })

    // 'feiman' → 费曼学习法的标签'费曼'
    await wrapper.find('.search-input').setValue('feiman')
    await nextTick()
    const cards = wrapper.findAll('.note-card')
    expect(cards).toHaveLength(1)
    expect(cards[0].text()).toContain('另一篇')
  })

  it('新建笔记菜单：展示「空白笔记 / 从图片导入」，点击从图片导入 emit create-from-image', async () => {
    const wrapper = mount(NoteList, {
      props: { notes: [note] },
      attachTo: document.body,
    })

    await wrapper.find('.new-note-btn').trigger('click')
    await nextTick()
    const menu = document.querySelector<HTMLElement>('.new-note-menu')
    expect(menu?.textContent).toContain('空白笔记')
    expect(menu?.textContent).toContain('从图片导入')

    const items = menu?.querySelectorAll('button') ?? []
    const imageItem = Array.from(items).find((b) => b.textContent?.includes('从图片导入'))
    await imageItem?.click()
    await nextTick()
    expect(wrapper.emitted('create-from-image')).toBeTruthy()
    expect(document.querySelector('.new-note-menu')).toBeNull()
    wrapper.unmount()
  })

  it('新建笔记菜单：点击「空白笔记」emit create-blank', async () => {
    const wrapper = mount(NoteList, {
      props: { notes: [note] },
      attachTo: document.body,
    })

    await wrapper.find('.new-note-btn').trigger('click')
    await nextTick()
    const items = document.querySelectorAll<HTMLButtonElement>('.new-note-menu button')
    const blankItem = Array.from(items).find((b) => b.textContent?.includes('空白笔记'))
    await blankItem?.click()
    await nextTick()
    expect(wrapper.emitted('create-blank')).toBeTruthy()
    expect(document.querySelector('.new-note-menu')).toBeNull()
    wrapper.unmount()
  })

  it('点击外部关闭新建笔记菜单', async () => {
    const wrapper = mount(NoteList, {
      props: { notes: [note] },
      attachTo: document.body,
    })

    await wrapper.find('.new-note-btn').trigger('click')
    await nextTick()
    expect(document.querySelector('.new-note-menu')).not.toBeNull()

    document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await nextTick()
    expect(document.querySelector('.new-note-menu')).toBeNull()
    wrapper.unmount()
  })
})
