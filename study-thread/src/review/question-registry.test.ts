import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MAX_ROUNDS,
  dedupeQuestions,
  formatQuestionForDisplay,
  normalizeQuizQuestion,
  questionSimilarity,
  serializeAnswer,
  shouldEndDebate,
} from './question-registry'

describe('normalizeQuizQuestion', () => {
  it('choice：透传 options', () => {
    const q = normalizeQuizQuestion({
      level: 'recognize',
      type: 'choice',
      question: '费曼学习法的核心是什么？',
      options: ['向他人解释', '死记硬背', '题海战术', '刷视频'],
    })
    expect(q).toEqual({
      level: 'recognize',
      type: 'choice',
      question: '费曼学习法的核心是什么？',
      options: ['向他人解释', '死记硬背', '题海战术', '刷视频'],
    })
  })

  it('确定答案题型透传 answer（标准答案，P5-6）', () => {
    const q = normalizeQuizQuestion({
      level: 'recognize',
      type: 'choice',
      question: '费曼学习法的核心是什么？',
      options: ['向他人解释', '死记硬背'],
      answer: '向他人解释',
    })
    expect(q?.answer).toBe('向他人解释')
  })

  it('answer 为空串或纯空白时忽略', () => {
    const q = normalizeQuizQuestion({ level: 'recognize', type: 'choice', question: '费曼学习法的核心是什么？', options: ['A', 'B'], answer: '  ' })
    expect(q?.answer).toBeUndefined()
  })

  it('scenario 透传并去除首尾空白（情景题，题型仍为六类之一）', () => {
    const q = normalizeQuizQuestion({
      level: 'apply',
      type: 'short_answer',
      question: '你该如何优化点单流程？',
      scenario: '  你是一家咖啡店店长，需要优化点单流程  ',
    })
    expect(q?.scenario).toBe('你是一家咖啡店店长，需要优化点单流程')
  })

  it('scenario 为空串或纯空白时忽略', () => {
    const q = normalizeQuizQuestion({ level: 'apply', type: 'short_answer', question: '你该如何优化点单流程？', scenario: '   ' })
    expect(q?.scenario).toBeUndefined()
  })

  it('非辩论题题干去除空白后过短（粗制滥造）时丢弃', () => {
    expect(normalizeQuizQuestion({ level: 'recognize', type: 'short_answer', question: '是什么？' })).toBeNull()
  })

  it('辩论题允许极短题干（辩题内容由 position 承载，豁免最短长度约束）', () => {
    const q = normalizeQuizQuestion({ level: 'explain', type: 'debate', question: '辩题', position: '支持' })
    expect(q?.type).toBe('debate')
  })

  it('ordering：透传 steps', () => {
    const q = normalizeQuizQuestion({
      level: 'apply',
      type: 'ordering',
      question: '按正确顺序排列费曼学习法步骤',
      steps: ['向他人解释', '找出缺口', '复习补缺', '简化表达'],
    })
    expect(q?.type).toBe('ordering')
    expect(q?.steps).toEqual(['向他人解释', '找出缺口', '复习补缺', '简化表达'])
  })

  it('fill_blank：blanks 缺省时补默认 1', () => {
    const q = normalizeQuizQuestion({ level: 'recognize', type: 'fill_blank', question: '费曼法通过____暴露缺口' })
    expect(q?.type).toBe('fill_blank')
    expect(q?.blanks).toBe(1)
  })

  it('fill_blank：blanks 非法值回落默认 1', () => {
    const q = normalizeQuizQuestion({ level: 'recognize', type: 'fill_blank', question: '____与____', blanks: 0 })
    expect(q?.blanks).toBe(1)
  })

  it('debate：透传 position，maxRounds 缺省补默认 3', () => {
    const q = normalizeQuizQuestion({
      level: 'explain',
      type: 'debate',
      question: '辩题：死记硬背毫无价值',
      position: '反对该观点',
    })
    expect(q?.type).toBe('debate')
    expect(q?.position).toBe('反对该观点')
    expect(q?.maxRounds).toBe(DEFAULT_MAX_ROUNDS)
  })

  it('debate：maxRounds 显式指定时保留', () => {
    const q = normalizeQuizQuestion({
      level: 'explain',
      type: 'debate',
      question: '辩题',
      maxRounds: 5,
    })
    expect(q?.maxRounds).toBe(5)
  })

  it('type 缺省降级为 short_answer（旧模型响应兼容）', () => {
    const q = normalizeQuizQuestion({ level: 'recognize', question: '什么是费曼学习法？' })
    expect(q?.type).toBe('short_answer')
  })

  it('type 未知降级为 short_answer（可拓展性：未知题型不中断会话）', () => {
    const q = normalizeQuizQuestion({ level: 'apply', type: 'matching', question: '未来题型？' })
    expect(q?.type).toBe('short_answer')
  })

  it('level 非法时丢弃该题（返回 null）', () => {
    expect(normalizeQuizQuestion({ level: 'remember', type: 'choice', question: 'x', options: ['a', 'b'] })).toBeNull()
  })

  it('question 缺失时丢弃', () => {
    expect(normalizeQuizQuestion({ level: 'recognize', type: 'choice', options: ['a', 'b'] })).toBeNull()
  })

  it('一问一答：题干含多个疑问句标记（复合问句）时丢弃（P5-6）', () => {
    const q = normalizeQuizQuestion({ level: 'recognize', type: 'short_answer', question: '什么是 X？它有什么好处？' })
    expect(q).toBeNull()
  })

  it('单个问号的正常题干保留', () => {
    const q = normalizeQuizQuestion({ level: 'recognize', type: 'short_answer', question: '费曼学习法的核心是什么？' })
    expect(q?.type).toBe('short_answer')
  })

  it('choice options 少于 2 时丢弃（防猜率下限）', () => {
    expect(
      normalizeQuizQuestion({ level: 'recognize', type: 'choice', question: 'x', options: ['a'] }),
    ).toBeNull()
  })

  it('ordering steps 少于 2 时丢弃', () => {
    expect(normalizeQuizQuestion({ level: 'apply', type: 'ordering', question: 'x', steps: ['a'] })).toBeNull()
  })

  it('非对象输入返回 null', () => {
    expect(normalizeQuizQuestion(null)).toBeNull()
    expect(normalizeQuizQuestion('str')).toBeNull()
  })
})

