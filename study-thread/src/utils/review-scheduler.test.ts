import { describe, it, expect } from 'vitest'
import type { ReviewTask } from '../types'
import {
  REVIEW_INTERVALS,
  createReviewTask,
  applyRating,
  buildDueList,
  countDue,
  priorityOf,
  getIntervals,
} from './review-scheduler'

const NOW = new Date('2026-08-08T12:00:00.000Z')

function task(partial: Partial<ReviewTask> = {}): ReviewTask {
  return {
    notePath: 'notes/测试.md',
    title: '测试笔记',
    type: 'concept',
    dueAt: '2026-08-08T00:00:00.000Z',
    interval: 1,
    mastery: 0.2,
    history: [],
    ...partial,
  }
}

describe('getIntervals', () => {
  it('按类型返回差异化间隔序列', () => {
    expect(REVIEW_INTERVALS.concept).toEqual([1, 3, 7, 14, 30, 60])
    expect(REVIEW_INTERVALS.method).toEqual([1, 3, 7, 14, 30])
    expect(REVIEW_INTERVALS.fact).toEqual([2, 5, 10, 20])
    expect(REVIEW_INTERVALS.question).toEqual([1, 2, 5, 10])
  })

  it('未知类型回退默认间隔序列', () => {
    expect(getIntervals('unknown')).toEqual([1, 3, 7, 14, 30, 60])
  })
})

describe('createReviewTask', () => {
  it('新笔记间隔为 0、次日到期、掌握度为 0', () => {
    const created = createReviewTask('notes/费曼.md', '费曼学习法', 'concept', NOW)
    expect(created.interval).toBe(0)
    expect(created.mastery).toBe(0)
    expect(created.history).toEqual([])
    // 次日同一时刻到期
    expect(new Date(created.dueAt).getTime()).toBe(new Date('2026-08-09T12:00:00.000Z').getTime())
  })
})

describe('applyRating', () => {
  it('good 将间隔向前推进一档并提升掌握度', () => {
    const updated = applyRating(task({ interval: 3 }), 'good', NOW)
    expect(updated.interval).toBe(7) // concept: [1,3,7,14,30,60] 中 3 → 7
    expect(updated.mastery).toBeCloseTo(0.4)
    expect(updated.history).toHaveLength(1)
    expect(updated.history[0].rating).toBe('good')
    expect(new Date(updated.dueAt).getTime()).toBe(new Date('2026-08-15T12:00:00.000Z').getTime())
  })

  it('easy 前进两档，again 回退两档', () => {
    expect(applyRating(task({ interval: 7 }), 'easy', NOW).interval).toBe(30) // 7 → 30
    expect(applyRating(task({ interval: 7 }), 'again', NOW).interval).toBe(1) // 7 → 1
  })

  it('间隔推进夹在序列边界内', () => {
    const againFromFirst = applyRating(task({ interval: 1 }), 'again', NOW)
    expect(againFromFirst.interval).toBe(1) // 1 - 2 档 → 下限 1
    const easyFromLast = applyRating(task({ interval: 60 }), 'easy', NOW)
    expect(easyFromLast.interval).toBe(60) // 60 + 2 档 → 上限 60
  })

  it('hard 保持当前档位', () => {
    const updated = applyRating(task({ interval: 14 }), 'hard', NOW)
    expect(updated.interval).toBe(14)
    expect(updated.mastery).toBe(0.2) // hard 不改变掌握度
  })

  it('掌握度夹在 [0, 1] 区间', () => {
    expect(applyRating(task({ mastery: 0.1 }), 'again', NOW).mastery).toBe(0)
    expect(applyRating(task({ mastery: 0.9 }), 'easy', NOW).mastery).toBe(1)
  })

  it('未知类型的间隔按默认序列推进', () => {
    const updated = applyRating(task({ type: 'unknown', interval: 3 }), 'good', NOW)
    expect(updated.interval).toBe(7)
  })
})

describe('priorityOf', () => {
  it('低掌握度最优先', () => {
    expect(priorityOf(task({ mastery: 0.2 }))).toBe(0)
  })

  it('上次答错或中等掌握度次之', () => {
    expect(priorityOf(task({ mastery: 0.4 }))).toBe(1)
    expect(priorityOf(task({ mastery: 0.7, history: [{ at: NOW.toISOString(), rating: 'again' }] }))).toBe(1)
  })

  it('掌握度高的概念笔记优先于事实笔记', () => {
    expect(priorityOf(task({ mastery: 0.9, type: 'concept' }))).toBeLessThan(priorityOf(task({ mastery: 0.9, type: 'fact' })))
  })
})

describe('buildDueList / countDue', () => {
  it('仅返回已到期任务，按优先级升序、同优先级按到期时间先后', () => {
    const lowMasteryDue = task({ notePath: 'notes/低掌握.md', mastery: 0.2, dueAt: '2026-08-07T00:00:00.000Z' })
    const highMasteryDue = task({ notePath: 'notes/高掌握.md', mastery: 0.9, dueAt: '2026-08-08T06:00:00.000Z' })
    const notDue = task({ notePath: 'notes/未到期.md', dueAt: '2026-08-10T00:00:00.000Z' })

    const due = buildDueList([notDue, highMasteryDue, lowMasteryDue], NOW)
    expect(due.map((t) => t.notePath)).toEqual(['notes/低掌握.md', 'notes/高掌握.md'])
    expect(countDue([notDue, highMasteryDue, lowMasteryDue], NOW)).toBe(2)
  })

  it('无到期任务时返回空列表', () => {
    expect(buildDueList([task({ dueAt: '2026-08-12T00:00:00.000Z' })], NOW)).toEqual([])
    expect(countDue([], NOW)).toBe(0)
  })
})
