/**
 * 会话-笔记反链工具
 *
 * 管理笔记与来源会话之间的双向链接关系。
 */

import { readFile } from './vault-fs'
import { parseFrontmatter } from '../parser/frontmatter'
import type { NoteMeta } from '../types'

/**
 * 会话中的笔记引用
 */
export interface NoteReference {
  path: string
  title: string
  messageIndex: number
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
 * 从会话 Markdown 文件中提取生成的笔记引用
 * 查找 > 已生成笔记: [[note-title]] 格式的行
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

    // 检测笔记引用
    const noteRefMatch = line.match(/已生成笔记:\s*\[\[(.+?)\]\]/)
    if (noteRefMatch && currentMessageIndex >= 0) {
      refs.push({
        path: `notes/${noteRefMatch[1]}.md`,
        title: noteRefMatch[1],
        messageIndex: currentMessageIndex,
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