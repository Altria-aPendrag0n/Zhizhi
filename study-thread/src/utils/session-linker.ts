/**
 * 会话-笔记反链工具
 *
 * 管理笔记与来源会话之间的双向链接关系。
 */

import { readFile } from './vault-fs'
import { parseFrontmatter } from '../parser/frontmatter'
import type { NoteMeta } from '../types'

/**
 * 会话中的划线引用（笔记或分支）
 */
export interface NoteReference {
  path: string
  title: string
  messageIndex: number
  /** 划线文本（用于在原会话消息中以虚线标记并跳转） */
  highlight?: string
  /** 引用类型：笔记（默认）或分支 */
  kind?: 'note' | 'branch'
}

/**
 * 从笔记文件读取来源会话信息
 */
export async function getNoteSourceSession(
  notePath: string,
): Promise<{ sessionPath: string; highlight: string } | null> {
  try {
    const content = await readFile(notePath)
    const { meta } = parseFrontmatter(content)
    const source = meta.source as { session?: string; highlight?: string } | undefined
    if (source?.session) {
      return {
        sessionPath: source.session,
        highlight: source.highlight || '',
      }
    }
    return null
  } catch {
    return null
  }
}

/**
 * 从会话 Markdown 文件中提取生成的笔记/分支引用
 *
 * 格式：
 *   > 已生成笔记: [[path|title]] 划线「划线文本」
 *   > 已生成分支: [[branchId|title]] 划线「划线文本」
 * 向后兼容无划线文本的旧格式（highlight 为空）。
 */
export function extractNoteRefsFromSession(sessionContent: string): NoteReference[] {
  const refs: NoteReference[] = []
  const lines = sessionContent.split('\n')
  let currentMessageIndex = -1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // 检测消息分界
    const msgMatch = line.match(/^## (?:用户|知枝|系统)/)
    if (msgMatch) {
      currentMessageIndex++
      continue
    }

    // 检测笔记/分支引用（含可选划线文本）
    const refMatch = line.match(/已生成(笔记|分支):\s*\[\[(.+?)\]\](?:\s*划线「(.+?)」)?/)
    if (refMatch && currentMessageIndex >= 0) {
      const kind = refMatch[1] === '分支' ? 'branch' : 'note'
      const reference = refMatch[2]
      const separatorIndex = reference.indexOf('|')
      const path = separatorIndex >= 0 ? reference.slice(0, separatorIndex) : reference
      const title = separatorIndex >= 0 ? reference.slice(separatorIndex + 1) : reference.split('/').pop()?.replace(/\.md$/, '') || reference
      const highlight = refMatch[3]
      refs.push({
        path,
        title,
        messageIndex: currentMessageIndex,
        kind,
        ...(highlight ? { highlight } : {}),
      })
    }
  }

  return refs
}

/**
 * 扫描 vault 中所有笔记，查找引用指定会话的笔记
 */
export async function findNotesBySession(
  sessionPath: string,
  allNotes: NoteMeta[],
): Promise<NoteMeta[]> {
  return allNotes.filter((note) => note.source?.session === sessionPath)
}