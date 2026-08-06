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

  it('标题/标签均关闭时完全不调用 LLM，标题/描述/标签全部本地兜底', async () => {
    const provider = providerReturning(JSON.stringify({
      title: 'LLM 标题',
      description: 'LLM 描述',
      tags: ['LLM 标签'],
    }))

    const note = await extractNote(
      '这是一段很长的划线内容，用来测试关闭 LLM 生成后的兜底逻辑',
      '会话上下文',
      provider,
      undefined,
      { generateTitle: false, generateTags: false },
    )

    expect(provider.chat).not.toHaveBeenCalled()
    expect(note.title).toBe('这是一段很长的划线内容，用来测试关闭 L')
    expect(note.description).toBe('这是一段很长的划线内容，用来测试关闭 LLM 生成后的兜底逻辑')
    expect(note.tags).toEqual(['未分类'])
  })

  it('仅关闭标题生成时仍调用 LLM，但标题用划线文本兜底', async () => {
    const provider = providerReturning(JSON.stringify({
      title: 'LLM 标题',
      description: 'LLM 描述',
      tags: ['记忆'],
    }))

    const note = await extractNote(
      '划线内容用于标题兜底',
      '会话上下文',
      provider,
      undefined,
      { generateTitle: false },
    )

    expect(provider.chat).toHaveBeenCalled()
    expect(note.title).toBe('划线内容用于标题兜底')
    expect(note.description).toBe('LLM 描述')
    expect(note.tags).toEqual(['记忆'])
  })

  it('仅关闭标签生成时，标签统一为 未分类，其余字段仍用 LLM 结果', async () => {
    const provider = providerReturning(JSON.stringify({
      title: 'LLM 标题',
      description: 'LLM 描述',
      tags: ['记忆'],
    }))

    const note = await extractNote('划线内容', '会话上下文', provider, undefined, { generateTags: false })

    expect(note.title).toBe('LLM 标题')
    expect(note.tags).toEqual(['未分类'])
  })

  it('关闭标题生成但用户显式指定标题时，用户标题始终优先', async () => {
    const provider = providerReturning(JSON.stringify({
      title: 'LLM 标题',
      description: 'LLM 描述',
      tags: ['记忆'],
    }))

    const note = await extractNote(
      '划线内容',
      '会话上下文',
      provider,
      '用户指定标题',
      { generateTitle: false },
    )

    expect(note.title).toBe('用户指定标题')
  })
})
