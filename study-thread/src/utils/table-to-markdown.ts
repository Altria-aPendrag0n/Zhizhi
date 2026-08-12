/**
 * 渲染后表格 DOM → Markdown 表格
 *
 * 会话划线摘录时，`window.getSelection().toString()` 返回的是渲染后文本节点，
 * 不含 Markdown 表格的 `|` 分隔标志，导致摘录进笔记后表格退化为纯文本。
 * 本工具把选区命中的整张表格 DOM 还原为带 `|` 分隔与表头分隔行的 Markdown 表格。
 */

/** 单元格内联标记还原：加粗/斜体/代码/换行/链接 → markdown 标记 */
function cellToMarkdown(cell: HTMLTableCellElement): string {
  let html = cell.innerHTML.trim()

  html = html.replace(/<br\s*\/?>/gi, ' ')
  html = html.replace(/<strong>/gi, '**').replace(/<\/strong>/gi, '**')
  html = html.replace(/<b>/gi, '**').replace(/<\/b>/gi, '**')
  html = html.replace(/<em>/gi, '*').replace(/<\/em>/gi, '*')
  html = html.replace(/<i>/gi, '*').replace(/<\/i>/gi, '*')
  html = html.replace(/<code>/gi, '`').replace(/<\/code>/gi, '`')
  // 链接：http(s) 保留为 [text](href)；其余（如划线虚线链接）只留文本
  html = html.replace(/<a\s+[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
  html = html.replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, '$1')
  // 剥离剩余标签
  html = html.replace(/<[^>]+>/g, '')
  // 反转义常见 HTML 实体
  html = html
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
  // 折叠内部空白（表格单元格不支持多行）
  html = html.replace(/\s+/g, ' ').trim()
  // 单元格内的字面 | 是表格列分隔符，必须转义为 \|，否则摘录源码会把单元格拆成多列
  html = html.replace(/\|/g, '\\|')
  return html
}

/**
 * 从节点向上查找最近的单元格（td/th）；不在单元格内返回 null
 */
export function findContainingCell(node: Node): HTMLElement | null {
  const el = node.nodeType === Node.ELEMENT_NODE
    ? (node as Element)
    : node.parentElement
  return el?.closest('td, th') ?? null
}

/**
 * 判断选区是否完全位于单个表格单元格内。
 *
 * 划线落在表格内时区分两种摘录：
 * - 单个单元格内划线（如只划「托卡马克」几个字）→ 摘录选区文字本身，
 *   否则会把表格格式（`|` 分隔符、表头分隔行）误当成划线内容；
 * - 跨单元格/跨行（划整张表格）→ 整表还原为 Markdown 表格保留结构。
 */
export function isSelectionWithinSingleCell(range: Range): boolean {
  const startCell = findContainingCell(range.startContainer)
  const endCell = findContainingCell(range.endContainer)
  const ancestorCell = findContainingCell(range.commonAncestorContainer)
  return startCell !== null && startCell === endCell && startCell === ancestorCell
}

/**
 * 将渲染后的表格 DOM 转回 Markdown 表格
 *
 * @param table - 渲染后的 `<table>` 元素
 * @returns 带 `|` 分隔符的 Markdown 表格文本；无行时返回空串
 */
export function tableToMarkdown(table: HTMLTableElement): string {
  const rows = Array.from(table.querySelectorAll('tr')).filter(
    (row) => row.querySelectorAll<HTMLTableCellElement>('th, td').length > 0,
  )
  if (rows.length === 0) return ''

  const lines: string[] = []
  let headerCols = 0

  rows.forEach((row, rowIndex) => {
    const cells = Array.from(row.querySelectorAll<HTMLTableCellElement>('th, td'))
    lines.push(`| ${cells.map(cellToMarkdown).join(' | ')} |`)

    // 表头分隔行：thead 内的行，或全为 th 的首行
    const isHeader = row.closest('thead') !== null
      || (rowIndex === 0 && cells.every((cell) => cell.tagName === 'TH'))
    if (isHeader && headerCols === 0) {
      headerCols = cells.length
      lines.push(`| ${Array.from({ length: headerCols }, () => '---').join(' | ')} |`)
    }
  })

  return lines.join('\n')
}
