import { describe, it, expect } from 'vitest'
import { marked } from 'marked'
import { preprocessMarkdownForRendering, wrapDiagramBlocks } from './markdown-preprocess'

/** 以与 ChatMessage 相同的方式渲染（breaks + gfm） */
function render(md: string): string {
  return marked(preprocessMarkdownForRendering(md), { breaks: true, gfm: true }) as string
}

describe('preprocessMarkdownForRendering', () => {
  it('把 **"X"** 变换为 "**X**"，文本内容不变', () => {
    expect(preprocessMarkdownForRendering('俗称**"濑尿虾"**是口虾蛄。'))
      .toBe('俗称"**濑尿虾**"是口虾蛄。')
  })

  it('全角引号同样处理', () => {
    expect(preprocessMarkdownForRendering('俗称**“濑尿虾”**是口虾蛄。'))
      .toBe('俗称“**濑尿虾**”是口虾蛄。')
  })

  it('修复后 marked 渲染为 <strong> 且无字面 ** 残留', () => {
    const html = render('俗称**"濑尿虾"**是口虾蛄。')
    expect(html).toContain('<strong>濑尿虾</strong>')
    expect(html).not.toContain('**')
  })

  it('行首加粗含引号也能正确渲染', () => {
    const html = render('**"濑尿虾"**是皮皮虾的别名。')
    expect(html).toContain('<strong>濑尿虾</strong>')
    expect(html).not.toContain('**')
  })

  it('普通加粗（无标点紧贴）不受影响', () => {
    expect(preprocessMarkdownForRendering('重点在于**虾蛄**'))
      .toBe('重点在于**虾蛄**')
    expect(render('重点在于**虾蛄**')).toContain('<strong>虾蛄</strong>')
  })

  it('行内代码中的 **"…"** 不被改写', () => {
    const md = '代码 `` `**"x"**` `` 保持原样'
    expect(preprocessMarkdownForRendering(md)).toBe(md)
  })

  it('围栏代码块中的 **"…"** 不被改写', () => {
    const md = '```ts\nconst s = "**\\"x\\"**"\n```'
    expect(preprocessMarkdownForRendering(md)).toBe(md)
  })

  it('多个加粗含引号片段全部处理', () => {
    expect(preprocessMarkdownForRendering('**"甲"**与**"乙"**相邻'))
      .toBe('"**甲**"与"**乙**"相邻')
  })
})

describe('wrapDiagramBlocks（框线字符画流程图）', () => {
  it('把框线流程图段落包裹为 text 代码块', () => {
    const md = '开始\n  │\n  ▼\n┌──────┐\n│ 是否 │\n└──────┘'
    expect(wrapDiagramBlocks(md)).toBe('```text\n' + md + '\n```')
  })

  it('只有单个箭头的普通句子不被包裹', () => {
    expect(wrapDiagramBlocks('用 → 表示映射关系')).toBe('用 → 表示映射关系')
  })

  it('两个相邻段落只有流程图段落被包裹，普通段落保留', () => {
    const md = '以下是一个流程：\n\n开始\n  │\n  ▼\n结束\n\n这样走。'
    expect(wrapDiagramBlocks(md))
      .toBe('以下是一个流程：\n\n```text\n开始\n  │\n  ▼\n结束\n```\n\n这样走。')
  })

  it('渲染后框线字符保留且进入等宽代码块', () => {
    const html = render('开始\n  │\n  ▼\n┌──────┐\n│ 是否 │\n└──────┘')
    expect(html).toContain('<pre><code class="language-text">')
    expect(html).toContain('┌')
    expect(html).toContain('│ 是否 │')
  })

  it('已有围栏代码块中的框线字符不被二次包裹', () => {
    const md = '```text\n┌──┐\n│a│\n└──┘\n```'
    const html = render(md)
    expect((html.match(/<pre>/g) || []).length).toBe(1)
    expect(html).toContain('┌')
  })

  it('Markdown 表格不被误判为流程图', () => {
    const html = render('| 列1 | 列2 |\n|---|---|\n| a | b |')
    expect(html).toContain('<table>')
    expect(html).not.toContain('<pre>')
  })

  it('把 ASCII 字符画流程图（+---+）包裹为 text 代码块', () => {
    const md = '开始\n  |\n  v\n+--------+\n| 判断   |\n+--------+'
    expect(wrapDiagramBlocks(md)).toBe('```text\n' + md + '\n```')
  })

  it('渲染后 ASCII 流程图保留空白进入等宽代码块', () => {
    const html = render('开始\n  |\n  v\n+--------+\n| 判断   |\n+--------+')
    expect(html).toContain('<pre><code')
    expect(html).toContain('+--------+')
    expect(html).toContain('| 判断   |')
  })

  it('正负号 +- 单独出现不被误判为流程图', () => {
    expect(wrapDiagramBlocks('结果是 +- 3')).toBe('结果是 +- 3')
  })
})
