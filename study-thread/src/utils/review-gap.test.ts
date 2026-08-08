import { describe, it, expect } from 'vitest'
import { parseMentionedNotes } from './review-gap'
import type { Note } from '../types'

function makeNote(path: string, title: string): Note {
  return {
    path,
    title,
    type: 'concept',
    tags: [],
    created: '2026-08-01T00:00:00.000Z',
    updated: '2026-08-01T00:00:00.000Z',
    confidence: 0.5,
    review: { next: null, interval: 0, mastery: 0 },
    content: '',
  }
}

const clusterNotes: Note[] = [
  makeNote('notes/费曼学习法.md', '费曼学习法'),
  makeNote('notes/主动回忆.md', '主动回忆'),
  makeNote('notes/间隔重复.md', '间隔重复'),
]

describe('parseMentionedNotes（P4-4 缺口定位）', () => {
  it('匹配 wikilink 形式的提及（含别名）', () => {
    const result = parseMentionedNotes('你的回答涉及了 [[主动回忆]]，但与 [[费曼学习法|费曼法]] 有混淆。', clusterNotes)
    expect(result).toEqual(['notes/费曼学习法.md', 'notes/主动回忆.md'])
  })

  it('匹配纯文本标题提及', () => {
    const result = parseMentionedNotes('回答主要涉及 主动回忆，应补充 间隔重复 的机制。', clusterNotes)
    expect(result).toEqual(['notes/主动回忆.md', 'notes/间隔重复.md'])
  })

  it('未提及的笔记不被标记', () => {
    const result = parseMentionedNotes('这部分掌握良好，无需补充。', clusterNotes)
    expect(result).toEqual([])
  })

  it('短标题（<2 字）不参与纯文本匹配，防误判', () => {
    const shortNote = makeNote('notes/熵.md', '熵')
    const result = parseMentionedNotes('熵增定律反映了系统自发无序化趋势。', [shortNote])
    expect(result).toEqual([])
  })

  it('空文本或空笔记列表返回空数组', () => {
    expect(parseMentionedNotes('', clusterNotes)).toEqual([])
    expect(parseMentionedNotes('任何文本', [])).toEqual([])
  })

  it('同一笔记多次提及只返回一次（按输入顺序）', () => {
    const result = parseMentionedNotes('主动回忆 很关键，请结合 主动回忆 再想想 [[费曼学习法]]。', clusterNotes)
    expect(result).toEqual(['notes/费曼学习法.md', 'notes/主动回忆.md'])
  })
})
