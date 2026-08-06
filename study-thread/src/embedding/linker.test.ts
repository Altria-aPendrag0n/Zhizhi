import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NoteLinker } from './linker'
import type { NoteIndexer } from './indexer'
import type { EmbeddingEngine } from './engine'

vi.mock('../utils/vault-fs', () => ({
  readFile: vi.fn(async (path: string) => {
    if (path.endsWith('.json')) {
      return JSON.stringify({
        id: 'abc-123',
        path,
        title: '费曼学习法',
        description: '通过教来学的学习技巧',
        tags: ['学习法'],
        fileType: 'md',
        fileName: '费曼学习法.md',
        filePath: path.replace('.json', '.md'),
        created: '2026-01-01T00:00:00.000Z',
        updated: '2026-01-01T00:00:00.000Z',
      })
    }
    return ''
  }),
}))

function createLinker(entries: { path: string; vector: number[] }[]) {
  const engine = {
    isReady: () => true,
    embed: async () => [1, 0],
  } as unknown as EmbeddingEngine
  const indexer = {
    getAllEntries: () => entries,
  } as unknown as NoteIndexer
  return new NoteLinker(indexer, engine)
}

describe('NoteLinker.suggestLinks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('参考资料（.json 路径）显示元数据中的真实标题而非文件名', async () => {
    const linker = createLinker([
      { path: '/vault/references/abc-123.json', vector: [1, 0] },
    ])

    const results = await linker.suggestLinks('', '如何学习', 5)

    expect(results).toHaveLength(1)
    expect(results[0].title).toBe('费曼学习法')
    expect(results[0].title).not.toContain('.json')
  })

  it('笔记（.md 路径）取文件名去扩展名作为标题', async () => {
    const linker = createLinker([
      { path: '/vault/notes/间隔重复.md', vector: [1, 0] },
    ])

    const results = await linker.suggestLinks('', '记忆方法', 5)

    expect(results).toHaveLength(1)
    expect(results[0].title).toBe('间隔重复')
  })

  it('排除当前笔记自身', async () => {
    const linker = createLinker([
      { path: '/vault/notes/当前笔记.md', vector: [1, 0] },
      { path: '/vault/notes/其它笔记.md', vector: [1, 0] },
    ])

    const results = await linker.suggestLinks('/vault/notes/当前笔记.md', '学习', 5)

    expect(results.map((r) => r.notePath)).toEqual(['/vault/notes/其它笔记.md'])
  })
})
