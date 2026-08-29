import { describe, it, expect, vi } from 'vitest'
import { imageToMarkdown, validateImageNoteResult } from './image-to-note'
import type { LLMProvider } from '../llm-provider'

function providerReturning(json: string): LLMProvider {
  return {
    chat: vi.fn(async function* () {
      yield { type: 'text' as const, content: json }
      yield { type: 'stop' as const, content: '' }
    }),
  }
}

const image = { mimeType: 'image/jpeg', base64: 'QUJD' }

describe('imageToMarkdown', () => {
  it('正常识别：消息包含图片块并返回解析后的结果', async () => {
    const provider = providerReturning(JSON.stringify({
      title: '课程表',
      description: '一周课程安排',
      tags: ['课程表', '学习计划'],
      markdown: '| 时间 | 课程 |\n| --- | --- |\n| 周一 | 数学 |',
    }))

    const result = await imageToMarkdown(image, provider)

    expect(result).toEqual({
      title: '课程表',
      description: '一周课程安排',
      tags: ['课程表', '学习计划'],
      markdown: '| 时间 | 课程 |\n| --- | --- |\n| 周一 | 数学 |',
    })
    const chatMock = provider.chat as ReturnType<typeof vi.fn>
    const [messages, options] = chatMock.mock.calls[0]
    expect(messages[0].images).toEqual([image])
    expect(messages[0].content).toContain('识别')
    expect(options.systemPrompt).toContain('图片')
    expect(options.disableThinking).toBe(true)
    expect(options.maxTokens).toBe(4096)
    expect(options.temperature).toBe(0.3)
  })

  it('JSON 解析失败时抛出明确错误', async () => {
    const provider = providerReturning('不是 JSON')
    await expect(imageToMarkdown(image, provider)).rejects.toThrow('无法解析 LLM 响应为 JSON')
  })

  it('缺少必要字段时抛出明确错误', async () => {
    const provider = providerReturning(JSON.stringify({ title: '只有标题' }))
    await expect(imageToMarkdown(image, provider)).rejects.toThrow('响应缺少必要字段')
  })

  it('空响应时提示检查模型配置', async () => {
    const provider = { chat: vi.fn(async function* () {}) }
    await expect(imageToMarkdown(image, provider)).rejects.toThrow('空响应')
  })

  it('LLM 报错时抛出错误', async () => {
    const provider = {
      chat: vi.fn(async function* () {
        yield { type: 'error' as const, content: 'API 错误 (401)' }
      }),
    }
    await expect(imageToMarkdown(image, provider)).rejects.toThrow('LLM 调用失败')
  })

  it('tags 为空数组时兜底为 未分类', async () => {
    const provider = providerReturning(JSON.stringify({
      title: '标题',
      description: '描述',
      tags: [],
      markdown: '正文',
    }))
    const result = await imageToMarkdown(image, provider)
    expect(result.tags).toEqual(['未分类'])
  })

  it('支持 ```json 代码块包裹的输出', async () => {
    const provider = providerReturning('```json\n' + JSON.stringify({
      title: '标题',
      description: '描述',
      tags: ['a'],
      markdown: '正文',
    }) + '\n```')
    const result = await imageToMarkdown(image, provider)
    expect(result.markdown).toBe('正文')
  })

  it('reference 意图注入对应的提示词', async () => {
    const provider = providerReturning(JSON.stringify({
      title: '标题',
      description: '描述',
      tags: ['a'],
      markdown: '正文',
    }))
    await imageToMarkdown(image, provider, 'reference')
    const chatMock = provider.chat as ReturnType<typeof vi.fn>
    const [, options] = chatMock.mock.calls[0]
    expect(options.systemPrompt).toContain('参考资料')
  })
})

describe('validateImageNoteResult', () => {
  it('校验通过/不通过', () => {
    expect(validateImageNoteResult({ title: 'a', description: 'b', tags: ['c'], markdown: 'd' })).toBe(true)
    expect(validateImageNoteResult({ title: 'a', description: 'b', tags: ['c'], markdown: '' })).toBe(false)
    expect(validateImageNoteResult({ title: 'a', description: 'b', tags: ['c'], markdown: '   ' })).toBe(false)
    expect(validateImageNoteResult({ title: 'a', description: 'b' })).toBe(false)
    expect(validateImageNoteResult(null)).toBe(false)
    expect(validateImageNoteResult('字符串')).toBe(false)
  })
})
