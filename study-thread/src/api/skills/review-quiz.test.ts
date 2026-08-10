import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LLMProvider, StreamChunk } from '../llm-provider'
import type { Note, ReviewQuestion } from '../../types'
import type { LearnerProfile } from '../../utils/learner-profile'
import {
  generateReviewQuestions,
  reviewFollowupStream,
  reviewDebateStream,
  serializeNoteForReview,
  shouldSuggestGraduation,
  generateClusterQuestions,
  serializeClusterNotes,
  serializeClusterRelations,
  GRADUATION_MASTERY_THRESHOLD,
} from './review-quiz'

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
  content: '费曼学习法的核心不是把知识讲得简单，而是通过向他人解释来暴露自己解释中的跳步。',
}

const relatedNote: Note = {
  ...note,
  path: 'notes/工作记忆.md',
  title: '工作记忆',
  content: '工作记忆容量有限，约 4 个组块。',
}

const QUIZ_JSON =
  '{"questions":[' +
  '{"level":"recognize","question":"什么是费曼学习法？"},' +
  '{"level":"apply","question":"如何用费曼法检验自己是否理解？"},' +
  '{"level":"explain","question":"为什么费曼法能暴露解释中的跳步？"}' +
  ']}'

function mockProvider(yieldChunks: StreamChunk[]) {
  const chat = vi.fn(async function* () {
    for (const chunk of yieldChunks) yield chunk
  })
  return { chat } as unknown as LLMProvider & { chat: ReturnType<typeof vi.fn> }
}

function lastChatArgs(provider: ReturnType<typeof mockProvider>) {
  return provider.chat.mock.calls[provider.chat.mock.calls.length - 1][1] as { systemPrompt: string }
}

describe('serializeNoteForReview', () => {
  it('包含标题/描述/类型/标签与正文', () => {
    const text = serializeNoteForReview(note)
    expect(text).toContain('标题: 费曼学习法')
    expect(text).toContain('描述: 用教别人来检验自己是否真正理解')
    expect(text).toContain('类型: concept')
    expect(text).toContain('标签: 学习方法, 元认知')
    expect(text).toContain('费曼学习法的核心不是把知识讲得简单')
  })

  it('正文超出上限时截断', () => {
    const longNote = { ...note, content: 'x'.repeat(6000) }
    const text = serializeNoteForReview(longNote)
    expect(text).toHaveLength(text.length) // 不抛异常
    expect(text).toContain('x'.repeat(4000))
    expect(text).not.toContain('x'.repeat(4001))
  })
})

