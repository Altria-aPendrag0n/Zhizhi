import { describe, it, expect, vi } from 'vitest'
import { parseWikiLinks, extractAllLinks, renderWikiLink, resolveWikiLinkTarget } from './wikilink'
import type { WikiLink } from './wikilink'

// Mock vault-fs 模块
vi.mock('../utils/vault-fs', () => ({
  fileExists: vi.fn(),
}))

describe('parseWikiLinks', () => {
  it('解析简单链接 [[simple]]', () => {
    const links = parseWikiLinks('[[simple]]')
    expect(links).toHaveLength(1)
    expect(links[0].target).toBe('simple')
    expect(links[0].alias).toBeNull()
    expect(links[0].raw).toBe('[[simple]]')
  })

  it('解析带别名的链接 [[note|显示文本]]', () => {
    const links = parseWikiLinks('[[note|显示文本]]')
    expect(links).toHaveLength(1)
    expect(links[0].target).toBe('note')
    expect(links[0].alias).toBe('显示文本')
  })

  it('解析带路径的链接 [[folder/subnote]]', () => {
    const links = parseWikiLinks('[[folder/subnote]]')
    expect(links).toHaveLength(1)
    expect(links[0].target).toBe('folder/subnote')
  })

  it('解析一行中多个链接 [[a]] [[b]] [[c]]', () => {
    const links = parseWikiLinks('[[a]] [[b]] [[c]]')
    expect(links).toHaveLength(3)
    expect(links.map(l => l.target)).toEqual(['a', 'b', 'c'])
  })

  it('不匹配不完整的 [[only', () => {
    const links = parseWikiLinks('[[only')
    expect(links).toHaveLength(0)
  })

  it('解析带锚点的链接 [[note#heading]]', () => {
    const links = parseWikiLinks('[[费曼学习法#核心观点]]')
    expect(links).toHaveLength(1)
    expect(links[0].target).toBe('费曼学习法')
    expect(links[0].alias).toBe('核心观点')
  })

  it('记录正确的位置信息', () => {
    const text = '参考 [[费曼学习法]] 了解更多'
    const links = parseWikiLinks(text)
    expect(links).toHaveLength(1)
    expect(links[0].start).toBe(text.indexOf('[['))
    expect(links[0].end).toBe(text.indexOf(']]') + 2)
  })

  it('跳过空目标 [[]]', () => {
    const links = parseWikiLinks('[[]]')
    expect(links).toHaveLength(0)
  })

  it('解析中文链接 [[中文笔记名]]', () => {
    const links = parseWikiLinks('[[费曼学习法]]和[[间隔重复|SR]]')
    expect(links).toHaveLength(2)
    expect(links[0].target).toBe('费曼学习法')
    expect(links[1].target).toBe('间隔重复')
    expect(links[1].alias).toBe('SR')
  })

  it('处理空字符串', () => {
    const links = parseWikiLinks('')
    expect(links).toHaveLength(0)
  })

  it('处理没有 wikilink 的文本', () => {
    const links = parseWikiLinks('这是一段普通文本')
    expect(links).toHaveLength(0)
  })
})

describe('extractAllLinks', () => {
  it('提取所有链接目标并去重', () => {
    const text = '[[a]] [[b]] [[a]] [[c]]'
    const targets = extractAllLinks(text)
    expect(targets).toEqual(['a', 'b', 'c'])
  })

  it('无链接时返回空数组', () => {
    const targets = extractAllLinks('普通文本')
    expect(targets).toEqual([])
  })
})

describe('renderWikiLink', () => {
  const link: WikiLink = {
    raw: '[[费曼学习法]]',
    target: '费曼学习法',
    alias: null,
    start: 0,
    end: 10,
  }

  it('已解析的链接渲染正确', () => {
    const html = renderWikiLink(link, true)
    expect(html).toContain('wikilink--resolved')
    expect(html).toContain('费曼学习法')
    expect(html).toContain('href="#/notes/')
  })

  it('未解析的链接渲染正确', () => {
    const html = renderWikiLink(link, false)
    expect(html).toContain('wikilink--unresolved')
    expect(html).toContain('href="#"')
  })

  it('带别名的链接使用别名显示', () => {
    const aliasLink: WikiLink = { ...link, alias: '费曼' }
    const html = renderWikiLink(aliasLink, true)
    expect(html).toContain('>费曼<')
  })
})
describe('resolveWikiLinkTarget', () => {
  const notes = [
    { path: 'C:/vault/notes/学习/费曼学习法.md', title: '费曼学习法' },
    { path: 'C:/vault/notes/间隔重复.md', title: '间隔重复' },
  ]

  it('按标题解析到真实 Vault note.path', () => {
    expect(resolveWikiLinkTarget('费曼学习法', notes)?.path).toBe('C:/vault/notes/学习/费曼学习法.md')
  })

  it('按相对路径解析到真实 Vault note.path', () => {
    expect(resolveWikiLinkTarget('学习/费曼学习法', notes)?.path).toBe('C:/vault/notes/学习/费曼学习法.md')
  })

  it('未解析的目标返回 null', () => {
    expect(resolveWikiLinkTarget('不存在', notes)).toBeNull()
  })
})