import { describe, it, expect } from 'vitest'
import { chunkPdfByChapters, PDF_CHUNK_MAX_CHARS } from './pdf-chunk'

describe('chunkPdfByChapters', () => {
  it('按 H1/H2 章节标题切分，块带章节标题与物理页码区间', () => {
    const markdown = [
      '<!-- page: 1 -->',
      '# 第一章 概述',
      '第一章内容',
      '',
      '<!-- page: 2 -->',
      '## 1.1 背景',
      '背景内容',
      '<!-- page: 3 -->',
      '# 第二章 方法',
      '第二章内容',
    ].join('\n')

    const chunks = chunkPdfByChapters(markdown)

    expect(chunks).toHaveLength(3)
    expect(chunks[0].title).toBe('第一章 概述')
    expect(chunks[0].pageFrom).toBe(0)
    expect(chunks[0].pageTo).toBe(0)
    expect(chunks[0].text).toContain('# 第一章 概述')
    expect(chunks[0].text).toContain('第一章内容')

    expect(chunks[1].title).toBe('1.1 背景')
    expect(chunks[1].pageFrom).toBe(1)
    expect(chunks[1].pageTo).toBe(1)

    expect(chunks[2].title).toBe('第二章 方法')
    expect(chunks[2].pageFrom).toBe(2)
    expect(chunks[2].pageTo).toBe(2)
  })

  it('首个标题之前的内容归入空标题块', () => {
    const markdown = [
      '<!-- page: 1 -->',
      '前言内容',
      '# 第一章',
      '正文内容',
    ].join('\n')

    const chunks = chunkPdfByChapters(markdown)

    expect(chunks).toHaveLength(2)
    expect(chunks[0].title).toBe('')
    expect(chunks[0].text).toBe('前言内容')
    expect(chunks[0].pageFrom).toBe(0)
    expect(chunks[0].pageTo).toBe(0)
    expect(chunks[1].title).toBe('第一章')
  })

  it('无标题时整篇单块，页码区间覆盖全部页', () => {
    const markdown = [
      '<!-- page: 1 -->',
      '无标题内容',
      '<!-- page: 2 -->',
      '第二页内容',
    ].join('\n')

    const chunks = chunkPdfByChapters(markdown)

    expect(chunks).toHaveLength(1)
    expect(chunks[0].title).toBe('')
    expect(chunks[0].pageFrom).toBe(0)
    expect(chunks[0].pageTo).toBe(1)
    expect(chunks[0].text).toContain('无标题内容')
    expect(chunks[0].text).toContain('第二页内容')
  })

  it('无标题大 PDF 退化为按页分块', () => {
    const page1 = '甲'.repeat(PDF_CHUNK_MAX_CHARS - 100)
    const page2 = '乙'.repeat(PDF_CHUNK_MAX_CHARS - 100)
    const markdown = `<!-- page: 1 -->\n${page1}\n<!-- page: 2 -->\n${page2}`

    const chunks = chunkPdfByChapters(markdown)

    expect(chunks).toHaveLength(2)
    expect(chunks[0].pageFrom).toBe(0)
    expect(chunks[0].pageTo).toBe(0)
    expect(chunks[0].text).toBe(page1)
    expect(chunks[1].pageFrom).toBe(1)
    expect(chunks[1].pageTo).toBe(1)
    expect(chunks[1].text).toBe(page2)
  })

  it('超大章节按页细分，保留章节标题', () => {
    const markdown = [
      '<!-- page: 1 -->',
      '# 长章节',
      '甲'.repeat(PDF_CHUNK_MAX_CHARS - 100),
      '<!-- page: 2 -->',
      '乙'.repeat(PDF_CHUNK_MAX_CHARS - 100),
    ].join('\n')

    const chunks = chunkPdfByChapters(markdown)

    expect(chunks).toHaveLength(2)
    expect(chunks[0].title).toBe('长章节')
    expect(chunks[0].pageFrom).toBe(0)
    expect(chunks[0].pageTo).toBe(0)
    expect(chunks[1].title).toBe('长章节')
    expect(chunks[1].pageFrom).toBe(1)
    expect(chunks[1].pageTo).toBe(1)
  })
})
