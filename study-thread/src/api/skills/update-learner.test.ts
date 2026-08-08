import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { LLMProvider, StreamChunk } from '../llm-provider'
import type { Session, Note } from '../../types'
import { generateProfileUpdate } from './update-learner'

const session: Session = {
  id: 's1',
  title: '学习会话',
  created: '2026-08-08T00:00:00.000Z',
  parent_session: null,
  fork_point: null,
  tags: [],
  messages: [
    { role: 'user', content: '什么是费曼学习法？' },
    { role: 'assistant', content: '费曼学习法是通过向他人解释来检验理解的方法。' },
  ],
}

const note: Note = {
  path: 'notes/费曼学习法.md',
  title: '费曼学习法',
  type: 'method',
  tags: ['学习方法'],
  created: '2026-08-08T00:00:00.000Z',
  updated: '2026-08-08T00:00:00.000Z',
  confidence: 0.5,
  review: { next: null, interval: 0, mastery: 0 },
  content: '通过教别人来暴露解释中的跳步。',
}

const DIFF_JSON = JSON.stringify({
  added_concepts: [{ name: '费曼学习法', confidence: 'medium', description: '能部分解释' }],
  updated_concepts: [],
  removed_concepts: [],
  suggested_topics: [{ topic: '认知科学', reason: '与该概念相关' }],
  summary: '本次会话新增一个概念。',
})

function mockProvider(yieldChunks: StreamChunk[]) {
  const chat = vi.fn(async function* () {
    for (const chunk of yieldChunks) yield chunk
  })
  return { chat } as unknown as LLMProvider & { chat: ReturnType<typeof vi.fn> }
}

function lastSystemPrompt(provider: ReturnType<typeof mockProvider>): string {
  const args = provider.chat.mock.calls[provider.chat.mock.calls.length - 1][1] as { systemPrompt: string }
  return args.systemPrompt
}

describe('generateProfileUpdate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('正确解析 LLM 画像 diff JSON', async () => {
    const provider = mockProvider([{ type: 'text', content: DIFF_JSON }])
    const diff = await generateProfileUpdate(session, '', [], provider)

    expect(diff.added_concepts).toHaveLength(1)
    expect(diff.added_concepts[0].name).toBe('费曼学习法')
    expect(diff.summary).toContain('新增一个概念')
  })

  it('systemPrompt 注入会话、笔记与画像', async () => {
    const provider = mockProvider([{ type: 'text', content: DIFF_JSON }])
    await generateProfileUpdate(session, 'known_concepts: []', [note], provider)

    const prompt = lastSystemPrompt(provider)
    expect(prompt).toContain('什么是费曼学习法？')
    expect(prompt).toContain('费曼学习法')
    expect(prompt).toContain('known_concepts: []')
  })

  it('无复习表现时注入默认占位文案', async () => {
    const provider = mockProvider([{ type: 'text', content: DIFF_JSON }])
    await generateProfileUpdate(session, '', [note], provider)

    expect(lastSystemPrompt(provider)).toContain('（暂无复习表现数据）')
  })

  it('复习表现非空时原样注入（P3-5）', async () => {
    const provider = mockProvider([{ type: 'text', content: DIFF_JSON }])
    const reviewPerformance = '复习表现：\n- 费曼学习法：近 3 次评级（good × 2、again × 1），掌握度 80%'
    await generateProfileUpdate(session, '', [note], provider, reviewPerformance)

    expect(lastSystemPrompt(provider)).toContain('good × 2')
    expect(lastSystemPrompt(provider)).toContain('掌握度 80%')
  })

  it('LLM 返回非 JSON 时抛出错误', async () => {
    const provider = mockProvider([{ type: 'text', content: '抱歉，无法分析。' }])
    await expect(generateProfileUpdate(session, '', [], provider)).rejects.toThrow('画像更新失败')
  })
})
