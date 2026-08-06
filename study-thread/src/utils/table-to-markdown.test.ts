import { describe, it, expect } from 'vitest'
import { tableToMarkdown } from './table-to-markdown'

function renderTable(html: string): HTMLTableElement {
  const table = document.createElement('table')
  table.innerHTML = html
  return table
}

describe('tableToMarkdown', () => {
  it('基础表带表头分隔行', () => {
    const table = renderTable(
      '<thead><tr><th>名称</th><th>说明</th></tr></thead><tbody><tr><td>皮皮虾</td><td>口虾蛄</td></tr></tbody>',
    )
    expect(tableToMarkdown(table)).toBe('| 名称 | 说明 |\n| --- | --- |\n| 皮皮虾 | 口虾蛄 |')
  })

  it('单元格内加粗与代码还原为 markdown 标记', () => {
    const table = renderTable('<tr><td><strong>"濑尿虾"</strong></td><td><code>O. oratoria</code></td></tr>')
    expect(tableToMarkdown(table)).toBe('| **"濑尿虾"** | `O. oratoria` |')
  })

  it('单元格内换行折叠为空格', () => {
    const table = renderTable('<tr><td>第一行<br>第二行</td><td>值</td></tr>')
    expect(tableToMarkdown(table)).toBe('| 第一行 第二行 | 值 |')
  })

  it('无 thead 时全 th 的首行视为表头', () => {
    const table = renderTable('<tr><th>a</th><th>b</th></tr><tr><td>1</td><td>2</td></tr>')
    expect(tableToMarkdown(table)).toBe('| a | b |\n| --- | --- |\n| 1 | 2 |')
  })

  it('http 链接保留为 [text](href)', () => {
    const table = renderTable('<tr><td><a href="https://example.com/x">示例</a></td><td>值</td></tr>')
    expect(tableToMarkdown(table)).toBe('| [示例](https://example.com/x) | 值 |')
  })

  it('单元格内字面 | 转义为 \\|，避免摘录源码拆列', () => {
    const table = renderTable('<tr><td>皮皮虾</td><td>濑尿虾 | 富贵虾</td></tr>')
    expect(tableToMarkdown(table)).toBe('| 皮皮虾 | 濑尿虾 \\| 富贵虾 |')
  })

  it('无任何行时返回空串', () => {
    const table = renderTable('')
    expect(tableToMarkdown(table)).toBe('')
  })
})
