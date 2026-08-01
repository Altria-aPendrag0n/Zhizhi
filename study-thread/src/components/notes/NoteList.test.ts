import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import NoteList from './NoteList.vue'
import type { NoteMeta } from '../../types'

const note: NoteMeta = {
  path: '/vault/notes/测试笔记.md',
  title: '测试笔记',
  type: 'concept',
  tags: [],
  created: '2026-01-01T00:00:00.000Z',
  updated: '2026-01-01T00:00:00.000Z',
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
})
