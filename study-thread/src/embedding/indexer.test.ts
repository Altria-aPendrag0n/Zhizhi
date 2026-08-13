import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NoteIndexer } from './indexer'

/** 构造仅用于测试的假引擎：isReady 恒为真，embed 返回与文本长度相关的向量 */
function createFakeEngine() {
  return {
    isReady: () => true,
    embed: vi.fn(async (text: string) => [text.length, 0]),
  } as never
}

describe('NoteIndexer 分块索引', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('updateChunks 为每个分块建立独立条目（chunkIndex 序号 + 位置元数据）', async () => {
    const indexer = new NoteIndexer(createFakeEngine() as never)
    await indexer.updateChunks('/vault/references/ref.json', [
      { text: '第一章', chunkTitle: '第一章', pageFrom: 0, pageTo: 0 },
      { text: '第二章', chunkTitle: '第二章', pageFrom: 1, pageTo: 2 },
    ])

    const entries = indexer.getAllEntries()
    expect(entries).toHaveLength(2)
    expect(entries[0].chunkIndex).toBe(0)
    expect(entries[0].chunkTitle).toBe('第一章')
    expect(entries[0].pageFrom).toBe(0)
    expect(entries[1].chunkIndex).toBe(1)
    expect(entries[1].chunkTitle).toBe('第二章')
    expect(entries[1].pageTo).toBe(2)
  })

  it('updateNote 覆盖同名路径下的旧分块，恢复为单块', async () => {
    const indexer = new NoteIndexer(createFakeEngine() as never)
    await indexer.updateChunks('/vault/references/ref.json', [
      { text: 'a', chunkTitle: 'A' },
      { text: 'b', chunkTitle: 'B' },
    ])
    await indexer.updateNote('/vault/references/ref.json', '全文')

    const entries = indexer.getAllEntries()
    expect(entries).toHaveLength(1)
    expect(entries[0].chunkIndex).toBeUndefined()
  })

  it('removeNote 移除该路径下的所有分块', async () => {
    const indexer = new NoteIndexer(createFakeEngine() as never)
    await indexer.updateChunks('/vault/references/ref.json', [
      { text: 'a', chunkTitle: 'A' },
      { text: 'b', chunkTitle: 'B' },
    ])
    indexer.removeNote('/vault/references/ref.json')

    expect(indexer.getAllEntries()).toHaveLength(0)
  })

  it('loadFromStorage 按分块键恢复多块条目', async () => {
    const engine = createFakeEngine()
    const indexer = new NoteIndexer(engine as never)
    await indexer.updateChunks('/vault/references/ref.json', [
      { text: 'a', chunkTitle: 'A' },
      { text: 'b', chunkTitle: 'B' },
    ])
    indexer.saveToStorage()

    const restored = new NoteIndexer(engine as never)
    expect(restored.loadFromStorage()).toBe(true)
    expect(restored.getAllEntries().map((e) => e.chunkIndex)).toEqual([0, 1])
  })
})
