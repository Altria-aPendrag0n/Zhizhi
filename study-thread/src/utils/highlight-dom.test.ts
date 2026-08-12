import { describe, it, expect, beforeEach } from 'vitest'
import { wrapHighlightInDOM, unwrapHighlight, isTableHighlight, wrapTableInDOM } from './highlight-dom'

function renderToBody(html: string): HTMLDivElement {
  const div = document.createElement('div')
  div.innerHTML = html
  return div
}

describe('wrapHighlightInDOM', () => {
  let body: HTMLDivElement

  beforeEach(() => {
    body = renderToBody('<p>普通文本 划线词 结束</p>')
  })

  it('单个文本节点内匹配并包裹', () => {
    const wrapper = wrapHighlightInDOM(body, '划线词', 'a', 'zhizhi-mark')
    expect(wrapper).not.toBeNull()
    expect(wrapper?.textContent).toBe('划线词')
    expect(wrapper?.tagName).toBe('A')
    expect(body.innerHTML).toContain('普通文本 <a class="zhizhi-mark">划线词</a> 结束')
  })

  it('跨文本节点（加粗边界）匹配并合并包裹', () => {
    body = renderToBody('<p>名字——<strong>"富贵虾"</strong>，听起来</p>')
    const wrapper = wrapHighlightInDOM(body, '——"富贵虾"', 'mark', 'fork-highlight')
    expect(wrapper).not.toBeNull()
    expect(wrapper?.textContent).toBe('——"富贵虾"')
    expect(body.innerHTML).toContain('<mark class="fork-highlight">——"富贵虾"</mark>')
  })

  it('跨三个节点（前文本 + 加粗 + 后文本）时完整覆盖', () => {
    body = renderToBody('<p>甲<strong>乙</strong>丙</p>')
    const wrapper = wrapHighlightInDOM(body, '甲乙丙', 'mark', 'fork-highlight')
    expect(wrapper).not.toBeNull()
    expect(wrapper?.textContent).toBe('甲乙丙')
    expect(body.innerHTML).toContain('<mark class="fork-highlight">甲乙丙</mark>')
  })

  it('定位不到时返回 null 且不修改 DOM', () => {
    const before = body.innerHTML
    const wrapper = wrapHighlightInDOM(body, '不存在的文本', 'mark', 'fork-highlight')
    expect(wrapper).toBeNull()
    expect(body.innerHTML).toBe(before)
  })

  it('重复包裹前先 unwrap 可保持幂等', () => {
    wrapHighlightInDOM(body, '划线词', 'mark', 'fork-highlight')
    const first = body.innerHTML
    expect(first).toContain('<mark class="fork-highlight">划线词</mark>')

    unwrapHighlight(body, 'mark', 'fork-highlight')
    expect(body.innerHTML).not.toContain('fork-highlight')

    wrapHighlightInDOM(body, '划线词', 'mark', 'fork-highlight')
    expect(body.innerHTML).toBe(first)
  })
})

describe('isTableHighlight', () => {
  it('多行且每行以 | 开头时判定为表格划线', () => {
    expect(isTableHighlight('| 名称 | 说明 |\n| --- | --- |\n| 皮皮虾 | 口虾蛄 |')).toBe(true)
  })

  it('单行或普通文本不是表格划线', () => {
    expect(isTableHighlight('| 名称 | 说明 |')).toBe(false)
    expect(isTableHighlight('普通文本')).toBe(false)
    expect(isTableHighlight('')).toBe(false)
  })
})

describe('wrapTableInDOM', () => {
  it('把渲染表格整体包裹为标记元素，不拆分内部节点', () => {
    const body = renderToBody('<p>开头</p><table><tbody><tr><td>名称</td><td>说明</td></tr><tr><td>皮皮虾</td><td>口虾蛄</td></tr></tbody></table><p>结尾</p>')
    const wrapper = wrapTableInDOM(body, 'mark', 'fork-highlight')
    expect(wrapper).not.toBeNull()
    expect(wrapper?.tagName).toBe('MARK')
    expect(body.innerHTML).toContain('<mark class="fork-highlight"><table>')
    // 表格结构未被拆分：wrapper 内仍是完整 <table>
    expect(body.querySelector('mark.fork-highlight table')).not.toBeNull()
    expect(body.querySelector('mark.fork-highlight table tbody')?.childElementCount).toBe(2)
  })

  it('无表格时返回 null', () => {
    const body = renderToBody('<p>没有表格</p>')
    expect(wrapTableInDOM(body, 'mark', 'fork-highlight')).toBeNull()
  })

  it('unwrap 后表格恢复原位，重复包裹幂等', () => {
    const body = renderToBody('<table><tbody><tr><td>甲</td><td>乙</td></tr></tbody></table>')
    wrapTableInDOM(body, 'mark', 'fork-highlight')
    const wrapped = body.innerHTML
    expect(wrapped).toContain('<mark class="fork-highlight">')

    unwrapHighlight(body, 'mark', 'fork-highlight')
    expect(body.innerHTML).not.toContain('fork-highlight')
    expect(body.innerHTML).toContain('<table>')

    wrapTableInDOM(body, 'mark', 'fork-highlight')
    expect(body.innerHTML).toBe(wrapped)
  })
})