describe('generateReviewQuestions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('正确解析 LLM 出题 JSON 并返回递进问题', async () => {
    const provider = mockProvider([{ type: 'text', content: QUIZ_JSON }])
    const questions = await generateReviewQuestions(note, [], provider)

    // LLM 响应未带 type（旧格式）时逐题降级为 short_answer（P5 兼容），level/question 原样保留
    expect(questions).toEqual([
      { level: 'recognize', type: 'short_answer', question: '什么是费曼学习法？' },
      { level: 'apply', type: 'short_answer', question: '如何用费曼法检验自己是否理解？' },
      { level: 'explain', type: 'short_answer', question: '为什么费曼法能暴露解释中的跳步？' },
    ])
  })

  it('LLM 响应带题型字段时透传（choice options / ordering steps / debate position）', async () => {
    const typedJson = JSON.stringify({
      questions: [
        { level: 'recognize', type: 'choice', question: '费曼法的核心是什么？', options: ['向他人解释', '死记硬背', '题海战术', '闭卷考试'] },
        { level: 'apply', type: 'ordering', question: '排出正确步骤', steps: ['a', 'b', 'c'] },
        { level: 'explain', type: 'debate', question: '辩题', position: '我方观点', maxRounds: 4 },
      ],
    })
    const provider = mockProvider([{ type: 'text', content: typedJson }])
    const questions = await generateReviewQuestions(note, [], provider)

    expect(questions).toEqual([
      { level: 'recognize', type: 'choice', question: '费曼法的核心是什么？', options: ['向他人解释', '死记硬背', '题海战术', '闭卷考试'] },
      { level: 'apply', type: 'ordering', question: '排出正确步骤', steps: ['a', 'b', 'c'] },
      { level: 'explain', type: 'debate', question: '辩题', position: '我方观点', maxRounds: 4 },
    ])
  })

  it('systemPrompt 注入笔记内容与关联笔记', async () => {
    const provider = mockProvider([{ type: 'text', content: QUIZ_JSON }])
    await generateReviewQuestions(note, [relatedNote], provider)

    const { systemPrompt } = lastChatArgs(provider)
    expect(systemPrompt).toContain('标题: 费曼学习法')
    expect(systemPrompt).toContain('费曼学习法的核心不是把知识讲得简单')
    expect(systemPrompt).toContain('### 工作记忆')
  })

  it('无关联笔记时注入占位文案', async () => {
    const provider = mockProvider([{ type: 'text', content: QUIZ_JSON }])
    await generateReviewQuestions(note, [], provider)

    const { systemPrompt } = lastChatArgs(provider)
    expect(systemPrompt).toContain('（无关联笔记）')
  })

  it('学习者画像为空时注入默认文案', async () => {
    const provider = mockProvider([{ type: 'text', content: QUIZ_JSON }])
    await generateReviewQuestions(note, [], provider)

    const { systemPrompt } = lastChatArgs(provider)
    expect(systemPrompt).toContain('（暂无学习者画像，按默认难度出题）')
  })

  it('学习者画像非空时原样注入', async () => {
    const provider = mockProvider([{ type: 'text', content: QUIZ_JSON }])
    await generateReviewQuestions(note, [], provider, 'known_concepts: 费曼学习法(medium)')

    const { systemPrompt } = lastChatArgs(provider)
    expect(systemPrompt).toContain('known_concepts: 费曼学习法(medium)')
  })

  it('毕业引导文本随画像一并注入 prompt（P3-4）', async () => {
    const provider = mockProvider([{ type: 'text', content: QUIZ_JSON }])
    const hint = '该笔记可能已掌握，可只出 1-2 道 explain 挑战题'
    await generateReviewQuestions(note, [], provider, 'known_concepts: 费曼学习法(high)', hint)

    const { systemPrompt } = lastChatArgs(provider)
    expect(systemPrompt).toContain('known_concepts: 费曼学习法(high)')
    expect(systemPrompt).toContain(hint)
  })

  it('无画像但有毕业引导时仍注入引导', async () => {
    const provider = mockProvider([{ type: 'text', content: QUIZ_JSON }])
    await generateReviewQuestions(note, [], provider, undefined, '建议跳过本次复习')

    const { systemPrompt } = lastChatArgs(provider)
    expect(systemPrompt).toContain('建议跳过本次复习')
  })

  it('LLM 返回非 JSON 时抛出错误', async () => {
    const provider = mockProvider([{ type: 'text', content: '抱歉，我无法生成问题。' }])
    await expect(generateReviewQuestions(note, [], provider)).rejects.toThrow('复习出题失败')
  })

  it('questions 结构非法（缺 level）时抛出错误', async () => {
    const provider = mockProvider([{ type: 'text', content: '{"questions":[{"question":"没有 level 字段"}]}' }])
    await expect(generateReviewQuestions(note, [], provider)).rejects.toThrow('复习出题失败')
  })

  it('LLM 返回 error chunk 时抛出错误', async () => {
    const provider = mockProvider([{ type: 'error', content: '网络超时' }])
    await expect(generateReviewQuestions(note, [], provider)).rejects.toThrow('复习出题失败: 网络超时')
  })

  it('maxTokens 放宽到 4096 且禁用思考模式，避免附带标准答案后 JSON 被截断或挤空', async () => {
    const provider = mockProvider([{ type: 'text', content: QUIZ_JSON }])
    await generateReviewQuestions(note, [], provider)

    const call = provider.chat.mock.calls[0][1] as { maxTokens: number; disableThinking: boolean }
    expect(call.maxTokens).toBe(4096)
    expect(call.disableThinking).toBe(true)
  })

  it('AI 返回空响应时抛出明确错误提示（而非误导性的 JSON 解析失败）', async () => {
    const provider = mockProvider([{ type: 'text', content: '   ' }])
    await expect(generateReviewQuestions(note, [], provider)).rejects.toThrow('AI 返回了空响应')
  })

  it('LLM 响应被截断时降级逐题提取，保留可解析的完整题目', async () => {
    // 模拟 maxTokens 截断：第 3 题在 question 字符串中间被切断（JSON 不完整）
    const truncated =
      '{"questions":[' +
      '{"level":"recognize","type":"choice","question":"费曼法的核心是什么？","options":["向他人解释","死记硬背"],"answer":"向他人解释"},' +
      '{"level":"apply","type":"true_false","question":"费曼法就是复述原文？","answer":"错误"},' +
      '{"level":"explain","type":"short_answer","question":"为什么费曼法能暴'
    const provider = mockProvider([{ type: 'text', content: truncated }])

    const questions = await generateReviewQuestions(note, [], provider)

    // 前两题完整保留，被截断的第三题丢弃
    expect(questions).toHaveLength(2)
    expect(questions[0]).toMatchObject({ level: 'recognize', type: 'choice', answer: '向他人解释' })
    expect(questions[1]).toMatchObject({ level: 'apply', type: 'true_false', answer: '错误' })
  })

  it('整体无法解析时抛错，并将完整响应写入日志系统', async () => {
    const provider = mockProvider([{ type: 'text', content: '抱歉，这不是 JSON。' }])

    await expect(generateReviewQuestions(note, [], provider)).rejects.toThrow('无法解析 LLM 响应为 JSON')

    const raw = localStorage.getItem('study-thread-logs')
    expect(raw).toContain('抱歉，这不是 JSON。')
    expect(raw).toContain('review-quiz')
  })
})

