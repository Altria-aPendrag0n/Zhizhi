import { describe, expect, it } from 'vitest'
import type { ReviewTask } from '../types'
import {
  describeDifficultyContext,
  difficultyBandFromMastery,
  estimateNoteDifficulty,
  MASTERY_HIGH_THRESHOLD,
  MASTERY_LOW_THRESHOLD,
  MASTERY_MEDIUM_THRESHOLD,
  noteDifficultyBandFromLength,
} from './review-difficulty'

function makeTask(partial: Partial<ReviewTask>): ReviewTask {
  return {
    notePath: 'notes/x.md',
    title: 'x',
    type: 'concept',
    dueAt: '2026-08-10T00:00:00.000Z',
    interval: 3,
    mastery: 0,
    history: [],
    ...partial,
  }
}

describe('difficultyBandFromMastery', () => {
  it('阈值边界映射（0.3 / 0.6 / 0.9）', () => {
    expect(difficultyBandFromMastery(0)).toBe('low')
    expect(difficultyBandFromMastery(MASTERY_LOW_THRESHOLD - 0.01)).toBe('low')
    expect(difficultyBandFromMastery(MASTERY_LOW_THRESHOLD)).toBe('medium')
    expect(difficultyBandFromMastery(0.59)).toBe('medium')
    expect(difficultyBandFromMastery(MASTERY_MEDIUM_THRESHOLD)).toBe('high')
    expect(difficultyBandFromMastery(0.89)).toBe('high')
    expect(difficultyBandFromMastery(MASTERY_HIGH_THRESHOLD)).toBe('graduate')
    expect(difficultyBandFromMastery(1)).toBe('graduate')
  })
})

describe('describeDifficultyContext（classic）', () => {
  it('输出掌握度、档位与间隔序列档位', () => {
    const text = describeDifficultyContext(makeTask({ mastery: 0.25, interval: 3 }), 'classic')
    expect(text).toContain('卡片掌握度 25%')
    expect(text).toContain('低档位')
    expect(text).toContain('间隔 3 天')
    expect(text).toContain('concept 类型序列 [1,3,7,14,30,60]')
  })

  it('间隔处于序列后半段时建议补识别题校验遗忘', () => {
    const text = describeDifficultyContext(makeTask({ mastery: 0.5, interval: 30 }), 'classic')
    expect(text).toContain('间隔位于序列后半段')
    expect(text).toContain('识别题')
  })

  it('间隔不在序列中时定位到第一个不小于的档位', () => {
    // concept 序列 [1,3,7,14,30,60]，interval=5 → 命中第 3 档（7）
    const text = describeDifficultyContext(makeTask({ mastery: 0.5, interval: 5 }), 'classic')
    expect(text).toContain('第 3 档')
  })
})

describe('describeDifficultyContext（fsrs）', () => {
  it('输出掌握度、表现分与波动', () => {
    const task = makeTask({
      mastery: 0.75,
      history: [
        { at: '2026-08-01T00:00:00.000Z', rating: 'good' },
        { at: '2026-08-05T00:00:00.000Z', rating: 'easy' },
      ],
    })
    const text = describeDifficultyContext(task, 'fsrs')
    expect(text).toContain('卡片掌握度 75%')
    expect(text).toContain('加权表现分')
    expect(text).toContain('评级波动')
  })

  it('无历史时表现分与波动为 0（冷启动）', () => {
    const text = describeDifficultyContext(makeTask({ mastery: 0.1 }), 'fsrs')
    expect(text).toContain('表现分 0.0')
    expect(text).toContain('波动 0.00')
  })
})

describe('noteDifficultyBandFromLength / estimateNoteDifficulty', () => {
  it('按长度阈值分档（400 / 1500）', () => {
    expect(noteDifficultyBandFromLength(0)).toBe('low')
    expect(noteDifficultyBandFromLength(399)).toBe('low')
    expect(noteDifficultyBandFromLength(400)).toBe('medium')
    expect(noteDifficultyBandFromLength(1499)).toBe('medium')
    expect(noteDifficultyBandFromLength(1500)).toBe('high')
  })

  it('method / question 类型按 1.5 倍加权', () => {
    expect(estimateNoteDifficulty({ content: 'x'.repeat(100), type: 'fact' })).toBe('low')
    expect(estimateNoteDifficulty({ content: 'x'.repeat(500), type: 'method' })).toBe('medium')
    expect(estimateNoteDifficulty({ content: 'x'.repeat(1200), type: 'question' })).toBe('high')
  })

  it('concept / fact 类型不加权', () => {
    expect(estimateNoteDifficulty({ content: 'x'.repeat(500), type: 'concept' })).toBe('medium')
    expect(estimateNoteDifficulty({ content: 'x'.repeat(1200), type: 'fact' })).toBe('medium')
  })
})

describe('describeDifficultyContext 笔记内容难度注入', () => {
  it('传入笔记内容难度时输出对应中文标签', () => {
    const text = describeDifficultyContext(makeTask({ mastery: 0.25, interval: 3 }), 'classic', 'medium')
    expect(text).toContain('笔记内容难度 中等')
  })

  it('未传笔记内容难度时不输出该标签（向后兼容）', () => {
    const text = describeDifficultyContext(makeTask({ mastery: 0.25, interval: 3 }), 'classic')
    expect(text).not.toContain('笔记内容难度')
  })
})
