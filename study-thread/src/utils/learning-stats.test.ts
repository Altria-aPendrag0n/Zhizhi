import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  toDateKey,
  parseDateKey,
  extractUserMessageDates,
  extractSessionQaDates,
  extractReviewDates,
  extractNoteDates,
  aggregateDailyCounts,
  summarizeStats,
  collectLearningStats,
} from './learning-stats'

const { vaultFs } = vi.hoisted(() => ({
  vaultFs: { readFile: vi.fn(), listDir: vi.fn() },
}))

vi.mock('./vault-fs', () => vaultFs)

const SESSION_CONTENT = `---
session_id: sess_1
title: 测试会话
created: 2026-08-05T10:00:00.000Z
---

## 用户

第一个问题

## 知枝

回答一

## 用户 · 2026-08-06T09:00:00.000Z

第二个问题

## 知枝

回答二
`

describe('日期键', () => {
  it('toDateKey 使用本地时区 YYYY-MM-DD', () => {
    // 本地时区下的固定日期（避免 UTC 偏移：new Date(2026, 7, 9) 为本地 8 月 9 日）
    expect(toDateKey(new Date(2026, 7, 9, 12, 0, 0))).toBe('2026-08-09')
    expect(toDateKey(new Date(2026, 0, 1, 0, 0, 0))).toBe('2026-01-01')
  })

  it('parseDateKey 解析 ISO 字符串，非法值返回 null', () => {
    expect(parseDateKey('2026-08-09T08:56:25.648Z')).toBe('2026-08-09')
    expect(parseDateKey('2026-08-09T08:56:25.648+08:00')).toBe('2026-08-09')
    expect(parseDateKey('')).toBeNull()
    expect(parseDateKey('not-a-date')).toBeNull()
  })
})

describe('extractUserMessageDates', () => {
  it('带时间戳的消息按各自日期统计', () => {
    const body = `## 用户 · 2026-08-01T08:00:00.000Z\n问题1\n\n## 知枝\n回答\n\n## 用户 · 2026-08-03T08:00:00.000Z\n问题2`
    expect(extractUserMessageDates(body)).toEqual(['2026-08-01', '2026-08-03'])
  })

  it('无时间戳的消息回退到 fallbackDate', () => {
    const body = `## 用户\n问题1\n\n## 知枝\n回答\n\n## 用户\n问题2`
    expect(extractUserMessageDates(body, '2026-08-05T10:00:00.000Z')).toEqual(['2026-08-05', '2026-08-05'])
  })

  it('无时间戳且无 fallback 时该消息不计入', () => {
    const body = `## 用户\n问题1`
    expect(extractUserMessageDates(body)).toEqual([])
  })

  it('混合时间戳与无时间戳消息，各走各的口径', () => {
    const body = `## 用户\n问题1\n\n## 用户 · 2026-08-06T09:00:00.000Z\n问题2`
    expect(extractUserMessageDates(body, '2026-08-05T10:00:00.000Z')).toEqual(['2026-08-05', '2026-08-06'])
  })

  it('不会误匹配「## 用户」开头的正文段落', () => {
    const body = `## 用户\n请解释\n\n正文中也有 ## 用户提到的概念，不应匹配\n\n## 知枝\n回答`
    expect(extractUserMessageDates(body, '2026-08-05T10:00:00.000Z')).toEqual(['2026-08-05'])
  })
})

describe('extractSessionQaDates', () => {
  it('从完整会话文件提取，无时间戳消息回退 frontmatter created', () => {
    expect(extractSessionQaDates(SESSION_CONTENT)).toEqual(['2026-08-05', '2026-08-06'])
  })

  it('frontmatter 缺失 created 时仅保留带时间戳的消息', () => {
    const content = `---\ntitle: x\n---\n\n## 用户\n问题\n\n## 用户 · 2026-08-06T09:00:00.000Z\n问题2`
    expect(extractSessionQaDates(content)).toEqual(['2026-08-06'])
  })
})

describe('extractReviewDates', () => {
  it('提取每次评级记录日期', () => {
    const state = {
      version: 1,
      queue: [
        { notePath: 'a.md', history: [{ at: '2026-08-01T08:00:00.000Z', rating: 'good' }, { at: '2026-08-07T08:00:00.000Z', rating: 'easy' }] },
        { notePath: 'b.md', history: [{ at: '2026-08-01T09:00:00.000Z', rating: 'again' }] },
      ],
    }
    expect(extractReviewDates(state)).toEqual(['2026-08-01', '2026-08-07', '2026-08-01'])
  })

  it('结构缺失/损坏/空 history 时返回空数组', () => {
    expect(extractReviewDates(null)).toEqual([])
    expect(extractReviewDates({})).toEqual([])
    expect(extractReviewDates({ queue: 'not-array' })).toEqual([])
    expect(extractReviewDates({ queue: [{ history: [] }] })).toEqual([])
  })

  it('跳过非法 at 时间', () => {
    const state = { queue: [{ history: [{ at: 'bad-date', rating: 'good' }, { at: '', rating: 'good' }] }] }
    expect(extractReviewDates(state)).toEqual([])
  })
})