describe('shouldSuggestGraduation（P3-4 毕业引导判断）', () => {
  function profileWith(concepts: Array<{ name: string; confidence: string }>): LearnerProfile {
    return { known_concepts: concepts, active_topics: [], total_sessions: 1, total_notes: 1 }
  }

  it('画像 high 置信度概念命中且掌握度达阈值时建议毕业', () => {
    const profile = profileWith([{ name: '费曼学习法', confidence: 'high' }])
    expect(shouldSuggestGraduation(note, profile, GRADUATION_MASTERY_THRESHOLD)).toBe(true)
    expect(shouldSuggestGraduation(note, profile, 0.95)).toBe(true)
  })

  it('掌握度低于阈值时不建议毕业', () => {
    const profile = profileWith([{ name: '费曼学习法', confidence: 'high' }])
    expect(shouldSuggestGraduation(note, profile, 0.5)).toBe(false)
  })

  it('仅 high 置信度概念触发（low/medium 不触发）', () => {
    expect(shouldSuggestGraduation(note, profileWith([{ name: '费曼学习法', confidence: 'medium' }]), 1)).toBe(false)
    expect(shouldSuggestGraduation(note, profileWith([{ name: '费曼学习法', confidence: 'low' }]), 1)).toBe(false)
  })

  it('画像概念未命中该笔记时（即使 high + 高掌握度）不触发', () => {
    const profile = profileWith([{ name: '工作记忆', confidence: 'high' }])
    expect(shouldSuggestGraduation(note, profile, 1)).toBe(false)
  })

  it('画像为空时不触发', () => {
    expect(shouldSuggestGraduation(note, profileWith([]), 1)).toBe(false)
  })
})

