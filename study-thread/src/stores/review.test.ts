import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useReviewStore } from './review'
import type { ReviewTask } from '../types'

const { vaultFs, loadProfile, link, collectWeak } = vi.hoisted(() => ({
  vaultFs: { readFile: vi.fn(), writeFile: vi.fn(), createDir: vi.fn() },
  loadProfile: vi.fn(),
  link: vi.fn(),
  collectWeak: vi.fn(),
}))

vi.mock('../utils/vault-fs', () => vaultFs)
vi.mock('../utils/learner-profile', () => ({ loadLearnerProfile: loadProfile }))
vi.mock('../utils/learner-note-link', () => ({
  linkConceptsToNotes: link,
  collectWeakNotePaths: collectWeak,
  invalidateLearnerLinkCache: vi.fn(),
}))

const QUEUE: ReviewTask[] = [
  {
    notePath: '/vault/notes/a.md',
    title: '笔记A',
    type: 'concept',
    dueAt: '2026-08-07T00:00:00.000Z',
    interval: 1,
    mastery: 0.2,
    history: [],
  },
]

function queueFile(): string {
  return JSON.stringify({ version: 1, queue: QUEUE })
}

describe('review store（P3-3 画像提权信号）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.clearAllMocks()
    vaultFs.readFile.mockResolvedValue(queueFile())
    vaultFs.writeFile.mockResolvedValue(undefined)
    vaultFs.createDir.mockResolvedValue(undefined)
  })

  it('loadQueue 加载队列并计算画像弱项提权路径', async () => {
    const store = useReviewStore()
    loadProfile.mockResolvedValue({
      known_concepts: [{ name: '概念X', confidence: 'low' }],
      active_topics: [],
      total_sessions: 1,
      total_notes: 1,
    })
    link.mockResolvedValue(new Map([['概念X', ['/vault/notes/a.md']]]))
    collectWeak.mockReturnValue(new Set(['/vault/notes/a.md']))

    await store.loadQueue('/vault')

    expect(store.queue).toEqual(QUEUE)
    expect(store.boostedNotePaths).toEqual(['/vault/notes/a.md'])
    expect(link).toHaveBeenCalled()
  })

  it('无画像（加载失败）时提权路径置空，队列不受影响', async () => {
    const store = useReviewStore()
    loadProfile.mockRejectedValue(new Error('ENOENT'))

    await store.loadQueue('/vault')

    expect(store.queue).toEqual(QUEUE)
    expect(store.boostedNotePaths).toEqual([])
  })

  it('映射或提权提取失败时提权路径置空', async () => {
    const store = useReviewStore()
    loadProfile.mockResolvedValue({ known_concepts: [], active_topics: [], total_sessions: 0, total_notes: 0 })
    link.mockRejectedValue(new Error('engine error'))

    await store.loadQueue('/vault')

    expect(store.queue).toEqual(QUEUE)
    expect(store.boostedNotePaths).toEqual([])
  })

  it('refreshBoostedPaths 可单独重新计算（笔记/画像变更后）', async () => {
    const store = useReviewStore()
    loadProfile.mockResolvedValue({
      known_concepts: [{ name: '概念Y', confidence: 'medium' }],
      active_topics: [],
      total_sessions: 1,
      total_notes: 1,
    })
    link.mockResolvedValue(new Map([['概念Y', ['/vault/notes/b.md']]]))
    collectWeak.mockReturnValue(new Set(['/vault/notes/b.md']))

    await store.refreshBoostedPaths('/vault')

    expect(store.boostedNotePaths).toEqual(['/vault/notes/b.md'])
  })
})

describe('review store（P1 增强 毕业机制）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.clearAllMocks()
    vaultFs.writeFile.mockResolvedValue(undefined)
    vaultFs.createDir.mockResolvedValue(undefined)
  })

  it('graduatedTasks 只包含已毕业任务，且移出到期清单', async () => {
    const store = useReviewStore()
    const graduated = { ...QUEUE[0], notePath: '/vault/notes/g.md', graduated: true }
    vaultFs.readFile.mockResolvedValue(JSON.stringify({ version: 1, queue: [graduated] }))

    await store.loadQueue('/vault')

    expect(store.graduatedTasks.map((t) => t.notePath)).toEqual(['/vault/notes/g.md'])
    expect(store.dueTasks).toHaveLength(0)
    expect(store.dueCount).toBe(0)
  })

  it('reactivate 清除毕业标记并立即回到到期清单', async () => {
    const store = useReviewStore()
    const graduated = { ...QUEUE[0], graduated: true, dueAt: '2026-01-01T00:00:00.000Z' }
    vaultFs.readFile.mockResolvedValue(JSON.stringify({ version: 1, queue: [graduated] }))

    await store.loadQueue('/vault')
    await store.reactivate('/vault/notes/a.md')

    expect(store.queue[0].graduated).toBe(false)
    expect(store.graduatedTasks).toHaveLength(0)
    expect(store.dueTasks.map((t) => t.notePath)).toContain('/vault/notes/a.md')
  })

  it('reactivate 未命中任务时返回 null 且不改变队列', async () => {
    const store = useReviewStore()
    vaultFs.readFile.mockResolvedValue(queueFile())

    await store.loadQueue('/vault')
    const result = await store.reactivate('/vault/notes/不存在.md')

    expect(result).toBeNull()
    expect(store.queue).toHaveLength(1)
  })

  it('applyReview 达标后自动标记毕业', async () => {
    const store = useReviewStore()
    const rated = {
      ...QUEUE[0],
      mastery: 0.8,
      history: [
        { at: '2026-08-01T00:00:00.000Z', rating: 'good' as const },
        { at: '2026-08-05T00:00:00.000Z', rating: 'good' as const },
      ],
    }
    vaultFs.readFile.mockResolvedValue(JSON.stringify({ version: 1, queue: [rated] }))

    await store.loadQueue('/vault')
    await store.applyReview('/vault/notes/a.md', 'easy', new Date('2026-08-08T12:00:00.000Z'))

    expect(store.queue[0].mastery).toBe(1)
    expect(store.queue[0].graduated).toBe(true)
    expect(store.graduatedTasks).toHaveLength(1)
  })
})
