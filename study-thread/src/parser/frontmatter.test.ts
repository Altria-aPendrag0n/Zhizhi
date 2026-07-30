import { describe, it, expect } from 'vitest'
import { parseFrontmatter } from './frontmatter'

describe('parseFrontmatter', () => {
  it('解析标准 frontmatter', () => {
    const input = `---
title: 测试笔记
type: concept
tags:
  - 学习
  - 方法
created: 2024-01-01
---
# 标题

正文内容`
    const result = parseFrontmatter(input)
    expect(result.meta).toEqual({
      title: '测试笔记',
      type: 'concept',
      tags: ['学习', '方法'],
      created: '2024-01-01',
    })
    expect(result.body).toBe('# 标题\n\n正文内容')
  })

  it('处理没有 frontmatter 的内容', () => {
    const input = '# 直接正文'
    const result = parseFrontmatter(input)
    expect(result.meta).toEqual({})
    expect(result.body).toBe('# 直接正文')
  })

  it('处理格式错误的 frontmatter（返回空 meta）', () => {
    const input = `---
invalid: yaml: : :
---
正文`
    const result = parseFrontmatter(input)
    expect(result.meta).toEqual({})
    expect(result.body).toBe('正文')
  })

  it('处理空 frontmatter（连续 --- 行无内容，不被识别为 frontmatter）', () => {
    const input = `---
---
正文`
    const result = parseFrontmatter(input)
    expect(result.meta).toEqual({})
    // 连续 --- 行之间没有内容，正则不匹配，整体作为 body 返回
    expect(result.body).toBe('---\n---\n正文')
  })

  it('处理复杂的 frontmatter', () => {
    const input = `---
title: 复杂笔记
type: method
confidence: 0.85
source:
  session: sessions/topic/main.md
  highlight: "这是一段划线文本"
---
内容开始`
    const result = parseFrontmatter(input)
    expect(result.meta.title).toBe('复杂笔记')
    expect(result.meta.confidence).toBe(0.85)
    expect((result.meta.source as any).session).toBe('sessions/topic/main.md')
    expect(result.body).toBe('内容开始')
  })

  it('处理紧跟着的 frontmatter 分隔符', () => {
    const input = `---
title: test
---
body`
    const result = parseFrontmatter(input)
    expect(result.meta.title).toBe('test')
    expect(result.body).toBe('body')
  })
})