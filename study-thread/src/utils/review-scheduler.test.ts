import { describe, it, expect } from 'vitest'
import type { ReviewTask } from '../types'
import {
  REVIEW_INTERVALS,
  createReviewTask,
  applyRating,
  buildDueList,
  countDue,
  priorityOf,
  priorityWithProfile,
  summarizeReviewPerformance,
  getIntervals,
  isGraduationCandidate,
  reactivateTask,
  applyRatingWithAlgorithm,
  GRADUATION_MASTERY_THRESHOLD,
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

describe('applyRatingWithAlgorithm（P1 增强 FSRS 演进）', () => {
  it('classic（默认）与 applyRating 行为一致', () => {
    const classic = applyRatingWithAlgorithm(task({ interval: 3 }), 'good', NOW, 'classic')
    const base = applyRating(task({ interval: 3 }), 'good', NOW)
    expect(classic.interval).toBe(base.interval)
    expect(classic.mastery).toBe(base.mastery)
    expect(classic.history).toEqual(base.history)
  })

  it('缺省算法参数时走经典调度', () => {
    const updated = applyRatingWithAlgorithm(task({ interval: 3 }), 'good', NOW)
    expect(updated.interval).toBe(7)
  })

  it('fsrs 冷启动（历史不足）回退经典调度', () => {
    const fresh = task({ interval: 3 }) // history 为空
    const updated = applyRatingWithAlgorithm(fresh, 'good', NOW, 'fsrs')
    expect(updated.interval).toBe(7) // 经典 concept: 3 → 7
  })

  it('fsrs 历史足够时输出个性化间隔（good 历史间隔较长）', () => {
    const rated = task({
      interval: 14,
      history: [
        { at: '2026-08-01T00:00:00.000Z', rating: 'good' },
        { at: '2026-08-04T00:00:00.000Z', rating: 'good' },
      ],
    })
    const updated = applyRatingWithAlgorithm(rated, 'good', NOW, 'fsrs')
    // FSRS 基于 base=60 × (0.5+1.0) = 90 → 夹在 [1,365]，明显大于经典 good 的 30
    expect(updated.interval).toBeGreaterThan(30)
    expect(updated.history).toHaveLength(3)
  })

  it('fsrs 消极评级（again）间隔缩短且掌握度下降', () => {
    const rated = task({
      interval: 14,
      mastery: 0.8,
      history: [
        { at: '2026-08-01T00:00:00.000Z', rating: 'good' },
        { at: '2026-08-04T00:00:00.000Z', rating: 'good' },
      ],
    })
    const updated = applyRatingWithAlgorithm(rated, 'again', NOW, 'fsrs')
    expect(updated.mastery).toBeCloseTo(0.6)
    expect(updated.interval).toBeLessThanOrEqual(90) // 遗忘冲击减半
  })

  it('fsrs 路径同样触发毕业标记', () => {
    const rated = task({
      mastery: 0.8,
      history: [
        { at: '2026-08-01T00:00:00.000Z', rating: 'good' },
        { at: '2026-08-04T00:00:00.000Z', rating: 'good' },
      ],
    })
    const updated = applyRatingWithAlgorithm(rated, 'easy', NOW, 'fsrs')
    expect(updated.mastery).toBe(1)
    expect(updated.graduated).toBe(true)
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

describe('毕业机制（P1 增强）', () => {
  it('掌握度达标且连续 good/easy 达到次数即毕业', () => {
    const t = task({
      mastery: 1,
      history: [
        { at: '2026-08-01T00:00:00.000Z', rating: 'good' },
        { at: '2026-08-05T00:00:00.000Z', rating: 'easy' },
      ],
    })
    expect(isGraduationCandidate(t)).toBe(true)
  })

  it('掌握度未达阈值不毕业', () => {
    const t = task({
      mastery: GRADUATION_MASTERY_THRESHOLD - 0.01,
      history: [
        { at: '2026-08-01T00:00:00.000Z', rating: 'good' },
        { at: '2026-08-05T00:00:00.000Z', rating: 'good' },
      ],
    })
    expect(isGraduationCandidate(t)).toBe(false)
  })

  it('连续次数不足不毕业', () => {
    const t = task({
      mastery: 1,
      history: [{ at: '2026-08-01T00:00:00.000Z', rating: 'good' }],
    })
    expect(isGraduationCandidate(t)).toBe(false)
  })

  it('中间出现非 good/easy 评级则不满足连续条件', () => {
    const t = task({
      mastery: 1,
      history: [
        { at: '2026-08-01T00:00:00.000Z', rating: 'good' },
        { at: '2026-08-05T00:00:00.000Z', rating: 'hard' },
        { at: '2026-08-08T00:00:00.000Z', rating: 'easy' },
      ],
    })
    expect(isGraduationCandidate(t)).toBe(false)
  })

  it('applyRating 积极评级达标后自动标记毕业', () => {
    const t = task({
      mastery: 0.8,
      history: [
        { at: '2026-08-01T00:00:00.000Z', rating: 'good' },
        { at: '2026-08-05T00:00:00.000Z', rating: 'good' },
      ],
    })
    const updated = applyRating(t, 'easy', NOW) // mastery 0.8 → 1.0
    expect(updated.mastery).toBe(1)
    expect(updated.graduated).toBe(true)
  })

  it('applyRating 未达标时保持未毕业', () => {
    const t = task({ mastery: 0.6, history: [{ at: '2026-08-01T00:00:00.000Z', rating: 'good' }] })
    const updated = applyRating(t, 'good', NOW) // mastery 0.8，连续 1 次不足
    expect(updated.graduated).toBeFalsy()
  })

  it('again/hard 清除毕业标记回到活跃队列', () => {
    const t = task({ mastery: 1, graduated: true, history: [] })
    const again = applyRating(t, 'again', NOW)
    expect(again.graduated).toBe(false)
    const hard = applyRating(t, 'hard', NOW)
    expect(hard.graduated).toBe(false)
  })

  it('已毕业任务移出到期清单，但仍在队列可重新激活', () => {
    const graduated = task({ notePath: 'notes/毕业.md', mastery: 1, graduated: true, dueAt: '2026-08-01T00:00:00.000Z' })
    const due = task({ notePath: 'notes/到期.md', mastery: 0.4, dueAt: '2026-08-08T00:00:00.000Z' })
    expect(buildDueList([graduated, due], NOW).map((t) => t.notePath)).toEqual(['notes/到期.md'])
    expect(countDue([graduated, due], NOW)).toBe(1)
  })

  it('reactivateTask 清除毕业标记并立即到期', () => {
    const graduated = task({ graduated: true, dueAt: '2026-01-01T00:00:00.000Z' })
    const reactivated = reactivateTask(graduated, NOW)
    expect(reactivated.graduated).toBe(false)
    expect(reactivated.dueAt).toBe(NOW.toISOString())
    expect(buildDueList([reactivated], NOW)).toHaveLength(1)
  })

  it('持久化字段兼容：旧队列无 graduated 字段时行为不变', () => {
    const legacy = task({ dueAt: '2026-08-08T00:00:00.000Z' })
    expect('graduated' in legacy).toBe(false)
    expect(buildDueList([legacy], NOW)).toHaveLength(1)
    expect(isGraduationCandidate(legacy)).toBe(false)
  })
})

describe('priorityWithProfile（P3-3 画像提权）', () => {
  it('提权笔记优先级提升一档（更优先）', () => {
    const t = task({ mastery: 0.9, type: 'fact' })
    const boosted = new Set(['notes/测试.md'])
    expect(priorityOf(t)).toBe(5)
    expect(priorityWithProfile(t, boosted)).toBe(4)
  })

  it('非提权笔记优先级不变', () => {
    const t = task({ mastery: 0.9, type: 'fact' })
    expect(priorityWithProfile(t, new Set(['notes/其他.md']))).toBe(priorityOf(t))
  })

  it('null 提权集合时行为与 priorityOf 一致', () => {
    const t = task({ mastery: 0.9, type: 'fact' })
    expect(priorityWithProfile(t, null)).toBe(priorityOf(t))
  })

  it('优先级不低于 0', () => {
    const t = task({ mastery: 0.2 }) // 基础优先级 0
    expect(priorityWithProfile(t, new Set(['notes/测试.md']))).toBe(0)
  })
})

describe('buildDueList 画像提权排序', () => {
  it('画像弱项笔记在同等条件下排到前面', () => {
    // 同为高掌握度的 fact 笔记（优先级 5），画像弱项笔记被提升到 4
    const weak = task({ notePath: 'notes/弱项.md', mastery: 0.9, type: 'fact', dueAt: '2026-08-08T06:00:00.000Z' })
    const normal = task({ notePath: 'notes/普通.md', mastery: 0.9, type: 'fact', dueAt: '2026-08-08T05:00:00.000Z' })

    const boosted = new Set(['notes/弱项.md'])
    const due = buildDueList([normal, weak], NOW, boosted)
    expect(due.map((t) => t.notePath)).toEqual(['notes/弱项.md', 'notes/普通.md'])
  })

  it('不传提权集合时排序与原来一致', () => {
    const weak = task({ notePath: 'notes/弱项.md', mastery: 0.9, type: 'fact', dueAt: '2026-08-08T06:00:00.000Z' })
    const normal = task({ notePath: 'notes/普通.md', mastery: 0.9, type: 'fact', dueAt: '2026-08-08T05:00:00.000Z' })

    const due = buildDueList([weak, normal], NOW)
    // 同优先级按到期时间先后：普通(05:00) 先于 弱项(06:00)
    expect(due.map((t) => t.notePath)).toEqual(['notes/普通.md', 'notes/弱项.md'])
  })
})

describe('summarizeReviewPerformance（P3-5 复习表现序列化）', () => {
  it('按最近 windowSize 次评级汇总分布与掌握度', () => {
    const rated = task({
      notePath: 'notes/费曼.md',
      title: '费曼学习法',
      mastery: 0.8,
      history: [
        { at: '2026-08-01T00:00:00.000Z', rating: 'again' },
        { at: '2026-08-04T00:00:00.000Z', rating: 'good' },
        { at: '2026-08-07T00:00:00.000Z', rating: 'good' },
      ],
    })

    const text = summarizeReviewPerformance([rated], ['notes/费曼.md'])

    expect(text).toContain('费曼学习法')
    expect(text).toContain('近 3 次评级')
    expect(text).toContain('again × 1')
    expect(text).toContain('good × 2')
    expect(text).toContain('掌握度 80%')
  })

  it('超过 windowSize 的评级只取最近 N 次', () => {
    const rated = task({
      notePath: 'notes/a.md',
      title: '笔记A',
      history: Array.from({ length: 8 }, (_, i) => ({
        at: `2026-08-0${i + 1}T00:00:00.000Z`,
        rating: (i % 2 === 0 ? 'good' : 'easy') as ReviewTask['history'][number]['rating'],
      })),
    })

    const text = summarizeReviewPerformance([rated], ['notes/a.md'], 3)
    expect(text).toContain('近 3 次评级')
    expect(text).toContain('easy × 2')
    expect(text).toContain('good × 1')
  })

  it('无复习记录的笔记被忽略，全部无记录时返回空字符串', () => {
    const fresh = task({ notePath: 'notes/新.md', title: '新笔记', history: [] })
    const text = summarizeReviewPerformance([fresh], ['notes/新.md'])
    expect(text).toBe('')
  })

  it('路径未命中的笔记被忽略', () => {
    const rated = task({
      notePath: 'notes/a.md',
      title: '笔记A',
      history: [{ at: '2026-08-01T00:00:00.000Z', rating: 'good' }],
    })
    const text = summarizeReviewPerformance([rated], ['notes/其他.md'])
    expect(text).toBe('')
  })
})
