/**
 * 渲染后 DOM 高亮工具
 *
 * 把渲染后的 HTML 中的划线文本包裹为高亮标签（虚线链接 / 分叉点高亮）。
 *
 * 不能在 markdown 源中直接插入标签：当划线文本位于 `**加粗**` / `*斜体*` 等
 * 行内标记内部或跨标记边界时，marked 无法让 delimiter 跨 HTML 标签配对，语法会
 * 被破坏（`**` 变成字面文本）。因此先由 marked 渲染出完整 HTML，再用 TreeWalker
 * 遍历文本节点，拼接全部文本定位划线文本的起止区间，把覆盖该区间的每个文本节点
 * 切分并合并进同一个包裹标签——保证划线文本位于单个文本节点内、跨加粗/斜体边界
 * 时都能正确显示高亮。
 */

/**
 * 把 body 内首次出现的 highlight 包裹为 `<tagName class="className">`。
 *
 * @returns 包裹元素（调用方可设置 dataset 等属性）；定位不到返回 null
 */
export function wrapHighlightInDOM(
  body: Element,
  highlight: string,
  tagName: 'span' | 'mark' | 'a' = 'span',
  className = '',
): HTMLElement | null {
  // 收集全部文本节点并拼接，建立「拼接偏移 → 文本节点」的映射
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT)
  const nodeRanges: { node: Text; start: number; end: number }[] = []
  let full = ''
  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    const text = node.nodeValue || ''
    if (!text) continue
    nodeRanges.push({ node, start: full.length, end: full.length + text.length })
    full += text
  }
  if (full.length === 0) return null

  const start = full.indexOf(highlight)
  if (start === -1) return null
  const end = start + highlight.length

  // 找出覆盖 [start, end) 的连续文本节点
  const matched: { node: Text; from: number; to: number }[] = []
  for (const range of nodeRanges) {
    if (range.end <= start || range.start >= end) continue
    matched.push({
      node: range.node,
      from: Math.max(range.start, start) - range.start,
      to: Math.min(range.end, end) - range.start,
    })
  }
  if (matched.length === 0) return null

  const wrapper = document.createElement(tagName)
  if (className) wrapper.className = className

  for (let i = 0; i < matched.length; i++) {
    const { node, from, to } = matched[i]
    let part: Text
    if (i === 0) {
      // 第一个节点：从 from 处切开，取 [from, …)
      const rest = node.splitText(from)
      if (i === matched.length - 1) {
        // 同时是最后一个节点：再切到 to，rest 变为 [from, to)（splitText 的返回值是后半段，丢弃）
        rest.splitText(to - from)
      }
      part = rest
    } else if (i === matched.length - 1) {
      // 最后一个节点：切掉 [to, …) 后缀（splitText 返回值是后半段，丢弃），整节点前半段 [0, to) 移入包裹
      node.splitText(to)
      part = node
    } else {
      // 中间节点：整个节点移入包裹
      part = node
    }
    if (i === 0) part.parentNode?.insertBefore(wrapper, part)
    wrapper.appendChild(part)
  }
  return wrapper
}

/** 移除 body 内所有 `<tagName class="className">` 包裹标签（unwrap），保证重复应用幂等 */
export function unwrapHighlight(body: Element, tagName: string, className: string): void {
  body.querySelectorAll(`${tagName}.${className}`).forEach((wrapper) => {
    const parent = wrapper.parentNode
    if (!parent) return
    while (wrapper.firstChild) parent.insertBefore(wrapper.firstChild, wrapper)
    wrapper.remove()
  })
}
