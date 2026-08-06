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
  lines.push(`description: "${(note.description ?? '').replace(/"/g, '\\"')}"`)
  lines.push(`type: ${note.type}`)
  lines.push('tags:')
  for (const tag of note.tags) {
    // 用 JSON 字符串序列化标签：标签可能含 `:`、`#` 等 YAML 特殊字符，
    // 裸写会被解析成对象/注释导致字段丢失
    lines.push(`  - ${JSON.stringify(tag)}`)
  }
  lines.push(`created: ${now}`)
  lines.push(`updated: ${now}`)
  lines.push(`source:`)
  lines.push(`  session: ${sourceSession}`)
  lines.push(`  highlight: "${highlightSource.replace(/"/g, '\\"')}"`)
  lines.push(`confidence: ${note.confidence}`)
  lines.push('---')
  lines.push('')

  // Body：划线原文原样保存，不加工
  lines.push(`# ${note.title}`)
  lines.push('')
  lines.push(highlightSource.trim())

  return lines.join('\n')
}

/**
 * 生成笔记文件的文件名
 * 格式: {sanitized_title}.md
 */
export function generateNoteFileName(title: string): string {
  return `${sanitizeFileName(title)}.md`
}