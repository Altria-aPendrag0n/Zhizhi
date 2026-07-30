/**
 * Frontmatter 解析器
 *
 * 解析 Markdown 文件的 YAML frontmatter 块（--- ... ---）。
 *
 * 用法:
 * ```
 * import { parseFrontmatter } from '@/parser/frontmatter'
 *
 * const { meta, body } = parseFrontmatter(content)
 * // meta = { title: '...', type: '...', tags: [...] }
 * // body = '# 标题\n\n正文内容...'
 * ```
 */

import * as yaml from 'js-yaml'

/**
 * 解析 frontmatter 的结果
 */
export interface FrontmatterResult {
  /** 解析后的元数据 */
  meta: Record<string, unknown>
  /** 移除 frontmatter 后的正文内容 */
  body: string
}

/**
 * 解析 Markdown 文件的 YAML frontmatter
 *
 * @param content - 完整的 Markdown 文件内容
 * @returns 解析后的元数据和正文
 */
export function parseFrontmatter(content: string): FrontmatterResult {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/
  const match = content.match(frontmatterRegex)

  if (!match) {
    return { meta: {}, body: content }
  }

  const frontmatterStr = match[1]
  let meta: Record<string, unknown> = {}

  try {
    const parsed = yaml.load(frontmatterStr)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      meta = parsed as Record<string, unknown>
    }
  } catch {
    // frontmatter 解析失败时返回空 meta
    meta = {}
  }

  const body = content.slice(match[0].length)

  return { meta, body }
}