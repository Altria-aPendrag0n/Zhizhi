import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Note, ReviewQuestion } from '../types'
import { serializeSession } from './session-serializer'
import { parseFrontmatter } from '../parser/frontmatter'
import { parseMessages } from './branch-context'

const readFile = vi.hoisted(() => vi.fn())
const listDir = vi.hoisted(() => vi.fn())
vi.mock('../utils/vault-fs', () => ({ readFile, listDir }))

import {
  createReviewSession,
  buildReviewRelatedNotes,
  loadReviewSession,
  getReviewSessionFilePath,
  findIncompleteReviewSession,
  listReviewSessions,
  listOngoingReviewNotePaths,
} from './review-session'

const note: Note = {
  path: 'notes/费曼学习法.md',
  title: '费曼学习法',
  description: '用教别人来检验自己是否真正理解',
  type: 'concept',
  tags: ['学习方法', '元认知'],
  created: '2026-08-01T00:00:00.000Z',
  updated: '2026-08-01T00:00:00.000Z',
  confidence: 0.5,
  review: { next: null, interval: 0, mastery: 0 },
  content: '费曼学习法通过向他人解释来暴露知识缺口。参见 [[工作记忆]]。',
}

const questions: ReviewQuestion[] = [
  {
    level: 'recognize',
    type: 'choice',
    question: '什么是费曼学习法？',
    options: ['教学相长', '死记硬背', '题海战术', '闭门造车'],
  },
  { level: 'explain', type: 'short_answer', question: '为什么费曼法能暴露知识缺口？' },
]

function makeNote(partial: Partial<Note>): Note {
  return {
    ...note,
    path: 'notes/其他.md',
    title: '其他笔记',
    tags: [],
    content: '',
    ...partial,
  }
}

describe('createReviewSession', () => {
  it('创建独立复习会话：kind=review + reviewed_note + 首条问题消息', () => {
    const now = new Date('2026-08-10T08:00:00.000Z')
    const session = createReviewSession(note, questions, now)

    expect(session.kind).toBe('review')
    expect(session.reviewed_note).toBe('notes/费曼学习法.md')
    expect(session.title).toBe('复习：费曼学习法')
    expect(session.id).toMatch(/^review_/)
    expect(session.parent_session).toBeNull()
    expect(session.tags).toContain('复习')
    expect(session.messages).toHaveLength(1)
    expect(session.messages[0].content).toContain('## 复习目标\n费曼学习法')
    // 首条消息不再列出全部问题（避免"一次回答全部"误解），仅提示逐题作答
    expect(session.messages[0].content).toContain('共 2 道题')
    expect(session.messages[0].content).not.toContain('1. 什么是费曼学习法？')
  })
})

describe('序列化 round-trip', () => {
  it('serializeSession 输出 kind/reviewed_note/review_questions 到 frontmatter', () => {
    const session = createReviewSession(note, questions)
    const markdown = serializeSession(session)
    const { meta } = parseFrontmatter(markdown)

    expect(meta.kind).toBe('review')
    expect(meta.reviewed_note).toBe('notes/费曼学习法.md')
    expect(meta.review_questions).toEqual(questions)
  })

  it('review_completed 标记序列化到 frontmatter（完成复习后保留会话）', () => {
    const session = createReviewSession(note, questions)
    session.review_completed = true
    const { meta } = parseFrontmatter(serializeSession(session))
    expect(meta.review_completed).toBe(true)

    // 未完成时不输出该字段
    const pending = createReviewSession(note, questions)
    const pendingMeta = parseFrontmatter(serializeSession(pending)).meta
    expect(pendingMeta.review_completed).toBeUndefined()
  })

  it('正文消息可解析 round-trip', () => {
    const session = createReviewSession(note, questions)
    const markdown = serializeSession(session)
    const { body } = parseFrontmatter(markdown)
    const messages = parseMessages(body, Number.MAX_SAFE_INTEGER)

    expect(messages).toHaveLength(1)
    expect(messages[0].role).toBe('assistant')
    expect(messages[0].content).toContain('共 2 道题')
  })
})

