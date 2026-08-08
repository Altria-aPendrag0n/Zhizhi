import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { LearnerProfile } from './learner-profile'

const { engine, indexer } = vi.hoisted(() => ({
  engine: { isReady: vi.fn(), embed: vi.fn() },
  indexer: { getAllEntries: vi.fn() },
}))

vi.mock('../embedding/engine', () => ({
  getEmbeddingEngine: () => engine,
}))

vi.mock('../embedding/indexer', () => ({
  getNoteIndexer: () => indexer,
}))

import {
  matchConceptExact,
  matchConceptSemantic,
  linkConceptsToNotes,
  getLearnerLinkCache,
  setLearnerLinkCache,
  invalidateLearnerLinkCache,
  clearLearnerLinkCache,
} from './learner-note-link'

/** 构造测试笔记 */
function note(path: string, title: string, tags: string[] = []) {
  return { path, title, tags }
}

const notes = [
  note('/vault/notes/费曼学习法.md', '费曼学习法', ['学习方法', '概念']),
  note('/vault/notes/间隔复习.md', '间隔复习', ['复习']),
  note('/vault/notes/原子笔记.md', '原子笔记', ['概念']),
]

function profile(conceptNames: string[]): LearnerProfile {
  return {
    known_concepts: conceptNames.map((name) => ({ name, confidence: 'medium' })),
    active_topics: [],
    total_sessions: 1,
    total_notes: 3,
  }
}

describe('matchConceptExact（精确匹配）', () => {
  it('概念名 == 笔记标题时命中', () => {
    expect(matchConceptExact('费曼学习法', notes)).toEqual(['/vault/notes/费曼学习法.md'])
  })

  it('概念名命中笔记 tags 时命中', () => {
    expect(matchConceptExact('复习', notes)).toEqual(['/vault/notes/间隔复习.md'])
  })

  it('忽略大小写与首尾空白', () => {
    expect(matchConceptExact('  费曼学习法 ', notes)).toEqual(['/vault/notes/费曼学习法.md'])
    expect(matchConceptExact('concept', [note('/a.md', 'Concept', ['x'])])).toEqual(['/a.md'])
  })

  it('无命中返回空数组', () => {
    expect(matchConceptExact('不存在的概念', notes)).toEqual([])
  })

  it('空白概念名返回空数组', () => {
    expect(matchConceptExact('   ', notes)).toEqual([])
  })
})

describe('matchConceptSemantic（语义匹配）', () => {
  beforeEach(() => {
    engine.isReady.mockReset().mockReturnValue(true)
    engine.embed.mockReset().mockResolvedValue([1, 0])
    indexer.getAllEntries.mockReset()
  })

  it('引擎未就绪时返回空数组，不发起嵌入', async () => {
    engine.isReady.mockReturnValue(false)
    indexer.getAllEntries.mockReturnValue([{ path: '/vault/notes/a.md', vector: [0.9, 0.1], indexedAt: 0 }])

    expect(await matchConceptSemantic('概念X', notes)).toEqual([])
    expect(engine.embed).not.toHaveBeenCalled()
  })

  it('无索引条目时返回空数组', async () => {
    expect(await matchConceptSemantic('概念X', notes)).toEqual([])
    expect(engine.embed).not.toHaveBeenCalled()
  })

  it('相似度 ≥ 阈值时命中并按相似度降序、截取 topK', async () => {
    indexer.getAllEntries.mockReturnValue([
      { path: '/vault/notes/间隔复习.md', vector: [0.95, 0.05], indexedAt: 0 },
      { path: '/vault/notes/原子笔记.md', vector: [0.6, 0.4], indexedAt: 0 },
      { path: '/vault/notes/费曼学习法.md', vector: [0.2, 0.8], indexedAt: 0 },
    ])

    const result = await matchConceptSemantic('概念X', notes, 2)

    expect(result).toEqual(['/vault/notes/间隔复习.md', '/vault/notes/原子笔记.md'])
  })

  it('相似度低于阈值（宁缺毋滥）时过滤', async () => {
    indexer.getAllEntries.mockReturnValue([
      { path: '/vault/notes/远.md', vector: [0.1, 0.9], indexedAt: 0 },
    ])

    expect(await matchConceptSemantic('概念X', notes, 3, 0.5)).toEqual([])
  })

  it('只返回入参 notes 中存在的路径（忽略索引陈旧条目）', async () => {
    indexer.getAllEntries.mockReturnValue([
      { path: '/vault/notes/不存在.md', vector: [0.9, 0.1], indexedAt: 0 },
      { path: '/vault/notes/费曼学习法.md', vector: [0.9, 0.1], indexedAt: 0 },
    ])

    const result = await matchConceptSemantic('费曼学习法', notes)

    expect(result).toEqual(['/vault/notes/费曼学习法.md'])
  })

  it('embedding 抛错时返回空数组（不阻塞）', async () => {
    indexer.getAllEntries.mockReturnValue([{ path: '/vault/notes/a.md', vector: [0.9, 0.1], indexedAt: 0 }])
    engine.embed.mockRejectedValue(new Error('engine error'))

    expect(await matchConceptSemantic('概念X', notes)).toEqual([])
  })
})

