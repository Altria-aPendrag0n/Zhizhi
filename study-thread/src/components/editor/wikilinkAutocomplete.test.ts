import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { CompletionContext } from '@codemirror/autocomplete'
import { createWikiLinkCompletionSource } from './wikilinkAutocomplete'
import type { NoteMeta } from '../../types'

const notes: NoteMeta[] = [
  { path: '/v/notes/a1.md', title: 'a1', type: 'concept', tags: [], created: '2026-01-01', updated: '2026-01-01' },
  { path: '/v/notes/a2.md', title: 'a2', type: 'concept', tags: [], created: '2026-01-01', updated: '2026-01-01' },
  { path: '/v/notes/b1.md', title: 'b1', type: 'fact', tags: [], created: '2026-01-01', updated: '2026-01-01' },
  { path: '/v/notes/b2.md', title: 'b2', type: 'method', tags: [], created: '2026-01-01', updated: '2026-01-01' },
]

function runSource(doc: string, pos: number, currentNotePath?: string) {
  const state = EditorState.create({ doc })
  const context = new CompletionContext(state, pos, false)
  return createWikiLinkCompletionSource(notes, currentNotePath)(context)
}

describe('createWikiLinkCompletionSource', () => {
  it('光标前无 [[ 时返回 null', () => {
    expect(runSource('hello world', 5)).toBeNull()
  })

  it('输入 [[a 时按标题过滤并返回 a1、a2', () => {
    const result = runSource('[[a', 3)
    expect(result).not.toBeNull()
    expect(result!.from).toBe(2)
    expect(result!.to).toBe(3)
    const labels = result!.options.map((option) => option.label)
    expect(labels).toEqual(['a1', 'a2'])
  })

  it('空查询（仅 [[）时列出全部笔记', () => {
    const result = runSource('[[', 2)
    expect(result).not.toBeNull()
    expect(result!.options).toHaveLength(4)
  })

  it('排除当前笔记自身', () => {
    const result = runSource('[[a', 3, '/v/notes/a1.md')
    const labels = result!.options.map((option) => option.label)
    expect(labels).toEqual(['a2'])
  })

  it('大小写不敏感过滤', () => {
    const upperNotes: NoteMeta[] = [
      { path: '/v/A1.md', title: 'A1', type: 'concept', tags: [], created: '', updated: '' },
      { path: '/v/b1.md', title: 'b1', type: 'concept', tags: [], created: '', updated: '' },
    ]
    const state = EditorState.create({ doc: '[[a' })
    const context = new CompletionContext(state, 3, false)
    const result = createWikiLinkCompletionSource(upperNotes)(context)
    expect(result!.options.map((option) => option.label)).toEqual(['A1'])
  })

  it('选中后插入 [[标题]]，光标停在标题后', () => {
    const state = EditorState.create({ doc: '[[a' })
    const view = new EditorView({ state, parent: document.body })
    const context = new CompletionContext(state, 3, false)
    const result = createWikiLinkCompletionSource(notes)(context)
    const option = result!.options[0]
    const apply = option.apply as (v: EditorView, c: unknown, f: number, t: number) => void
    apply(view, option, result!.from ?? 0, result!.to ?? 0)
    expect(view.state.doc.toString()).toBe('[[a1]]')
    expect(view.state.selection.main.head).toBe(4)
    view.destroy()
  })

  it('光标后已有闭合 ]] 时不产生重复括号', () => {
    const doc = '[[a]]'
    const state = EditorState.create({ doc })
    const view = new EditorView({ state, parent: document.body })
    const context = new CompletionContext(state, 3, false)
    const result = createWikiLinkCompletionSource(notes)(context)
    const option = result!.options[0]
    const apply = option.apply as (v: EditorView, c: unknown, f: number, t: number) => void
    apply(view, option, result!.from ?? 0, result!.to ?? 0)
    expect(view.state.doc.toString()).toBe('[[a1]]')
    expect(view.state.selection.main.head).toBe(4)
    view.destroy()
  })

  it('超过 20 条时截断', () => {
    const many: NoteMeta[] = Array.from({ length: 30 }, (_, index) => ({
      path: `/v/note-${index}.md`,
      title: `note-${index}`,
      type: 'concept',
      tags: [],
      created: '',
      updated: '',
    }))
    const state = EditorState.create({ doc: '[[note' })
    const context = new CompletionContext(state, 7, false)
    const result = createWikiLinkCompletionSource(many)(context)
    expect(result!.options).toHaveLength(20)
  })
})
