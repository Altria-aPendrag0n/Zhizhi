import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useNoteStore } from './notes'
import type { ExtractedNote } from '../types'

// Mock vault-fs
vi.mock('../utils/vault-fs', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  createDir: vi.fn().mockResolvedValue(undefined),
}))

describe('notes store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('初始状态为空', () => {
    const store = useNoteStore()
    expect(store.notes).toEqual([])
    expect(store.noteCount).toBe(0)
    expect(store.isLoading).toBe(false)
  })

  it('saveNote 保存笔记并更新列表', async () => {
    const store = useNoteStore()
    const note: ExtractedNote = {
      title: '费曼学习法',
      proposition: '核心命题',
      explanation: '解释内容',
      type: 'method',
      tags: ['学习'],
      confidence: 0.9,
    }

    const path = await store.saveNote('/vault', note, 'sessions/test.md', '划线文本')
    expect(path).toContain('/vault/notes/')
    expect(path).toContain('.md')
    expect(store.notes).toHaveLength(1)
    expect(store.notes[0].title).toBe('费曼学习法')
    expect(store.notes[0].type).toBe('method')
    expect(store.noteCount).toBe(1)
  })

  it('saveNote 重复保存同一笔记会更新', async () => {
    const store = useNoteStore()
    const note: ExtractedNote = {
      title: '测试笔记',
      proposition: '命题',
      explanation: '解释',
      type: 'concept',
      tags: [],
      confidence: 0.8,
    }

    await store.saveNote('/vault', note, 'sessions/test.md', '')
    expect(store.notes).toHaveLength(1)

    const updatedNote: ExtractedNote = { ...note, type: 'method' }
    await store.saveNote('/vault', updatedNote, 'sessions/test.md', '')

    expect(store.notes).toHaveLength(1)
    expect(store.notes[0].type).toBe('method')
  })

  it('notesByType 按类型分组', async () => {
    const store = useNoteStore()
    const baseNote: ExtractedNote = {
      title: '笔记',
      proposition: '命题',
      explanation: '解释',
      type: 'concept',
      tags: [],
      confidence: 0.8,
    }

    await store.saveNote('/vault', { ...baseNote, title: '概念1', type: 'concept' }, '', '')
    await store.saveNote('/vault', { ...baseNote, title: '方法1', type: 'method' }, '', '')
    await store.saveNote('/vault', { ...baseNote, title: '概念2', type: 'concept' }, '', '')

    const grouped = store.notesByType
    expect(grouped.concept).toHaveLength(2)
    expect(grouped.method).toHaveLength(1)
    expect(grouped.fact).toHaveLength(0)
  })

  it('loadNote 返回存储的笔记', async () => {
    const store = useNoteStore()
    const result = await store.loadNote('/some/path.md')
    expect(result).toBeNull()
  })
})