describe('linkConceptsToNotes（主入口）', () => {
  beforeEach(() => {
    engine.isReady.mockReset().mockReturnValue(true)
    engine.embed.mockReset().mockResolvedValue([1, 0])
    indexer.getAllEntries.mockReset()
  })

  it('精确 + 语义合并去重', async () => {
    indexer.getAllEntries.mockReturnValue([
      { path: '/vault/notes/费曼学习法.md', vector: [0.9, 0.1], indexedAt: 0 },
      // 语义命中但相似度低于阈值（宁缺毋滥），不并入
      { path: '/vault/notes/原子笔记.md', vector: [0.1, 0.9], indexedAt: 0 },
    ])

    const map = await linkConceptsToNotes(profile(['费曼学习法']), notes)

    // 费曼学习法：标题精确命中 + 语义重复命中，去重
    expect(map.get('费曼学习法')).toEqual(['/vault/notes/费曼学习法.md'])
  })

  it('语义关闭时仅精确匹配', async () => {
    indexer.getAllEntries.mockReturnValue([
      { path: '/vault/notes/原子笔记.md', vector: [0.9, 0.1], indexedAt: 0 },
    ])

    const map = await linkConceptsToNotes(profile(['原子笔记']), notes, { semantic: false })

    expect(map.get('原子笔记')).toEqual(['/vault/notes/原子笔记.md'])
    expect(engine.embed).not.toHaveBeenCalled()
  })

  it('无任何命中的概念不写入映射', async () => {
    indexer.getAllEntries.mockReturnValue([])
    const map = await linkConceptsToNotes(profile(['从未见过的概念']), notes, { semantic: false })

    expect(map.has('从未见过的概念')).toBe(false)
    expect(map.size).toBe(0)
  })

  it('语义命中低于阈值时降级为仅精确匹配结果', async () => {
    indexer.getAllEntries.mockReturnValue([
      { path: '/vault/notes/远.md', vector: [0.1, 0.9], indexedAt: 0 },
    ])

    const map = await linkConceptsToNotes(profile(['间隔复习']), notes, { threshold: 0.5 })

    expect(map.get('间隔复习')).toEqual(['/vault/notes/间隔复习.md'])
  })

  it('空画像返回空映射', async () => {
    const empty = profile([])
    const map = await linkConceptsToNotes(empty, notes)
    expect(map.size).toBe(0)
  })
})

describe('映射结果缓存', () => {
  beforeEach(() => {
    clearLearnerLinkCache()
  })

  it('set 后可读取，invalidate 后失效', () => {
    const map = new Map<string, string[]>()
    map.set('费曼学习法', ['/a.md'])
    setLearnerLinkCache('/vault', map)
    expect(getLearnerLinkCache('/vault')?.get('费曼学习法')).toEqual(['/a.md'])

    invalidateLearnerLinkCache('/vault')
    expect(getLearnerLinkCache('/vault')).toBeUndefined()
  })

  it('不同 vault 缓存互不影响', () => {
    const a = new Map<string, string[]>([['概念', ['/a.md']]])
    const b = new Map<string, string[]>([['概念', ['/b.md']]])
    setLearnerLinkCache('/vault-a', a)
    setLearnerLinkCache('/vault-b', b)
    expect(getLearnerLinkCache('/vault-a')?.get('概念')).toEqual(['/a.md'])
    expect(getLearnerLinkCache('/vault-b')?.get('概念')).toEqual(['/b.md'])
  })
})
