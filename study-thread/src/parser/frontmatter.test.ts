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

  it('将 YAML 日期标准化为字符串', () => {
    const result = parseFrontmatter(`---
title: 日期笔记
created: 2024-01-01
updated: 2024-01-01T12:30:00Z
---
正文`)
    expect(result.meta).toMatchObject({
      created: '2024-01-01',
      updated: '2024-01-01T12:30:00Z',
    })
    expect(result.meta.created).toEqual(expect.any(String))
    expect(result.meta.updated).toEqual(expect.any(String))
  })

  it('日期字段保持字符串，不产生 Date 对象或时区偏移', () => {
    const result = parseFrontmatter(`---
created: 2024-01-01
updated: '2026-07-31T15:48:23.809Z'
---
正文`)
    expect(result.meta.created).toBe('2024-01-01')
    expect(result.meta.updated).toBe('2026-07-31T15:48:23.809Z')
    expect(result.meta.created).toEqual(expect.any(String))
  })

  it('非标准日期字符串保持原样，不被错误转换', () => {
    const result = parseFrontmatter(`---
updated: 2026年7月31日
---
正文`)
    expect(result.meta.updated).toBe('2026年7月31日')
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

  it('宽松容错：旧版本多行 highlight 未转义导致整体解析失败时，tags 等字段仍可恢复', () => {
    // 旧 serializeNote 将表格多行划线裸写入 highlight 字段，跨行未闭合引号使整个 YAML 解析失败
    const input = `---
title: "淡水虾种类与吃法一览"
tags:
  - 淡水虾
  - 菜谱
source:
  session: "sessions/美食/main.md"
  highlight: "| 种类 | 特点 |
| 草虾 | 口感弹牙 |
| 明虾 | 肉质紧实 |"
---
# 淡水虾种类与吃法一览

正文`
    const result = parseFrontmatter(input)
    // 容错解析丢弃跨行 highlight 后，关键字段完整保留
    expect(result.meta.title).toBe('淡水虾种类与吃法一览')
    expect(result.meta.tags).toEqual(['淡水虾', '菜谱'])
    expect((result.meta.source as any).session).toBe('sessions/美食/main.md')
  })

  it('宽松容错：highlight 跨行但后续字段仍可解析', () => {
    const input = `---
title: "虾类知识"
highlight: "第一行
第二行"
confidence: 0.8
---
正文`
    const result = parseFrontmatter(input)
    expect(result.meta.title).toBe('虾类知识')
    expect(result.meta.confidence).toBe(0.8)
  })
})