describe('serializeClusterNotes / serializeClusterRelations（P4-2 簇序列化）', () => {
  const cluster = [
    { ...note, content: '费曼学习法依赖[[知识缺口]]。' },
    { ...note, path: 'notes/知识缺口.md', title: '知识缺口', content: '暴露解释中的跳步。' },
    { ...note, path: 'notes/咖啡.md', title: '咖啡', content: '与学习无关。' },
  ]

  it('簇笔记含编号、中心标记、标签与正文', () => {
    const text = serializeClusterNotes(cluster)
    expect(text).toContain('1. 费曼学习法（中心笔记）')
    expect(text).toContain('2. 知识缺口')
    expect(text).toContain('3. 咖啡')
    expect(text).toContain('标签: 学习方法')
  })

  it('簇笔记正文超长时截断', () => {
    const longNote = { ...note, content: 'x'.repeat(3000) }
    const text = serializeClusterNotes([longNote, cluster[1]])
    expect(text).not.toContain('x'.repeat(1201))
  })

  it('关系序列化仅保留簇内互相指向的 wikilink', () => {
    const text = serializeClusterRelations(cluster)
    expect(text).toContain('费曼学习法 → 知识缺口')
    expect(text).not.toContain('咖啡')
  })

  it('无簇内链接时输出占位文案', () => {
    const isolated = [note, relatedNote]
    expect(serializeClusterRelations(isolated)).toContain('暂无显式 wikilink 关系')
  })
})

describe('generateClusterQuestions（P4-2 簇模式）', () => {
  const CLUSTER_JSON =
    '{"questions":[' +
    '{"level":"apply","question":"费曼学习法与主动回忆有何联系？","notes":["费曼学习法","主动回忆"]},' +
    '{"level":"explain","question":"为什么费曼法能暴露知识缺口？","notes":["知识缺口"]}' +
    ']}'
  const clusterNotes = [note, { ...note, title: '主动回忆' }, { ...note, title: '知识缺口' }]

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('解析关系型问题并携带涉及笔记标注', async () => {
    const provider = mockProvider([{ type: 'text', content: CLUSTER_JSON }])
    const questions = await generateClusterQuestions(clusterNotes, provider)

    expect(questions).toHaveLength(2)
    expect(questions[0]).toMatchObject({ level: 'apply', notes: ['费曼学习法', '主动回忆'] })
    expect(questions[1].notes).toEqual(['知识缺口'])
  })

  it('systemPrompt 注入多笔记正文与 wikilink 关系', async () => {
    const provider = mockProvider([{ type: 'text', content: CLUSTER_JSON }])
    await generateClusterQuestions(clusterNotes, provider)

    const { systemPrompt } = lastChatArgs(provider)
    expect(systemPrompt).toContain('费曼学习法（中心笔记）')
    expect(systemPrompt).toContain('主动回忆')
    expect(systemPrompt).toContain('知识缺口')
  })

  it('问题缺少 notes 字段时仍可解析（notes 可选）', async () => {
    const provider = mockProvider([{ type: 'text', content: '{"questions":[{"level":"recognize","question":"什么是费曼学习法？"}]}' }])
    const questions = await generateClusterQuestions(clusterNotes, provider)
    expect(questions[0].notes).toBeUndefined()
  })

  it('LLM 返回非 JSON 时抛出错误', async () => {
    const provider = mockProvider([{ type: 'text', content: '无法生成。' }])
    await expect(generateClusterQuestions(clusterNotes, provider)).rejects.toThrow('复习出题失败')
  })
})