describe('loadReviewSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('解析复习会话文件并恢复 kind/reviewed_note/questions/消息', async () => {
    const session = createReviewSession(note, questions)
    readFile.mockResolvedValue(serializeSession(session))

    const loaded = await loadReviewSession('/vault', session.id)

    expect(loaded).not.toBeNull()
    expect(loaded!.kind).toBe('review')
    expect(loaded!.reviewed_note).toBe('notes/费曼学习法.md')
    expect(loaded!.review_questions).toEqual(questions)
    expect(loaded!.messages).toHaveLength(1)
  })

  it('文件缺失时返回 null', async () => {
    readFile.mockRejectedValue(new Error('ENOENT'))
    const loaded = await loadReviewSession('/vault', 'review_1')
    expect(loaded).toBeNull()
  })

  it('解析 review_completed 标记（完成复习后保留的会话）', async () => {
    const session = createReviewSession(note, questions)
    session.review_completed = true
    readFile.mockResolvedValue(serializeSession(session))
    const loaded = await loadReviewSession('/vault', session.id)
    expect(loaded!.review_completed).toBe(true)

    const pending = createReviewSession(note, questions)
    readFile.mockResolvedValue(serializeSession(pending))
    const loadedPending = await loadReviewSession('/vault', pending.id)
    expect(loadedPending!.review_completed).toBe(false)
  })

  it('旧会话（无 type）的问题加载后降级为 short_answer（P5 兼容）', async () => {
    const raw = [
      '---',
      'kind: review',
      'reviewed_note: notes/费曼学习法.md',
      'review_questions:',
      '  - level: recognize',
      '    question: 旧题',
      '---',
      '正文内容',
    ].join('\n')
    readFile.mockResolvedValue(raw)
    const loaded = await loadReviewSession('/vault', 'review_legacy')
    expect(loaded).not.toBeNull()
    expect(loaded!.review_questions).toHaveLength(1)
    expect(loaded!.review_questions![0].type).toBe('short_answer')
    expect(loaded!.review_questions![0].question).toBe('旧题')
  })

  it('文件路径使用 review- 前缀', () => {
    expect(getReviewSessionFilePath('/vault', 'review_123')).toBe('/vault/sessions/review-review_123.md')
  })
})

describe('findIncompleteReviewSession（复用进行中的复习会话）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('同一笔记存在多个复习会话时返回最新创建的一个', async () => {
    const older = createReviewSession(note, questions, new Date('2026-08-09T08:00:00.000Z'))
    const newer = createReviewSession(note, questions, new Date('2026-08-10T08:00:00.000Z'))
    listDir.mockResolvedValue([
      { name: `review-${older.id}.md`, path: `/vault/sessions/review-${older.id}.md`, is_dir: false },
      { name: `review-${newer.id}.md`, path: `/vault/sessions/review-${newer.id}.md`, is_dir: false },
      { name: 'new_1.md', path: '/vault/sessions/new_1.md', is_dir: false }, // 非 review 文件应被忽略
    ])
    readFile.mockImplementation((path: string) => {
      if (path.includes(older.id)) return Promise.resolve(serializeSession(older))
      if (path.includes(newer.id)) return Promise.resolve(serializeSession(newer))
      return Promise.reject(new Error('ENOENT'))
    })

    const id = await findIncompleteReviewSession('/vault', 'notes/费曼学习法.md')
    expect(id).toBe(newer.id)
  })

  it('正/反斜杠路径视为同一笔记', async () => {
    const target = createReviewSession(note, questions)
    listDir.mockResolvedValue([
      { name: `review-${target.id}.md`, path: `/vault/sessions/review-${target.id}.md`, is_dir: false },
    ])
    readFile.mockResolvedValue(serializeSession(target))

    // 查询路径用反斜杠，会话 frontmatter 存正斜杠 → 应命中
    const id = await findIncompleteReviewSession('/vault', 'notes\\费曼学习法.md')
    expect(id).toBe(target.id)
  })

  it('无匹配时返回 null', async () => {
    listDir.mockResolvedValue([])
    expect(await findIncompleteReviewSession('/vault', 'notes/费曼学习法.md')).toBeNull()
  })

  it('sessions 目录读取失败时返回 null，不抛错', async () => {
    listDir.mockRejectedValue(new Error('ENOENT'))
    expect(await findIncompleteReviewSession('/vault', 'notes/费曼学习法.md')).toBeNull()
  })

  it('损坏的 review 文件跳过，不影响其他匹配', async () => {
    const target = createReviewSession(note, questions)
    listDir.mockResolvedValue([
      { name: `review-${target.id}.md`, path: `/vault/sessions/review-${target.id}.md`, is_dir: false },
      { name: 'review-broken.md', path: '/vault/sessions/review-broken.md', is_dir: false },
    ])
    readFile.mockImplementation((path: string) => {
      if (path.includes('broken')) return Promise.reject(new Error('corrupt'))
      return Promise.resolve(serializeSession(target))
    })

    const id = await findIncompleteReviewSession('/vault', 'notes/费曼学习法.md')
    expect(id).toBe(target.id)
  })

  it('已完成（review_completed）的会话不再复用，返回 null（下次到期重新出题）', async () => {
    const done = createReviewSession(note, questions)
    done.review_completed = true
    listDir.mockResolvedValue([
      { name: `review-${done.id}.md`, path: `/vault/sessions/review-${done.id}.md`, is_dir: false },
    ])
    readFile.mockResolvedValue(serializeSession(done))

    expect(await findIncompleteReviewSession('/vault', 'notes/费曼学习法.md')).toBeNull()
  })
})

