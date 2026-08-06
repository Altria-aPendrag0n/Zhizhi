import { describe, it, expect, vi } from 'vitest'
import { extractNote } from './extract-note'
import type { LLMProvider } from '../llm-provider'

function providerReturning(json: string): LLMProvider {
  return {
    chat: vi.fn(async function* () {
      yield { type: 'text' as const, content: json }
      yield { type: 'stop' as const, content: '' }
    }),
  }
}

describe('extractNote', () => {
  it('LLM 未生成标签（tags 为空数组）时兜底为 未分类，保证笔记始终有标签', async () => {
    const provider = providerReturning(JSON.stringify({
      title: '测试笔记',
      description: '测试描述',
      tags: [],
    }))

    const note = await extractNote('划线内容', '会话上下文', provider)

    expect(note.tags).toEqual(['未分类'])
  })

  it('LLM 生成标签时原样保留', async () => {
    const provider = providerReturning(JSON.stringify({
      title: '测试笔记',
      description: '测试描述',
      tags: ['记忆', '学习方法'],
    }))

    const note = await extractNote('划线内容', '会话上下文', provider)

    expect(note.tags).toEqual(['记忆', '学习方法'])
  })

  it('未指定标题时用划线文本前 20 字兜底', async () => {
    const provider = providerReturning(JSON.stringify({
      description: '测试描述',
      tags: ['记忆'],
    }))

    const note = await extractNote('这是一段很长的划线内容，用来测试标题兜底逻辑', '会话上下文', provider)

    expect(note.title).toBe('这是一段很长的划线内容，用来测试标题兜底')
  })
})
