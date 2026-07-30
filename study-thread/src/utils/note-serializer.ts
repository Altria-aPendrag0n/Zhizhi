/**
 * 笔记序列化器
 *
 * 将 ExtractedNote 数据序列化为 Markdown 文件格式，
 * 用于写入 vault 的 notes/ 目录。
 */

import type { ExtractedNote } from '../types'

/**
 * 清理文件名，移除 Windows 不允许的字符
 */
function sanitizeFileName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 80)
}

/**
 * 将笔记数据序列化为 Markdown 格式
 *
 * @param note - 提取的笔记数据
 * @param sourceSession - 来源会话路径
 * @param highlightSource - 来源划线文本
 * @returns Markdown 格式的笔记内容
 */
export function serializeNote(
  note: ExtractedNote,
  sourceSession: string,
  highlightSource: string,
): string {
  const now = new Date().toISOString()
  const lines: string[] = []

  // YAML frontmatter
  lines.push('---')
  lines.push(`title: ${note.title}`)
  lines.push(`type: ${note.type}`)
  lines.push('tags:')
  for (const tag of note.tags) {
    lines.push(`  - ${tag}`)
  }
  lines.push(`created: ${now}`)
  lines.push(`updated: ${now}`)
  lines.push(`source:`)
  lines.push(`  session: ${sourceSession}`)
  lines.push(`  highlight: "${highlightSource.replace(/"/g, '\\"')}"`)
  lines.push(`confidence: ${note.confidence}`)
  lines.push('---')
  lines.push('')

  // Body
  lines.push(`# ${note.title}`)
  lines.push('')
  lines.push('## 核心命题')
  lines.push('')
  lines.push(note.proposition)
  lines.push('')
  lines.push('## 解释')
  lines.push('')
  lines.push(note.explanation)
  lines.push('')
  lines.push('## 关联笔记')
  lines.push('')
  lines.push('<!-- 关联笔记将在此处自动生成 -->')

  return lines.join('\n')
}

/**
 * 生成笔记文件的文件名
 * 格式: {sanitized_title}.md
 */
export function generateNoteFileName(title: string): string {
  return `${sanitizeFileName(title)}.md`
}