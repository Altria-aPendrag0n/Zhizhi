import { describe, it, expect } from 'vitest'
import type { ReviewTask } from '../types'
import {
  estimatePerformance,
  estimateDifficulty,
  computeFsrsInterval,
  FSRS_MIN_HISTORY,
  FSRS_MAX_INTERVAL,
} from './fsrs-scheduler'

function task(history: ReviewTask['history'], partial: Partial<ReviewTask> = {}): ReviewTask {
  return {
    notePath: 'notes/测试.md',
    title: '测试笔记',
    type: 'concept',
    dueAt: '2026-08-08T00:00:00.000Z',
    interval: 1,
    mastery: 0.5,
    history,
    ...partial,
  }
}

const GOOD_GOOD: ReviewTask['history'] = [
  { at: '2026-08-01T00:00:00.000Z', rating: 'good' },
  { at: '2026-08-04T00:00:00.000Z', rating: 'good' },
]

describe('estimatePerformance（FSRS 表现分拟合）', () => {
  it('全 good 表现分等于 good 得分', () => {
    expect(estimatePerformance(GOOD_GOOD)).toBe(1)
  })

  it('越近的评级权重越高（加权平均）', () => {
    const mixed = [
      { at: '2026-08-01T00:00:00.000Z', rating: 'again' as const }, // 0 × 1
      { at: '2026-08-04T00:00:00.000Z', rating: 'easy' as const }, // 1.5 × 2
    ]
    expect(estimatePerformance(mixed)).toBeCloseTo(1)
  })

  it('无历史返回 0', () => {
    expect(estimatePerformance([])).toBe(0)
  })

  it('超过窗口大小的历史只取最近 N 次', () => {
    const long: ReviewTask['history'] = Array.from({ length: 8 }, () => ({
      at: '2026-08-01T00:00:00.000Z',
      rating: 'easy' as const,
    }))
    expect(estimatePerformance(long, 3)).toBe(1.5)
  })
})

describe('estimateDifficulty（评级波动 → 难度）', () => {
  it('稳定序列难度为 0', () => {
    expect(estimateDifficulty(GOOD_GOOD)).toBe(0)
  })

  it('波动序列难度大于 0（忽高忽低不稳定）', () => {
    const volatile = [
      { at: '2026-08-01T00:00:00.000Z', rating: 'again' as const },
      { at: '2026-08-04T00:00:00.000Z', rating: 'easy' as const },
    ]
    expect(estimateDifficulty(volatile)).toBeGreaterThan(0)
  })

  it('少于 2 条历史返回 0', () => {
    expect(estimateDifficulty([{ at: '2026-08-01T00:00:00.000Z', rating: 'good' }])).toBe(0)
  })
})

describe('computeFsrsInterval（FSRS 间隔计算）', () => {
  const BASE = 60 // concept 经典序列最大值

  it('冷启动（历史不足）返回 null，由调用方回退经典调度', () => {
    expect(computeFsrsInterval(task([{ at: '2026-08-01T00:00:00.000Z', rating: 'good' }]), 'good', BASE)).toBeNull()
    expect(computeFsrsInterval(task([]), 'good', BASE)).toBeNull()
    expect(FSRS_MIN_HISTORY).toBe(2)
  })

  it('良好历史（连续 good/easy）得到较长间隔', () => {
    const stable = task([
      { at: '2026-08-01T00:00:00.000Z', rating: 'good' },
      { at: '2026-08-04T00:00:00.000Z', rating: 'easy' },
    ])
    const interval = computeFsrsInterval(stable, 'good', BASE)
    expect(interval).not.toBeNull()
    expect(interval!).toBeGreaterThan(10)
  })

  it('本次 again 触发遗忘冲击，间隔减半', () => {
    const goodThenGood = computeFsrsInterval(task(GOOD_GOOD), 'good', BASE)
    const goodThenAgain = computeFsrsInterval(task(GOOD_GOOD), 'again', BASE)
    expect(goodThenAgain).not.toBeNull()
    expect(goodThenAgain!).toBeLessThan(goodThenGood!)
  })

  it('波动历史（难度高）间隔被压缩', () => {
    const stable = task(GOOD_GOOD)
    const volatile = task([
      { at: '2026-08-01T00:00:00.000Z', rating: 'again' },
      { at: '2026-08-04T00:00:00.000Z', rating: 'easy' },
      { at: '2026-08-07T00:00:00.000Z', rating: 'again' },
      { at: '2026-08-10T00:00:00.000Z', rating: 'easy' },
    ])
    const stableInterval = computeFsrsInterval(stable, 'good', BASE)
    const volatileInterval = computeFsrsInterval(volatile, 'good', BASE)
    expect(volatileInterval).not.toBeNull()
    expect(volatileInterval!).toBeLessThan(stableInterval!)
  })

  it('间隔夹在 [FSRS_MIN_INTERVAL, FSRS_MAX_INTERVAL]', () => {
    const poor = task([
      { at: '2026-08-01T00:00:00.000Z', rating: 'again' },
      { at: '2026-08-04T00:00:00.000Z', rating: 'again' },
    ])
    const interval = computeFsrsInterval(poor, 'again', BASE)
    expect(interval).not.toBeNull()
    expect(interval!).toBeGreaterThanOrEqual(1)
    expect(interval!).toBeLessThanOrEqual(FSRS_MAX_INTERVAL)
  })
})
