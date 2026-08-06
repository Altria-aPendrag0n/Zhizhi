import { describe, it, expect } from 'vitest'
import { marked } from 'marked'
import { preprocessMarkdownForRendering } from './markdown-preprocess'

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
