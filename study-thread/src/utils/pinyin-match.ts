/**
 * 拼音匹配工具
 *
 * 为笔记标签/标题筛选提供"单字匹配 + 拼音匹配"能力：
 * - 输入中文（如 '虾'）按子串匹配，命中所有包含该字的标签；
 * - 输入拼音（全拼如 'xia'、首字母缩写如 'dsx'）命中对应中文标签。
 */

import { pinyin } from 'pinyin-pro'

/** 标签/文本 → 拼音匹配变体的缓存（同一文本只需转换一次） */
const variantCache = new Map<string, string[]>()

/**
 * 将文本转为拼音匹配变体：
 * - 全拼（无音调、紧凑）：'淡水虾' → 'danshuixia'
 * - 首字母缩写：'淡水虾' → 'dsx'
 * 非中文字符（英文/数字）原样保留，便于查询同时命中中英文内容。
 */
export function toPinyinVariants(text: string): string[] {
  const cached = variantCache.get(text)
  if (cached) return cached

  const full = pinyin(text, { toneType: 'none', type: 'array', v: true, nonZh: 'consecutive' })
    .join('')
    .replace(/\s+/g, '')
  const first = pinyin(text, { pattern: 'first', toneType: 'none', type: 'array', v: true, nonZh: 'consecutive' })
    .join('')
    .replace(/\s+/g, '')

  const variants = [...new Set([full, first].filter(Boolean))]
  variantCache.set(text, variants)
  return variants
}

/**
 * 判断文本（标签/标题）是否匹配查询词：
 * - 查询为纯字母/数字时按拼音匹配（原文包含也命中），如 'xia'、'dsx'；
 * - 其他查询（中文等）按子串匹配，实现"单字匹配"（输入 '虾' 命中所有含 '虾' 的标签）。
 */
export function tagMatchesQuery(text: string, query: string): boolean {
  const q = query.toLowerCase().trim()
  if (!q) return true

  const lower = text.toLowerCase()
  if (lower.includes(q)) return true

  // 纯字母/数字输入视为拼音查询（英文标签/标题已在上面原文命中）
  if (/^[a-z0-9]+$/i.test(q)) {
    return toPinyinVariants(text).some((v) => v.toLowerCase().includes(q))
  }
  return false
}