describe('formatQuestionForDisplay', () => {
  it('普通题不携带情景标签', () => {
    const text = formatQuestionForDisplay({ level: 'recognize', type: 'short_answer', question: '什么是费曼学习法？' })
    expect(text).toBe('[简答题] 什么是费曼学习法？')
  })

  it('情景题以「情景·题型」标签并追加情景行', () => {
    const text = formatQuestionForDisplay({
      level: 'apply',
      type: 'short_answer',
      question: '你该如何优化点单流程？',
      scenario: '你是一家咖啡店店长，需要优化点单流程',
    })
    expect(text).toContain('[情景·简答题]')
    expect(text).toContain('\n情景：你是一家咖啡店店长，需要优化点单流程')
  })
})

describe('serializeAnswer', () => {
  it('choice：输出所选字母与文本', () => {
    expect(serializeAnswer('choice', { index: 1, text: '向他人解释' })).toBe('我选择 B：向他人解释')
  })

  it('true_false：输出对/错', () => {
    expect(serializeAnswer('true_false', true)).toBe('我的判断：正确')
    expect(serializeAnswer('true_false', false)).toBe('我的判断：错误')
  })

  it('fill_blank：输出填空内容', () => {
    expect(serializeAnswer('fill_blank', '向他人解释；复习补缺')).toBe('我的填空：向他人解释；复习补缺')
  })

  it('ordering：输出重排后的完整步骤文本', () => {
    const text = serializeAnswer('ordering', ['向他人解释', '找出缺口'])
    expect(text).toBe('我认为顺序是：\n1. 向他人解释\n2. 找出缺口')
  })

  it('short_answer / debate：原文透传', () => {
    expect(serializeAnswer('short_answer', '因为教别人能暴露缺口')).toBe('因为教别人能暴露缺口')
    expect(serializeAnswer('debate', '我同意')).toBe('我同意')
  })
})

describe('shouldEndDebate', () => {
  it('非 debate 题型始终视为结束（不进入辩论流程）', () => {
    expect(shouldEndDebate('short_answer', 0)).toBe(true)
  })

  it('debate 未达轮次继续，达到轮次结束', () => {
    expect(shouldEndDebate('debate', 0, 3)).toBe(false)
    expect(shouldEndDebate('debate', 1, 3)).toBe(false)
    expect(shouldEndDebate('debate', 2, 3)).toBe(false)
    expect(shouldEndDebate('debate', 3, 3)).toBe(true)
  })

  it('debate maxRounds 缺省用默认 3', () => {
    expect(shouldEndDebate('debate', 2)).toBe(false)
    expect(shouldEndDebate('debate', 3)).toBe(true)
  })
})

describe('questionSimilarity / dedupeQuestions', () => {
  it('相同题干相似度为 1', () => {
    expect(questionSimilarity('费曼学习法的核心是什么？', '费曼学习法的核心是什么？')).toBe(1)
  })

  it('仅标点差异的题干视为高度相似', () => {
    expect(questionSimilarity('费曼学习法的核心是什么', '费曼学习法的核心是什么？')).toBeGreaterThanOrEqual(0.85)
  })

  it('无关题干相似度低', () => {
    expect(questionSimilarity('费曼学习法的核心是什么？', '排序算法的复杂度如何计算？')).toBeLessThan(0.85)
  })

  it('去重保留先出现者，剔除近似重复题', () => {
    const base = { level: 'recognize' as const, type: 'short_answer' as const }
    const kept = dedupeQuestions([
      { ...base, question: '费曼学习法的核心是什么？' },
      { ...base, question: '费曼学习法的核心是什么' },
      { ...base, question: '排序算法的复杂度如何计算？' },
    ])
    expect(kept.map((q) => q.question)).toEqual(['费曼学习法的核心是什么？', '排序算法的复杂度如何计算？'])
  })
})
