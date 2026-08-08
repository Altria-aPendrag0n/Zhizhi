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
