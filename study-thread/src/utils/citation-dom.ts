/**
 * 来源锚定：引用角标 DOM 后处理
 *
 * marked 渲染完成后，把正文文本节点中的合法引用标记 [n] 替换为可点击的
 * <sup class="zhizhi-citation"> 角标（n 必须在本次注入的来源编号集合内，
 * 编造/越界编号保持普通文本原样）。
 *
 * 与 applyMarkLinks 相同的「渲染后 DOM 处理」思路：不在 markdown 源中插入
 * 标签，避免破坏行内标记（加粗/斜体/代码）的语法配对，也规避代码块/链接
 * 内的 [n] 被误替换。
 */

import type { CitationSource } from '../types'

/**
 * 解析正文中的合法引用编号（按出现顺序去重）。
 * 仅保留 1 ≤ n ≤ sources 中最大编号且存在于来源集合的 [n]。
 */
export function resolveCitationMarkers(text: string, sources: CitationSource[]): number[] {
  if (sources.length === 0 || !text) return []
  const valid = new Set(sources.map((s) => s.index))
  const found: number[] = []
  const re = /\[(\d{1,3})\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const n = Number(m[1])
    if (valid.has(n) && !found.includes(n)) found.push(n)
  }
  return found
}

/** 过滤出正文中实际被引用的来源（来源列表/浮层展示用） */
export function usedCitations(text: string, sources: CitationSource[]): CitationSource[] {
  const used = new Set(resolveCitationMarkers(text, sources))
  return sources.filter((s) => used.has(s.index))
}

/** 角标替换不应进入的元素（代码/链接/已有角标/mermaid 图） */
const SKIP_SELECTOR = 'pre, code, a, sup.zhizhi-citation, .zhizhi-mermaid, script, style'

/**
 * 在渲染后的消息 DOM 上把合法 [n] 替换为角标元素。
 * 幂等：重复调用时已替换的角标（sup.zhizhi-citation 内文本节点）被跳过。
 */
export function applyCitationMarkers(body: HTMLElement, sources: CitationSource[]): void {
  if (!body || sources.length === 0) return
  const valid = new Set(sources.map((s) => s.index))
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT)
  const targets: { node: Text; matches: { start: number; end: number; index: number }[] }[] = []
  let current: Node | null
  while ((current = walker.nextNode())) {
    const textNode = current as Text
    const parent = textNode.parentElement
    if (!parent) continue
    if (parent.closest(SKIP_SELECTOR)) continue
    const text = textNode.data
    if (!text.includes('[')) continue
    const matches: { start: number; end: number; index: number }[] = []
    const re = /\[(\d{1,3})\]/g
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      const n = Number(m[1])
      if (valid.has(n)) matches.push({ start: m.index, end: m.index + m[0].length, index: n })
    }
    if (matches.length > 0) targets.push({ node: textNode, matches })
  }

  for (const { node, matches } of targets) {
    const frag = document.createDocumentFragment()
    const text = node.data
    let cursor = 0
    for (const match of matches) {
      if (match.start > cursor) {
        frag.appendChild(document.createTextNode(text.slice(cursor, match.start)))
      }
      const sup = document.createElement('sup')
      sup.className = 'zhizhi-citation'
      sup.dataset.citationIndex = String(match.index)
      sup.textContent = `[${match.index}]`
      frag.appendChild(sup)
      cursor = match.end
    }
    if (cursor < text.length) {
      frag.appendChild(document.createTextNode(text.slice(cursor)))
    }
    node.parentNode?.replaceChild(frag, node)
  }
}