describe('reviewFollowupStream', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const question: ReviewQuestion = { level: 'recognize', type: 'short_answer', question: '什么是费曼学习法？' }
  const questionA: ReviewQuestion = { level: 'recognize', type: 'short_answer', question: '问题A' }

  it('流式透传反馈文本', async () => {
    const provider = mockProvider([
      { type: 'text', content: '你的回答基本正确。' },
      { type: 'stop', content: '' },
    ])
    const chunks: StreamChunk[] = []
    for await (const chunk of reviewFollowupStream(question, '通过教学检验理解', note, provider)) {
      chunks.push(chunk)
    }

    expect(chunks.map((c) => c.content)).toEqual(['你的回答基本正确。', ''])
    const { systemPrompt } = lastChatArgs(provider)
    expect(systemPrompt).toContain('费曼学习法的核心不是把知识讲得简单')
  })

  it('问题与回答作为两条用户消息传入', async () => {
    const provider = mockProvider([{ type: 'text', content: '反馈' }])
    for await (const _ of reviewFollowupStream(questionA, '回答B', note, provider)) {
      // 消费迭代器
    }

    const messages = provider.chat.mock.calls[provider.chat.mock.calls.length - 1][0] as { content: string }[]
    expect(messages).toEqual([
      { role: 'user', content: '复习问题：问题A' },
      { role: 'user', content: '我的回答：回答B' },
    ])
  })

  it('选择题题型标签与选项注入反馈 prompt（P5-3）', async () => {
    const provider = mockProvider([{ type: 'text', content: '反馈' }])
    const choiceQ: ReviewQuestion = {
      level: 'recognize',
      type: 'choice',
      question: '费曼法的核心是什么？',
      options: ['向他人解释', '死记硬背'],
    }
    for await (const _ of reviewFollowupStream(choiceQ, '我选择 A：向他人解释', note, provider)) {
      // 消费迭代器
    }

    const { systemPrompt } = lastChatArgs(provider)
    expect(systemPrompt).toContain('[选择题]')
    expect(systemPrompt).toContain('A. 向他人解释')
    expect(systemPrompt).toContain('B. 死记硬背')
  })

  it('确定答案题型注入附带的标准答案供判正误（P5-6）', async () => {
    const provider = mockProvider([{ type: 'text', content: '判定：正确\n很好。' }])
    const choiceQ: ReviewQuestion = {
      level: 'recognize',
      type: 'choice',
      question: '费曼法的核心是什么？',
      options: ['向他人解释', '死记硬背'],
      answer: '向他人解释',
    }
    for await (const _ of reviewFollowupStream(choiceQ, '我选择 A：向他人解释', note, provider)) {
      // 消费迭代器
    }

    const { systemPrompt } = lastChatArgs(provider)
    expect(systemPrompt).toContain('向他人解释')
    expect(systemPrompt).not.toContain('本题为自由作答')
  })

  it('自由作答题型无标准答案时注入占位文案，由 AI 对照笔记判断（P5-6）', async () => {
    const provider = mockProvider([{ type: 'text', content: '判定：部分正确\n……' }])
    for await (const _ of reviewFollowupStream(questionA, '回答B', note, provider)) {
      // 消费迭代器
    }

    const { systemPrompt } = lastChatArgs(provider)
    expect(systemPrompt).toContain('本题为自由作答')
  })

  it('提供簇上下文时反馈 prompt 注入簇笔记（P4-2）', async () => {
    const provider = mockProvider([{ type: 'text', content: '反馈' }])
    for await (const _ of reviewFollowupStream(questionA, '回答B', note, provider, [note, relatedNote])) {
      // 消费迭代器
    }

    const { systemPrompt } = lastChatArgs(provider)
    expect(systemPrompt).toContain('复习簇上下文')
    expect(systemPrompt).toContain('工作记忆')
  })

  it('未提供簇上下文时注入单条占位文案', async () => {
    const provider = mockProvider([{ type: 'text', content: '反馈' }])
    for await (const _ of reviewFollowupStream(questionA, '回答B', note, provider)) {
      // 消费迭代器
    }

    const { systemPrompt } = lastChatArgs(provider)
    expect(systemPrompt).toContain('单条笔记复习，无簇上下文')
  })

  it('provider 抛异常时输出 error chunk 而非抛出', async () => {
    const provider = {
      chat: vi.fn(async function* () {
        throw new Error('LLM 挂了')
      }),
    } as unknown as ReturnType<typeof mockProvider>

    const chunks: StreamChunk[] = []
    for await (const chunk of reviewFollowupStream(question, '回答', note, provider)) {
      chunks.push(chunk)
    }
    expect(chunks).toEqual([{ type: 'error', content: '复习反馈失败: LLM 挂了' }])
  })
})

