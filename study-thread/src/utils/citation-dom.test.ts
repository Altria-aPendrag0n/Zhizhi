import { describe, it, expect } from 'vitest'
import { resolveCitationMarkers, usedCitations, applyCitationMarkers } from './citation-dom'
import type { CitationSource } from '../types'

const sources: CitationSource[] = [
  { index: 1, kind: 'note', path: '/vault/notes/a.md', title: '笔记A', snippet: '笔记A片段' },
  {
    index: 2,
    kind: 'reference',
    path: '/vault/references/b.json',
    title: '参考B',
    snippet: '参考B片段',
    pageFrom: 2,
    pageTo: 3,
  },
]

function el(html: string): HTMLElement {
  const div = document.createElement('div')
  div.innerHTML = html
  return div
}

describe('resolveCitationMarkers', () => {
  it('提取合法编号并按出现顺序去重', () => {
    expect(resolveCitationMarkers('前文 [2] 中段 [1] 再 [2] 尾', sources)).toEqual([2, 1])
  })

  it('编造/越界/零与超长编号被忽略', () => {
    expect(resolveCitationMarkers('[9] [0] [3] [123] [abc] [1]', sources)).toEqual([1])
  })

  it('无标记或空来源返回空数组', () => {
    expect(resolveCitationMarkers('没有标记的正文', sources)).toEqual([])
    expect(resolveCitationMarkers('[1]', [])).toEqual([])
    expect(resolveCitationMarkers('', sources)).toEqual([])
  })

  it('usedCitations 只保留被引用的来源', () => {
    expect(usedCitations('答案 [2]', sources)).toEqual([sources[1]])
    expect(usedCitations('答案 [2] 和 [1]', sources)).toEqual(sources)
    expect(usedCitations('没有引用', sources)).toEqual([])
  })
})

describe('applyCitationMarkers', () => {
  it('正文 [n] 替换为可点击角标 sup 元素并携带 data 属性', () => {
    const body = el('<p>间隔重复的原理如下 [1]，详见资料 [2]。</p>')
    applyCitationMarkers(body, sources)
    const sups = Array.from(body.querySelectorAll<HTMLElement>('sup.zhizhi-citation'))
    expect(sups).toHaveLength(2)
    expect(sups[0].textContent).toBe('[1]')
    expect(sups[0].dataset.citationIndex).toBe('1')
    expect(sups[1].dataset.citationIndex).toBe('2')
    expect(body.querySelector('p')?.textContent).toContain('间隔重复的原理如下 [1]')
  })

  it('编造/越界编号保持普通文本不替换', () => {
    const body = el('<p>这是编造的 [9] 与越界的 [3]。</p>')
    applyCitationMarkers(body, sources)
    expect(body.querySelectorAll('sup.zhizhi-citation')).toHaveLength(0)
    expect(body.textContent).toContain('[9]')
    expect(body.textContent).toContain('[3]')
  })

  it('代码块与链接内的 [n] 不替换', () => {
    const body = el(
      '<p>正文 [1] <code>数组 [1] 写法</code> <a href="#">链接 [2]</a><pre>代码块 [1]</pre></p>',
    )
    applyCitationMarkers(body, sources)
    // 仅正文一处被替换
    expect(body.querySelectorAll('sup.zhizhi-citation')).toHaveLength(1)
    expect(body.querySelector('code')?.textContent).toBe('数组 [1] 写法')
    expect(body.querySelector('a')?.textContent).toBe('链接 [2]')
    expect(body.querySelector('pre')?.textContent).toContain('代码块 [1]')
  })

  it('重复调用幂等：角标不会被二次处理', () => {
    const body = el('<p>正文 [1] 与 [2]。</p>')
    applyCitationMarkers(body, sources)
    applyCitationMarkers(body, sources)
    expect(body.querySelectorAll('sup.zhizhi-citation')).toHaveLength(2)
    expect(body.textContent).toContain('正文 [1] 与 [2]。')
  })

  it('空来源时不做任何替换', () => {
    const body = el('<p>正文 [1]</p>')
    applyCitationMarkers(body, [])
    expect(body.querySelector('p')?.innerHTML).toBe('正文 [1]')
  })
})
