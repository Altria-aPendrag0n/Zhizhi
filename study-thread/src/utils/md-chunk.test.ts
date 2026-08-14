import { describe, it, expect } from 'vitest'
import { chunkMdByChapters, MD_CHUNK_MAX_CHARS } from './md-chunk'

describe('chunkMdByChapters', () => {
  it('按 H1/H2 章节标题切分，块带章节标题（无页码）', () => {
    const markdown = [
      '# 第一章 概述',
      '第一章内容',
      '',
      '## 1.1 背景',
      '背景内容',
      '# 第二章 方法',
      '第二章内容',
    ].join('\n')

    const chunks = chunkMdByChapters(markdown)

    expect(chunks).toHaveLength(3)
    expect(chunks[0].title).toBe('第一章 概述')
    expect(chunks[0].text).toContain('# 第一章 概述')
    expect(chunks[0].text).toContain('第一章内容')

    expect(chunks[1].title).toBe('1.1 背景')
    expect(chunks[1].text).toContain('背景内容')

    expect(chunks[2].title).toBe('第二章 方法')
    expect(chunks[2].text).toContain('第二章内容')
  })

  it('H3 及以下标题归入所属章节，不单独成块', () => {
    const markdown = [
      '# 第一章',
      '开头',
      '### 1.1.1 细节',
      '细节内容',
      '# 第二章',
      '第二章内容',
    ].join('\n')

    const chunks = chunkMdByChapters(markdown)

    expect(chunks).toHaveLength(2)
    expect(chunks[0].title).toBe('第一章')
    expect(chunks[0].text).toContain('### 1.1.1 细节')
    expect(chunks[0].text).toContain('细节内容')
    expect(chunks[1].title).toBe('第二章')
  })

  it('首个标题之前的内容归入空标题块', () => {
    const markdown = ['前言内容', '# 第一章', '正文内容'].join('\n')

    const chunks = chunkMdByChapters(markdown)

    expect(chunks).toHaveLength(2)
    expect(chunks[0].title).toBe('')
    expect(chunks[0].text).toBe('前言内容')
    expect(chunks[1].title).toBe('第一章')
  })

  it('无标题时整篇单块', () => {
    const markdown = '无标题内容\n第二行内容'

    const chunks = chunkMdByChapters(markdown)

    expect(chunks).toHaveLength(1)
    expect(chunks[0].title).toBe('')
    expect(chunks[0].text).toBe('无标题内容\n第二行内容')
  })

  it('无标题大 md 按预算逐行切分', () => {
    const markdown = [1, 2].map(() => '甲'.repeat(MD_CHUNK_MAX_CHARS - 100)).join('\n')

    const chunks = chunkMdByChapters(markdown)

    expect(chunks).toHaveLength(2)
    expect(chunks[0].title).toBe('')
    expect(chunks[1].title).toBe('')
    expect(chunks[0].text.length).toBeLessThanOrEqual(MD_CHUNK_MAX_CHARS)
    expect(chunks[1].text.length).toBeLessThanOrEqual(MD_CHUNK_MAX_CHARS)
  })

  it('超大章节按预算细分，保留章节标题', () => {
    const markdown = [
      '# 长章节',
      '甲'.repeat(MD_CHUNK_MAX_CHARS - 100),
      '乙'.repeat(MD_CHUNK_MAX_CHARS - 100),
    ].join('\n')

    const chunks = chunkMdByChapters(markdown)

    expect(chunks).toHaveLength(2)
    expect(chunks[0].title).toBe('长章节')
    expect(chunks[1].title).toBe('长章节')
  })

  it('跳过围栏代码块内的 # 行，不误判为章节', () => {
    const markdown = [
      '# 第一章',
      '```python',
      '# 这是代码注释',
      'print("hi")',
      '```',
      '正文内容',
    ].join('\n')

    const chunks = chunkMdByChapters(markdown)

    expect(chunks).toHaveLength(1)
    expect(chunks[0].title).toBe('第一章')
    expect(chunks[0].text).toContain('# 这是代码注释')
  })
})