describe('reviewDebateStream', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const debateQ: ReviewQuestion = {
    level: 'explain',
    type: 'debate',
    question: '辩题：死记硬背毫无价值',
    position: '反对该观点：死记硬背在记忆巩固中有基础价值',
    maxRounds: 3,
  }
  const turns = [
    { role: 'assistant' as const, content: '我方观点：死记硬背在基础记忆阶段不可替代。' },
    { role: 'user' as const, content: '我认为理解更重要，死记硬背效率低。' },
  ]

  it('中段轮次：注入辩题/轮次/历史论点，提示反驳而非总结', async () => {
    const provider = mockProvider([{ type: 'text', content: '反驳：理解的前提是先记住基础符号。' }])
    for await (const _ of reviewDebateStream(debateQ, turns, note, provider, undefined, 1)) {
      // 消费迭代器
    }

    const { systemPrompt } = lastChatArgs(provider)
    expect(systemPrompt).toContain('反对该观点：死记硬背在记忆巩固中有基础价值')
    expect(systemPrompt).toContain('1 / 3')
    expect(systemPrompt).toContain('用户：我认为理解更重要，死记硬背效率低。')
    const messages = provider.chat.mock.calls[provider.chat.mock.calls.length - 1][0] as { content: string }[]
    expect(messages[0].content).toBe('请针对我上轮论点进行反驳或追问。')
  })

  it('末轮（达到 maxRounds）：提示总结评估', async () => {
    const provider = mockProvider([{ type: 'text', content: '总结：你的立场有合理处……' }])
    for await (const _ of reviewDebateStream(debateQ, turns, note, provider, undefined, 3)) {
      // 消费迭代器
    }

    const { systemPrompt } = lastChatArgs(provider)
    expect(systemPrompt).toContain('3 / 3')
    expect(systemPrompt).toContain('总结轮')
    const messages = provider.chat.mock.calls[provider.chat.mock.calls.length - 1][0] as { content: string }[]
    expect(messages[0].content).toBe('请给出本轮辩论的总结评估。')
  })

  it('无 position 时回退用题干作为辩题', async () => {
    const provider = mockProvider([{ type: 'text', content: '反驳' }])
    const noPos: ReviewQuestion = { level: 'explain', type: 'debate', question: '辩题A' }
    for await (const _ of reviewDebateStream(noPos, [], note, provider, undefined, 1, 2)) {
      // 消费迭代器
    }

    const { systemPrompt } = lastChatArgs(provider)
    expect(systemPrompt).toContain('辩题A')
    expect(systemPrompt).toContain('1 / 2')
    expect(systemPrompt).toContain('暂无历史发言，本轮为开场')
  })

  it('流式透传辩论回复', async () => {
    const provider = mockProvider([{ type: 'text', content: '第一句' }, { type: 'text', content: '第二句' }])
    const chunks: StreamChunk[] = []
    for await (const chunk of reviewDebateStream(debateQ, turns, note, provider, undefined, 1)) {
      chunks.push(chunk)
    }
    expect(chunks.map((c) => c.content)).toEqual(['第一句', '第二句'])
  })

  it('provider 抛异常时输出 error chunk 而非抛出', async () => {
    const provider = {
      chat: vi.fn(async function* () {
        throw new Error('LLM 挂了')
      }),
    } as unknown as ReturnType<typeof mockProvider>

    const chunks: StreamChunk[] = []
    for await (const chunk of reviewDebateStream(debateQ, turns, note, provider, undefined, 1)) {
      chunks.push(chunk)
    }
    expect(chunks).toEqual([{ type: 'error', content: '辩论回复失败: LLM 挂了' }])
  })
})
