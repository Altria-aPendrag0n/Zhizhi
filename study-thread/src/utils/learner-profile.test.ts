import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { ProfileDiff } from '../api/skills/update-learner'
import {
  learnerProfilePath,
  emptyLearnerProfile,
  loadLearnerProfile,
  serializeLearnerProfile,
  saveLearnerProfile,
  applyProfileDiff,
  type LearnerProfile,
} from './learner-profile'
import { parseFrontmatter } from '../parser/frontmatter'

const readFile = vi.hoisted(() => vi.fn())
const writeFile = vi.hoisted(() => vi.fn())
const createDir = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('../utils/vault-fs', () => ({ readFile, writeFile, createDir }))

const profile: LearnerProfile = {
  known_concepts: [
    { name: '费曼学习法', confidence: 'medium', last_session: '2026-08-01' },
    { name: '工作记忆', confidence: 'high', last_session: '2026-07-28' },
  ],
  active_topics: ['认知科学导论'],
  total_sessions: 3,
  total_notes: 5,
  preferred_depth: 'deep',
  preferred_style: 'socratic',
}

describe('learnerProfilePath / emptyLearnerProfile', () => {
  it('画像路径位于 .study-thread 下', () => {
    expect(learnerProfilePath('/vault')).toBe('/vault/.study-thread/learner.md')
  })

  it('空画像默认值', () => {
    const empty = emptyLearnerProfile()
    expect(empty.known_concepts).toEqual([])
    expect(empty.total_sessions).toBe(0)
    expect(empty.total_notes).toBe(0)
  })
})

describe('serializeLearnerProfile / loadLearnerProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('序列化 frontmatter 可 round-trip 解析', () => {
    const markdown = serializeLearnerProfile(profile)
    const { meta } = parseFrontmatter(markdown) as { meta: Record<string, unknown> }
    expect(meta.total_sessions).toBe(3)
    const known = meta.known_concepts as Array<{ name: string }>
    expect(known).toHaveLength(2)
    expect(known[0].name).toBe('费曼学习法')
  })

  it('loadLearnerProfile 解析文件内容', async () => {
    readFile.mockResolvedValue(serializeLearnerProfile(profile))
    const loaded = await loadLearnerProfile('/vault')
    expect(loaded).toEqual(profile)
  })

  it('文件缺失时返回空画像', async () => {
    readFile.mockRejectedValue(new Error('ENOENT'))
    const loaded = await loadLearnerProfile('/vault')
    expect(loaded).toEqual(emptyLearnerProfile())
  })

  it('saveLearnerProfile 写入 .study-thread 目录', async () => {
    await saveLearnerProfile('/vault', profile)
    expect(createDir).toHaveBeenCalledWith('/vault/.study-thread')
    expect(writeFile).toHaveBeenCalledWith('/vault/.study-thread/learner.md', expect.stringContaining('total_sessions: 3'))
  })
})

describe('applyProfileDiff', () => {
  const diff: ProfileDiff = {
    added_concepts: [{ name: '间隔重复', confidence: 'low', description: '刚接触' }],
    updated_concepts: [{ name: '费曼学习法', old_confidence: 'medium', new_confidence: 'high', change_description: '能独立解释' }],
    removed_concepts: [{ name: '工作记忆', reason: '未再提及' }],
    suggested_topics: [{ topic: '认知科学导论', reason: '薄弱环节' }, { topic: '记忆研究', reason: '延伸' }],
    summary: '更新',
  }

  it('应用新增/更新/移除概念与建议主题，total_sessions 自增', () => {
    const result = applyProfileDiff(profile, diff, 8)
    expect(result.total_sessions).toBe(4)
    expect(result.total_notes).toBe(8)

    const names = result.known_concepts.map((c) => c.name)
    expect(names).toContain('间隔重复')
    expect(names).not.toContain('工作记忆')

    const feynman = result.known_concepts.find((c) => c.name === '费曼学习法')
    expect(feynman?.confidence).toBe('high')
    expect(feynman?.last_session).toBeTruthy()

    expect(result.active_topics).toContain('记忆研究')
    expect(result.active_topics).toContain('认知科学导论') // 去重保留
  })

  it('updated 目标不存在时按新增处理', () => {
    const diffOnlyUpdate: ProfileDiff = {
      added_concepts: [],
      updated_concepts: [{ name: '全新概念', old_confidence: 'low', new_confidence: 'medium' }],
      removed_concepts: [],
      suggested_topics: [],
      summary: '',
    }
    const result = applyProfileDiff(profile, diffOnlyUpdate, 5)
    expect(result.known_concepts.map((c) => c.name)).toContain('全新概念')
  })
})
