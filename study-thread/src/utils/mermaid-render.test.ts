import { describe, it, expect, vi, beforeEach } from 'vitest'
import mermaid from 'mermaid'
import { renderMermaidBlocks } from './mermaid-render'

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(),
  },
}))

function createRoot(html: string): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = html
  return root
}

describe('renderMermaidBlocks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('将 mermaid 代码块替换为 SVG 容器', async () => {
    vi.mocked(mermaid.render).mockResolvedValue({ svg: '<svg class="mock-svg"></svg>', diagramType: 'flowchart' })
    const root = createRoot('<pre><code class="language-mermaid">graph TD\nA--&gt;B</code></pre>')

    await renderMermaidBlocks(root)

    expect(mermaid.render).toHaveBeenCalledTimes(1)
    expect(mermaid.render).toHaveBeenCalledWith(expect.stringContaining('zhizhi-mermaid-'), 'graph TD\nA-->B')
    expect(root.querySelector('pre')).toBeNull()
    const container = root.querySelector<HTMLElement>('.zhizhi-mermaid')
    expect(container).not.toBeNull()
    expect(container?.innerHTML).toContain('mock-svg')
  })

  it('渲染失败时保留原始代码块', async () => {
    vi.mocked(mermaid.render).mockRejectedValue(new Error('parse failed'))
    const root = createRoot('<pre><code class="language-mermaid">invalid diagram</code></pre>')

    await renderMermaidBlocks(root)

    expect(root.querySelector('pre code.language-mermaid')).not.toBeNull()
    expect(root.querySelector('.zhizhi-mermaid')).toBeNull()
  })

  it('无 mermaid 代码块时不调用渲染', async () => {
    const root = createRoot('<p>普通内容</p><pre><code class="language-js">console.log(1)</code></pre>')

    await renderMermaidBlocks(root)

    expect(mermaid.render).not.toHaveBeenCalled()
    expect(root.querySelector('.zhizhi-mermaid')).toBeNull()
  })
})
