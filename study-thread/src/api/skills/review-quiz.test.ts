import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LLMProvider, StreamChunk } from '../llm-provider'
import type { Note } from '../../types'
import type { LearnerProfile } from '../../utils/learner-profile'
import {
  generateReviewQuestions,
  reviewFollowupStream,
  serializeNoteForReview,
  shouldSuggestGraduation,
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

    expect(questions).toEqual([
      { level: 'recognize', question: '什么是费曼学习法？' },
      { level: 'apply', question: '如何用费曼法检验自己是否理解？' },
      { level: 'explain', question: '为什么费曼法能暴露解释中的跳步？' },
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

describe('reviewFollowupStream', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('流式透传反馈文本', async () => {
    const provider = mockProvider([
      { type: 'text', content: '你的回答基本正确。' },
      { type: 'stop', content: '' },
    ])
    const chunks: StreamChunk[] = []
    for await (const chunk of reviewFollowupStream('什么是费曼学习法？', '通过教学检验理解', note, provider)) {
      chunks.push(chunk)
    }

    expect(chunks.map((c) => c.content)).toEqual(['你的回答基本正确。', ''])
    const { systemPrompt } = lastChatArgs(provider)
    expect(systemPrompt).toContain('费曼学习法的核心不是把知识讲得简单')
  })

  it('问题与回答作为两条用户消息传入', async () => {
    const provider = mockProvider([{ type: 'text', content: '反馈' }])
    for await (const _ of reviewFollowupStream('问题A', '回答B', note, provider)) {
      // 消费迭代器
    }

    const messages = provider.chat.mock.calls[provider.chat.mock.calls.length - 1][0] as { content: string }[]
    expect(messages).toEqual([
      { role: 'user', content: '复习问题：问题A' },
      { role: 'user', content: '我的回答：回答B' },
    ])
  })

  it('provider 抛异常时输出 error chunk 而非抛出', async () => {
    const provider = {
      chat: vi.fn(async function* () {
        throw new Error('LLM 挂了')
      }),
    } as unknown as ReturnType<typeof mockProvider>

    const chunks: StreamChunk[] = []
    for await (const chunk of reviewFollowupStream('问题', '回答', note, provider)) {
      chunks.push(chunk)
    }
    expect(chunks).toEqual([{ type: 'error', content: '复习反馈失败: LLM 挂了' }])
  })
})
