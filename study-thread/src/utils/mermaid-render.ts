import type { Mermaid } from 'mermaid'

let instance: Mermaid | null = null
let seq = 0

/**
 * 懒加载 mermaid 并初始化（startOnLoad 关闭，由我们显式调用渲染）。
 * 首次出现 mermaid 代码块时才加载，避免拖慢首屏。
 */
async function loadMermaid(): Promise<Mermaid> {
  if (!instance) {
    const mod = await import('mermaid')
    instance = mod.default
    instance.initialize({
      startOnLoad: false,
      theme: 'default',
      securityLevel: 'strict',
    })
  }
  return instance
}

/**
 * 在已渲染的 DOM 中查找 ```mermaid 代码块（marked 会输出为
 * `pre > code.language-mermaid`），调用 mermaid 渲染为 SVG 并替换原 `pre`。
 *
 * 渲染失败时保留原始代码块，避免整段内容丢失，用户仍可查看源码。
 * 该函数在 v-html 更新后（nextTick）调用，且应先于划线标记包裹执行。
 */
export async function renderMermaidBlocks(root: HTMLElement): Promise<void> {
  const blocks = Array.from(
    root.querySelectorAll<HTMLElement>('pre > code.language-mermaid'),
  )
  if (blocks.length === 0) return

  const mermaid = await loadMermaid()

  for (const codeEl of blocks) {
    const pre = codeEl.parentElement
    if (!pre) continue
    const code = (codeEl.textContent ?? '').trim()
    if (!code) continue
    try {
      const { svg } = await mermaid.render(`zhizhi-mermaid-${++seq}`, code)
      const container = document.createElement('div')
      container.className = 'zhizhi-mermaid'
      container.innerHTML = svg
      pre.replaceWith(container)
    } catch {
      // 保持原始代码块，便于查看/调试源码
    }
  }
}
