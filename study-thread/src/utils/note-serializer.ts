/**
 * 笔记序列化器
 *
 * 将 ExtractedNote 数据序列化为 Markdown 文件格式，
 * 用于写入 vault 的 notes/ 目录。
 */

import type { ExtractedNote, NoteMeta } from '../types'

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
 * @param sourceSession - 来源会话稳定 id（非文件路径）
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
  // 所有字符串字段用 JSON.stringify 序列化：既能转义引号，也能把多行文本（如表格划线）内的
  // 换行转义为 \n，避免 YAML 因裸换行导致整个 frontmatter 解析失败（曾因此丢失 tags 等字段）
  lines.push(`title: ${JSON.stringify(note.title)}`)
  lines.push(`description: ${JSON.stringify(note.description ?? '')}`)
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
  lines.push(`  session: ${JSON.stringify(sourceSession)}`)
  lines.push(`  highlight: ${JSON.stringify(highlightSource)}`)
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

/**
 * 笔记元数据 sidecar（json）文件路径：notes/<标题>.md → notes/<标题>.json
 *
 * 结构化元数据（时间/标签/描述/来源/关联笔记）以 json 为权威来源，
 * md 内的 frontmatter 保留供 Obsidian 等外部工具查看；读取时 json 优先。
 */
export function getNoteMetaPath(notePath: string): string {
  return notePath.replace(/\.md$/i, '.json')
}

/**
 * 将笔记元数据序列化为 json sidecar 内容
 *
 * @param meta - 笔记元数据
 * @param links - 关联笔记路径列表（从正文解析的 wikilink 目标）
 */
export function serializeNoteMeta(meta: NoteMeta, links: string[] = []): string {
  return JSON.stringify({ ...meta, links }, null, 2)
}

/**
 * 解析 json sidecar 内容为 NoteMeta，无效时返回 null
 */
export function parseNoteMetaFile(content: string): NoteMeta | null {
  try {
    const data = JSON.parse(content) as Record<string, unknown>
    if (!data || typeof data !== 'object') return null
    const tags = Array.isArray(data.tags) ? data.tags.filter((t): t is string => typeof t === 'string') : []
    const rawSource = data.source
    const source = rawSource && typeof rawSource === 'object' && !Array.isArray(rawSource)
      ? {
          session: String((rawSource as Record<string, unknown>).session ?? ''),
          highlight: String((rawSource as Record<string, unknown>).highlight ?? ''),
        }
      : undefined
    const title = String(data.title ?? '')
    if (!title) return null
    const created = String(data.created ?? '')
    const updated = String(data.updated ?? '')
    return {
      path: String(data.path ?? ''),
      title,
      description: typeof data.description === 'string' ? data.description : undefined,
      type: String(data.type ?? 'concept'),
      tags,
      created: created || updated,
      updated: updated || created,
      proposition: typeof data.proposition === 'string' ? data.proposition : undefined,
      source: source?.session ? source : undefined,
      ...(Array.isArray(data.links)
        ? { links: data.links.filter((l): l is string => typeof l === 'string') }
        : {}),
    }
  } catch {
    return null
  }
}