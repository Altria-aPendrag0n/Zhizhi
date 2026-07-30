/**
 * [[wikilink]] 语法解析器
 *
 * 解析 Obsidian 风格的 [[wikilink]] 语法，支持链接目标和别名。
 * 格式: [[target]] 或 [[target|alias]]
 *
 * 用法:
 * ```
 * import { parseWikiLinks, resolveWikiLink, extractAllLinks, renderWikiLink } from '@/parser/wikilink'
 *
 * const links = parseWikiLinks('参考 [[费曼学习法]] 和 [[间隔重复|SR]] 了解更多')
 * // links[0] = { raw: '[[费曼学习法]]', target: '费曼学习法', alias: null, start: 3, end: 13 }
 * // links[1] = { raw: '[[间隔重复|SR]]', target: '间隔重复', alias: 'SR', start: 16, end: 26 }
 * ```
 */

import { fileExists } from '../utils/vault-fs'

/**
 * WikiLink 数据结构
 */
export interface WikiLink {
  /** 原始匹配文本，如 [[费曼学习法]] */
  raw: string
  /** 链接目标（笔记文件名或路径） */
  target: string
  /** 显示别名，无别名时为 null */
  alias: string | null
  /** 在原文中的起始位置 */
  start: number
  /** 在原文中的结束位置 */
  end: number
}

/**
 * 解析文本中的所有 [[wikilink]]
 *
 * 支持格式:
 * - [[simple]] - 简单链接
 * - [[note|显示文本]] - 带别名的链接
 * - [[folder/subnote]] - 带路径的链接
 * - [[note#heading]] - 带锚点的链接
 *
 * 不匹配:
 * - 不完整的 [[only
 * - 转义的 \[\[escaped]]
 */
export function parseWikiLinks(text: string): WikiLink[] {
  const links: WikiLink[] = []
  // 匹配 [[target|alias]] 或 [[target]]
  const regex = /\[\[([^\]|#]+)(?:[|#]([^\]]+))?\]\]/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    const target = match[1].trim()
    const alias = match[2] ? match[2].trim() : null

    // 跳过空目标
    if (!target) continue

    links.push({
      raw: match[0],
      target,
      alias,
      start: match.index,
      end: match.index + match[0].length,
    })
  }

  return links
}

/**
 * 解析 wikilink 并返回目标在 vault 中的实际路径
 *
 * @param link - wikilink 对象
 * @param vaultPath - vault 根目录路径
 * @returns 完整文件路径，如果文件不存在则返回 null
 */
export async function resolveWikiLink(
  link: WikiLink,
  vaultPath: string,
): Promise<string | null> {
  // 尝试多种路径组合
  const candidates = [
    `${vaultPath}/notes/${link.target}.md`,
    `${vaultPath}/notes/${link.target}`,
    `${vaultPath}/${link.target}.md`,
    `${vaultPath}/${link.target}`,
  ]

  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return candidate
    }
  }

  return null
}

/**
 * 从文本中提取所有 wikilink 的目标（去重）
 *
 * @param text - 要解析的文本
 * @returns 去重后的链接目标列表
 */
export function extractAllLinks(text: string): string[] {
  const links = parseWikiLinks(text)
  const targets = links.map((l) => l.target)
  return [...new Set(targets)]
}

/**
 * 将 wikilink 渲染为 HTML 链接
 *
 * @param wikiLink - wikilink 对象
 * @param resolved - 是否已解析到实际文件
 * @returns HTML 字符串
 */
export function renderWikiLink(wikiLink: WikiLink, resolved: boolean): string {
  const display = wikiLink.alias || wikiLink.target
  const classNames = resolved ? 'wikilink wikilink--resolved' : 'wikilink wikilink--unresolved'
  const href = resolved
    ? `#/notes/${encodeURIComponent(wikiLink.target)}`
    : `#`
  return `<a class="${classNames}" href="${href}">${display}</a>`
}