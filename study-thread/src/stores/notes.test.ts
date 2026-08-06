import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useNoteStore } from './notes'
import type { ExtractedNote } from '../types'

const vaultFs = vi.hoisted(() => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  createDir: vi.fn().mockResolvedValue(undefined),
  deleteFile: vi.fn().mockResolvedValue(undefined),
  listDir: vi.fn(),
  readFile: vi.fn(),
}))
const removeNote = vi.hoisted(() => vi.fn())

vi.mock('../utils/vault-fs', () => vaultFs)
vi.mock('../embedding/indexer', () => ({
  getNoteIndexer: () => ({ removeNote }),
}))

describe('notes store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('初始状态不包含示例笔记', () => {
    const store = useNoteStore()
    expect(store.notes).toHaveLength(0)
    expect(store.noteCount).toBe(0)
    expect(store.isLoading).toBe(false)
  })

  it('saveNote 保存笔记并同步本地列表', async () => {
    const store = useNoteStore()
    const note: ExtractedNote = {
      title: '费曼学习法',
      description: '通过教别人来检验理解',
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
    expect(store.notes[0]).toMatchObject({ title: '费曼学习法', type: 'method', proposition: '核心命题' })

    const reloadedStore = useNoteStore()
    reloadedStore.loadLocalNotes()
    expect(reloadedStore.notes).toHaveLength(1)
    expect(reloadedStore.notes[0].title).toBe('费曼学习法')
  })

  it('saveNote 重复保存同一笔记会更新', async () => {
    const store = useNoteStore()
    const note: ExtractedNote = {
      title: '测试笔记',
      description: '测试描述',
      proposition: '命题',
      explanation: '解释',
      type: 'concept',
      tags: [],
      confidence: 0.8,
    }

    await store.saveNote('/vault', note, 'sessions/test.md', '')
    expect(store.notes).toHaveLength(1)

    await store.saveNote('/vault', { ...note, type: 'method' }, 'sessions/test.md', '')
    expect(store.notes).toHaveLength(1)
    expect(store.notes[0].type).toBe('method')
  })

  it('notesByType 按类型分组', async () => {
    const store = useNoteStore()
    const baseNote: ExtractedNote = {
      title: '笔记',
      description: '基础描述',
      proposition: '命题',
      explanation: '解释',
      type: 'concept',
      tags: [],
      confidence: 0.8,
    }

    await store.saveNote('/vault', { ...baseNote, title: '概念1', type: 'concept' }, '', '')
    await store.saveNote('/vault', { ...baseNote, title: '方法1', type: 'method' }, '', '')
    await store.saveNote('/vault', { ...baseNote, title: '概念2', type: 'concept' }, '', '')

    expect(store.notesByType.concept).toHaveLength(2)
    expect(store.notesByType.method).toHaveLength(1)
    expect(store.notesByType.fact).toHaveLength(0)
  })

  it('loadAllNotes 只保留当前 Vault notes 目录中的笔记并清理旧缓存', async () => {
    const store = useNoteStore()
    const localNote: ExtractedNote = {
      title: '本地笔记',
      description: '本地描述',
      proposition: '本地命题',
      explanation: '解释',
      type: 'concept',
      tags: [],
      confidence: 0.8,
    }
    await store.saveNote('/vault', localNote, 'sessions/test.md', '')
    vaultFs.listDir.mockImplementation(async (path: string) => {
      if (path === '/vault/notes') {
        return [
          { name: 'Vault笔记.md', path: '/vault/notes/Vault笔记.md', is_dir: false },
          { name: '课程', path: '/vault/notes/课程', is_dir: true },
        ]
      }
      return [{ name: '嵌套笔记.MD', path: '/vault/notes/课程/嵌套笔记.MD', is_dir: false }]
    })
    vaultFs.readFile.mockImplementation(async (path: string) => path.includes('嵌套')
      ? '---\ntitle: 嵌套笔记\ntype: method\ncreated: 2026-01-02T00:00:00.000Z\nupdated: 2026-01-02T00:00:00.000Z\n---\n\n嵌套内容'
      : '---\ntitle: Vault笔记\ntype: fact\ncreated: 2026-01-01T00:00:00.000Z\nupdated: 2026-01-01T00:00:00.000Z\n---\n\n内容')

    await store.loadAllNotes('/vault')

    expect(store.notes.map((note) => note.title)).toEqual(['嵌套笔记', 'Vault笔记'])
    expect(JSON.parse(localStorage.getItem('study-thread-extracted-notes') || '[]')).toEqual([])
  })

  it('loadAllNotes 对缺失 created 的笔记回退使用 updated 作为时间字段', async () => {
    const store = useNoteStore()
    vaultFs.listDir.mockImplementation(async (path: string) => {
      if (path === '/vault/notes') {
        return [{ name: '无创建时间.md', path: '/vault/notes/无创建时间.md', is_dir: false }]
      }
      return []
    })
    vaultFs.readFile.mockResolvedValue('---\ntitle: 无创建时间\nupdated: 2026-01-05T00:00:00.000Z\n---\n\n内容')

    await store.loadAllNotes('/vault')

    expect(store.notes).toHaveLength(1)
    expect(store.notes[0].created).toBe('2026-01-05T00:00:00.000Z')
    expect(store.notes[0].updated).toBe('2026-01-05T00:00:00.000Z')
  })

  it('loadAllNotes 对缺失 updated 的笔记回退使用 created 作为时间字段', async () => {
    const store = useNoteStore()
    vaultFs.listDir.mockImplementation(async (path: string) => {
      if (path === '/vault/notes') {
        return [{ name: '无更新时间.md', path: '/vault/notes/无更新时间.md', is_dir: false }]
      }
      return []
    })
    vaultFs.readFile.mockResolvedValue('---\ntitle: 无更新时间\ncreated: 2026-01-05T00:00:00.000Z\n---\n\n内容')

    await store.loadAllNotes('/vault')

    expect(store.notes).toHaveLength(1)
    expect(store.notes[0].created).toBe('2026-01-05T00:00:00.000Z')
    expect(store.notes[0].updated).toBe('2026-01-05T00:00:00.000Z')
  })

  it('updateNote 将标题、标签和正文写回 Vault', async () => {
    vaultFs.readFile.mockResolvedValue('---\ntitle: 原标题\ntype: concept\ntags:\n  - 原标签\ncreated: 2026-01-01T00:00:00.000Z\nupdated: 2026-01-01T00:00:00.000Z\n---\n\n原正文')
    const store = useNoteStore()

    const result = await store.updateNote({
      path: '/vault/notes/测试.md',
      title: '新标题',
      type: 'concept',
      tags: ['新标签'],
      created: '2026-01-01T00:00:00.000Z',
      updated: '2026-01-01T00:00:00.000Z',
      confidence: 0,
      review: { next: null, interval: 0, mastery: 0 },
      content: '新正文',
    })

    expect(result).toMatchObject({ title: '新标题', tags: ['新标签'], content: '新正文' })
    expect(vaultFs.writeFile).toHaveBeenCalledWith('/vault/notes/测试.md', expect.stringContaining('title: 新标题'))
    expect(vaultFs.writeFile).toHaveBeenCalledWith('/vault/notes/测试.md', expect.stringContaining('新正文'))
  })

  it('deleteNote 在 Vault 删除成功后同步列表、缓存和索引', async () => {
    const store = useNoteStore()
    const path = await store.saveNote('/vault', {
      title: '待删除笔记',
      description: '待删除描述',
      proposition: '命题',
      explanation: '解释',
      type: 'concept',
      tags: [],
      confidence: 0.8,
    }, '', '')

    expect(await store.deleteNote(path!)).toBe(true)
    expect(vaultFs.deleteFile).toHaveBeenCalledWith(path)
    expect(store.notes).toHaveLength(0)
    expect(JSON.parse(localStorage.getItem('study-thread-extracted-notes') || '[]')).toEqual([])
    expect(removeNote).toHaveBeenCalledWith(path)
    // 删除信号供聊天页刷新"已生成笔记"引用
    expect(store.lastDeletedNotePath).toBe(path)
  })

  it('deleteNote 拒绝删除当前 Vault notes 目录外或非 Markdown 的文件', async () => {
    const store = useNoteStore()
    await store.saveNote('/vault', {
      title: '受保护笔记',
      description: '受保护描述',
      proposition: '命题',
      explanation: '解释',
      type: 'concept',
      tags: [],
      confidence: 0.8,
    }, '', '')

    expect(await store.deleteNote('/vault/sessions/test.md')).toBe(false)
    expect(await store.deleteNote('/vault/notes/附件.txt')).toBe(false)
    expect(await store.deleteNote('/other/notes/笔记.md')).toBe(false)
    expect(vaultFs.deleteFile).not.toHaveBeenCalled()
    expect(store.notes).toHaveLength(1)
    expect(store.lastDeletedNotePath).toBeNull()
  })

  it('deleteNote 在 Vault 删除失败时保留本地数据', async () => {
    const store = useNoteStore()
    const path = await store.saveNote('/vault', {
      title: '保留笔记',
      description: '保留描述',
      proposition: '命题',
      explanation: '解释',
      type: 'concept',
      tags: [],
      confidence: 0.8,
    }, '', '')
    vaultFs.deleteFile.mockRejectedValueOnce(new Error('delete failed'))

    expect(await store.deleteNote(path!)).toBe(false)
    expect(store.notes).toHaveLength(1)
    expect(removeNote).not.toHaveBeenCalled()
    // 删除失败不触发刷新信号
    expect(store.lastDeletedNotePath).toBeNull()
  })

  it('loadNote 对不存在的路径返回 null', async () => {
    vaultFs.readFile.mockRejectedValueOnce(new Error('not found'))
    const store = useNoteStore()
    const result = await store.loadNote('/nonexistent/path.md')
    expect(result).toBeNull()
  })
})
