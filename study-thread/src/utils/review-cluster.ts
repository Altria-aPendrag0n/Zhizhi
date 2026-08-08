/**
 * 图谱簇复习 —— 簇选择策略（P4-1）
 *
 * 以到期笔记为中心，取 wikilink / 反链 1 度邻居构成复习簇：
 * - 正向链接：中心笔记正文中的 [[wikilink]] 目标（复用 extractAllLinks + resolveWikiLinkTarget）
 * - 反向链接：其他笔记正文中引用了中心笔记（复用解析逻辑）
 * - 无邻居 → 退化为单条复习（保持 P2 行为）
 *
 * 簇成员按链接强度排序（双向 > 仅正向 > 仅反向；同强度按更新时间较新优先），
 * 超出上限时截断；返回结果始终包含中心笔记。
 */

import type { Note } from '../types'
import { extractAllLinks, parseWikiLinks, resolveWikiLinkTarget } from '../parser/wikilink'

/** 复习簇最大笔记数（含中心笔记，2-5 条区间内默认 5） */
export const MAX_CLUSTER_SIZE = 5

/** 单个笔记的链接强度：双向 2 / 仅正向或仅反向 1 / 无关 0 */
export function linkStrength(note: Note, outgoing: Set<string>, incoming: Set<string>): number {
  return (outgoing.has(note.path) ? 1 : 0) + (incoming.has(note.path) ? 1 : 0)
}

/**
 * 收集中心笔记的 1 度邻居（去重，按链接强度降序、同强度按更新时间较新优先）
 *
 * @param center - 中心笔记（被复习的到期笔记）
 * @param others - 其余笔记（不含中心）
 * @returns 排序后的邻居笔记列表
 */
export function collectOneHopNeighbors(center: Note, others: Note[]): Note[] {
  // 正向：中心笔记指向的笔记
  const outgoing = new Set<string>()
  for (const target of extractAllLinks(center.content)) {
    const resolved = resolveWikiLinkTarget(target, others)
    if (resolved) outgoing.add(resolved.path)
  }

  // 反向：其他笔记指向中心笔记
  const incoming = new Set<string>()
  for (const other of others) {
    const links = parseWikiLinks(other.content)
    if (links.some((link) => resolveWikiLinkTarget(link, [center])?.path === center.path)) {
      incoming.add(other.path)
    }
  }

  return others
    .filter((note) => outgoing.has(note.path) || incoming.has(note.path))
    .sort((a, b) => {
      const diff = linkStrength(b, outgoing, incoming) - linkStrength(a, outgoing, incoming)
      if (diff !== 0) return diff
      return (b.updated || '').localeCompare(a.updated || '')
    })
}

/**
 * 构建复习簇：以 notePath 为中心，返回中心笔记 + 1 度邻居（去重、按强度排序、截断）。
 * 无邻居时返回仅含中心笔记的单条复习（保持 P2 行为）。
 *
 * @param notePath - 被复习笔记路径（中心）
 * @param allNotes - vault 全部笔记
 * @param maxSize - 簇最大条数（含中心，默认 MAX_CLUSTER_SIZE=5；≤1 时仅返回中心）
 * @returns 簇内笔记（首位为中心），笔记不存在时返回空数组
 */
export function buildReviewCluster(notePath: string, allNotes: Note[], maxSize: number = MAX_CLUSTER_SIZE): Note[] {
  const center = allNotes.find((note) => note.path === notePath)
  if (!center) return []
  if (maxSize <= 1) return [center]

  const neighbors = collectOneHopNeighbors(center, allNotes.filter((note) => note.path !== notePath))
  return [center, ...neighbors].slice(0, maxSize)
}