describe('extractNoteDates', () => {
  it('按每篇笔记 created 计一次', () => {
    const notes = [
      { path: 'a.md', title: 'a', type: 'concept', tags: [], created: '2026-08-01T08:00:00.000Z', updated: '2026-08-01T08:00:00.000Z' },
      { path: 'b.md', title: 'b', type: 'concept', tags: [], created: '2026-08-01T09:00:00.000Z', updated: '2026-08-01T09:00:00.000Z' },
      { path: 'c.md', title: 'c', type: 'concept', tags: [], created: '2026-08-03T08:00:00.000Z', updated: '2026-08-03T08:00:00.000Z' },
    ]
    expect(extractNoteDates(notes)).toEqual(['2026-08-01', '2026-08-01', '2026-08-03'])
  })
})

describe('aggregateDailyCounts', () => {
  it('同一天合并三类次数，不同字段独立', () => {
    const map = aggregateDailyCounts({
      qa: ['2026-08-01', '2026-08-01', '2026-08-02'],
      review: ['2026-08-01'],
      note: ['2026-08-02'],
    })
    expect(map.get('2026-08-01')).toEqual({ qa: 2, review: 1, note: 0 })
    expect(map.get('2026-08-02')).toEqual({ qa: 1, review: 0, note: 1 })
    expect(map.size).toBe(2)
  })
})

describe('summarizeStats', () => {
  it('统计总数、天数与连续学习天数（今天有学习）', () => {
    const daily = aggregateDailyCounts({
      qa: ['2026-08-07', '2026-08-08', '2026-08-09'],
      review: ['2026-08-09'],
      note: ['2026-08-08'],
    })
    const stats = summarizeStats(daily, new Date(2026, 7, 9, 12, 0, 0)) // 2026-08-09 本地
    expect(stats.totalQa).toBe(3)
    expect(stats.totalReview).toBe(1)
    expect(stats.totalNote).toBe(1)
    expect(stats.totalDays).toBe(3)
    expect(stats.streakDays).toBe(3)
  })

  it('今天未学习时从昨天起算连续天数', () => {
    const daily = aggregateDailyCounts({ qa: ['2026-08-08'], review: [], note: [] })
    const stats = summarizeStats(daily, new Date(2026, 7, 9, 12, 0, 0))
    expect(stats.streakDays).toBe(1)
  })

  it('连续中断后重新计数', () => {
    const daily = aggregateDailyCounts({ qa: ['2026-08-05', '2026-08-09'], review: [], note: [] })
    const stats = summarizeStats(daily, new Date(2026, 7, 9, 12, 0, 0))
    expect(stats.streakDays).toBe(1)
  })

  it('空数据时连续天数为 0', () => {
    const stats = summarizeStats(new Map(), new Date(2026, 7, 9, 12, 0, 0))
    expect(stats.streakDays).toBe(0)
    expect(stats.totalDays).toBe(0)
  })
})

describe('collectLearningStats（vault 聚合）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('聚合三类数据源并按天合并', async () => {
    vaultFs.listDir.mockImplementation(async (path: string) => {
      if (path.includes('sessions')) {
        return [
          { name: 'sess1.md', path: `${path}/sess1.md`, is_dir: false },
          { name: 'branch_1.md', path: `${path}/branch_1.md`, is_dir: false },
          { name: 'review-1.md', path: `${path}/review-1.md`, is_dir: false }, // 复习会话不计入问答
        ]
      }
      return [] // notes 由 noteMetas 提供，不触发目录扫描
    })
    vaultFs.readFile.mockImplementation(async (path: string) => {
      if (path.includes('sess1.md')) return SESSION_CONTENT // 08-05, 08-06 各一次
      if (path.includes('branch_1.md')) return `---\ncreated: 2026-08-06T10:00:00.000Z\n---\n\n## 用户\n追问` // 08-06
      if (path.includes('review-state.json')) return JSON.stringify({
        version: 1,
        queue: [{ notePath: 'a.md', history: [{ at: '2026-08-06T12:00:00.000Z', rating: 'good' }] }],
      })
      return ''
    })

    const stats = await collectLearningStats('/vault', [
      { path: 'a.md', title: 'a', type: 'concept', tags: [], created: '2026-08-07T08:00:00.000Z', updated: '2026-08-07T08:00:00.000Z' },
    ])

    // 08-05: qa1 | 08-06: qa2+review1 | 08-07: note1
    expect(stats.totalQa).toBe(3)
    expect(stats.totalReview).toBe(1)
    expect(stats.totalNote).toBe(1)
    expect(stats.totalDays).toBe(3)
    expect(stats.daily.get('2026-08-06')).toEqual({ qa: 2, review: 1, note: 0 })
    // 复习会话文件不计入问答
    expect(vaultFs.readFile).not.toHaveBeenCalledWith(expect.stringContaining('review-1.md'))
  })

  it('sessions 目录缺失或读取失败时静默返回空', async () => {
    vaultFs.listDir.mockRejectedValue(new Error('ENOENT'))
    vaultFs.readFile.mockRejectedValue(new Error('ENOENT'))
    const stats = await collectLearningStats('/vault', [])
    expect(stats.totalDays).toBe(0)
    expect(stats.totalQa).toBe(0)
  })
})
