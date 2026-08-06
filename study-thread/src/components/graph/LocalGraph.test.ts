import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import { nextTick } from 'vue'
import LocalGraph from './LocalGraph.vue'
import { useNoteStore } from '../../stores/notes'
import type { Note } from '../../types'

function makeNote(path: string, title: string, content: string): Note {
  return {
    path,
    title,
    type: 'concept',
    tags: [],
    created: '2026-01-01T00:00:00.000Z',
    updated: '2026-01-01T00:00:00.000Z',
    confidence: 0,
    review: { next: null, interval: 0, mastery: 0 },
    content,
  }
}

let pinia: Pinia
let router: Router

beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
  router = createRouter({ history: createMemoryHistory(), routes: [] })
})

describe('LocalGraph', () => {
  it('全量模式（depth=Infinity）展示所有笔记节点与全部联系，孤立笔记也包含在内', async () => {
    const store = useNoteStore()
    const notes = [
      makeNote('/vault/notes/a.md', '笔记A', '见 [[笔记B]]'),
      makeNote('/vault/notes/b.md', '笔记B', '见 [[笔记A]]'),
      makeNote('/vault/notes/c.md', '笔记C', '无任何关联'),
    ]
    for (const note of notes) store.noteIndex.set(note.path, note)

    const wrapper = mount(LocalGraph, {
      props: { noteId: '/vault/notes/a.md', depth: Infinity },
      global: { plugins: [pinia, router] },
    })
    await nextTick()
    await nextTick()

    // script setup 顶层绑定运行时可见，但类型未暴露，此处仅按需断言
    const vm = wrapper.vm as unknown as { nodes: Array<{ id: string; isCenter: boolean }>; links: unknown[] }
    // 所有笔记均为节点（含孤立笔记 C）
    expect(vm.nodes).toHaveLength(3)
    // A↔B 双向链接去重后只有一条边
    expect(vm.links).toHaveLength(1)
    // 中心节点为当前笔记
    const center = vm.nodes.find((n) => n.isCenter)
    expect(center?.id).toBe('/vault/notes/a.md')
  })

  it('局部模式（depth=1）仅展示中心节点与一层邻居，孤立节点不展示', async () => {
    const store = useNoteStore()
    const notes = [
      makeNote('/vault/notes/a.md', '笔记A', '见 [[笔记B]]'),
      makeNote('/vault/notes/b.md', '笔记B', '见 [[笔记A]]'),
      makeNote('/vault/notes/c.md', '笔记C', '无任何关联'),
    ]
    for (const note of notes) store.noteIndex.set(note.path, note)

    const wrapper = mount(LocalGraph, {
      props: { noteId: '/vault/notes/a.md', depth: 1 },
      global: { plugins: [pinia, router] },
    })
    await nextTick()
    await nextTick()

    const vm = wrapper.vm as unknown as { nodes: unknown[]; links: unknown[] }
    expect(vm.nodes).toHaveLength(2)
    // BFS 从中心出发 depth=1 只遍历一层：仅 a→b 一条边
    expect(vm.links).toHaveLength(1)
  })
})