describe('listReviewSessions（资源库「复习会话」列表）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('列出全部复习会话并按创建时间倒序', async () => {
    const older = createReviewSession(note, questions, new Date('2026-08-09T08:00:00.000Z'))
    const newer = createReviewSession(note, questions, new Date('2026-08-10T08:00:00.000Z'))
    newer.review_completed = true
    listDir.mockResolvedValue([
      { name: `review-${older.id}.md`, path: `/vault/sessions/review-${older.id}.md`, is_dir: false },
      { name: `review-${newer.id}.md`, path: `/vault/sessions/review-${newer.id}.md`, is_dir: false },
      { name: 'new_1.md', path: '/vault/sessions/new_1.md', is_dir: false }, // 非 review 文件忽略
      { name: 'notes', path: '/vault/sessions/notes', is_dir: true }, // 目录忽略
    ])
    readFile.mockImplementation((path: string) => {
      if (path.includes(older.id)) return Promise.resolve(serializeSession(older))
      return Promise.resolve(serializeSession(newer))
    })

    const sessions = await listReviewSessions('/vault')
    expect(sessions.map((s) => s.id)).toEqual([newer.id, older.id])
    expect(sessions[0].completed).toBe(true)
    expect(sessions[0].questionCount).toBe(2)
    expect(sessions[0].reviewedNote).toBe('notes/费曼学习法.md')
    expect(sessions[1].completed).toBe(false)
  })

  it('sessions 目录不存在或读取失败时返回空数组', async () => {
    listDir.mockRejectedValue(new Error('ENOENT'))
    expect(await listReviewSessions('/vault')).toEqual([])
  })

  it('损坏的 review 文件跳过，不影响列表', async () => {
    const target = createReviewSession(note, questions)
    listDir.mockResolvedValue([
      { name: `review-${target.id}.md`, path: `/vault/sessions/review-${target.id}.md`, is_dir: false },
      { name: 'review-broken.md', path: '/vault/sessions/review-broken.md', is_dir: false },
    ])
    readFile.mockImplementation((path: string) => {
      if (path.includes('broken')) return Promise.reject(new Error('corrupt'))
      return Promise.resolve(serializeSession(target))
    })

    const sessions = await listReviewSessions('/vault')
    expect(sessions).toHaveLength(1)
    expect(sessions[0].id).toBe(target.id)
  })
})

describe('listOngoingReviewNotePaths（「继续复习」按钮依据）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('收集有未完成会话的笔记路径（跳过已完成与目录）', async () => {
    const ongoing = createReviewSession(note, questions, new Date('2026-08-10T08:00:00.000Z'))
    const done = createReviewSession(note, questions, new Date('2026-08-10T09:00:00.000Z'))
    done.review_completed = true
    listDir.mockResolvedValue([
      { name: `review-${ongoing.id}.md`, path: `/vault/sessions/review-${ongoing.id}.md`, is_dir: false },
      { name: `review-${done.id}.md`, path: `/vault/sessions/review-${done.id}.md`, is_dir: false },
      { name: 'sub', path: '/vault/sessions/sub', is_dir: true },
    ])
    readFile.mockImplementation((path: string) => {
      if (path.includes(done.id)) return Promise.resolve(serializeSession(done))
      return Promise.resolve(serializeSession(ongoing))
    })

    const paths = await listOngoingReviewNotePaths('/vault')
    expect(paths).toEqual(['notes/费曼学习法.md'])
  })

  it('路径按规范化键返回（分隔符归一 + 小写），供跨分隔符匹配', async () => {
    const upper = createReviewSession(makeNote({ path: 'Notes/虾的分类.md', title: '虾的分类' }), questions)
    listDir.mockResolvedValue([
      { name: `review-${upper.id}.md`, path: `/vault/sessions/review-${upper.id}.md`, is_dir: false },
    ])
    readFile.mockResolvedValue(serializeSession(upper))

    const paths = await listOngoingReviewNotePaths('/vault')
    expect(paths).toEqual(['notes/虾的分类.md'])
  })

  it('sessions 目录缺失时返回空数组', async () => {
    listDir.mockRejectedValue(new Error('ENOENT'))
    expect(await listOngoingReviewNotePaths('/vault')).toEqual([])
  })
})

describe('buildReviewRelatedNotes', () => {
  it('优先 wikilink 目标笔记', () => {
    const linked = makeNote({ path: 'notes/工作记忆.md', title: '工作记忆' })
    const unrelated = makeNote({ path: 'notes/无关.md', title: '无关', tags: ['编程'] })
    const result = buildReviewRelatedNotes(note, [unrelated, linked])

    expect(result.map((n) => n.title)).toEqual(['工作记忆'])
  })

  it('无 wikilink 时按同标签补充，并排除自身', () => {
    const tagged = makeNote({ path: 'notes/间隔重复.md', title: '间隔重复', tags: ['学习方法'] })
    const result = buildReviewRelatedNotes(note, [note, tagged])

    expect(result.map((n) => n.title)).toEqual(['间隔重复'])
  })

  it('超过上限时截断', () => {
    const others = Array.from({ length: 6 }, (_, i) =>
      makeNote({ path: `notes/笔记${i}.md`, title: `笔记${i}`, tags: ['学习方法'] }),
    )
    const result = buildReviewRelatedNotes(note, others)
    expect(result).toHaveLength(4)
  })

  it('无任何关联时返回空数组', () => {
    const unrelated = makeNote({ path: 'notes/无关.md', title: '无关', tags: ['编程'] })
    expect(buildReviewRelatedNotes(note, [unrelated])).toEqual([])
  })
})
