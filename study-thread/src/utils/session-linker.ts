/**
 * 会话-笔记反链工具
 *
 * 管理笔记与来源会话之间的双向链接关系。
 */

import { readFile, listDir, writeFile } from './vault-fs'
import { parseFrontmatter } from '../parser/frontmatter'
import { sessionIdFromReference } from './session-serializer'
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
  /** 划线文本在消息中的出现序号（第 N 处），重复文本时精确定位；默认第 1 处 */
  occurrence?: number
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
 *   > 已生成分支: [[branchId|title]] 划线「划线文本」〔N〕   # N 为划线文本在消息中的出现序号（重复文本定位）
 * 向后兼容无划线文本的旧格式（highlight 为空）、无出现序号的格式（occurrence 缺省为第 1 处）。
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

    // 检测笔记/分支引用（含可选划线文本与出现序号）
    const refMatch = line.match(/已生成(笔记|分支):\s*\[\[(.+?)\]\](?:\s*划线「(.+?)」(?:\s*〔(\d+)〕)?)?/)
    if (refMatch && currentMessageIndex >= 0) {
      const kind = refMatch[1] === '分支' ? 'branch' : 'note'
      const reference = refMatch[2]
      const separatorIndex = reference.indexOf('|')
      const path = separatorIndex >= 0 ? reference.slice(0, separatorIndex) : reference
      const title = separatorIndex >= 0 ? reference.slice(separatorIndex + 1) : reference.split('/').pop()?.replace(/\.md$/, '') || reference
      const highlight = refMatch[3]
      const occurrence = refMatch[4] ? Number(refMatch[4]) : undefined
      refs.push({
        path,
        title,
        messageIndex: currentMessageIndex,
        kind,
        ...(highlight ? { highlight } : {}),
        ...(occurrence && occurrence > 1 ? { occurrence } : {}),
      })
    }
  }

  return refs
}

/**
 * 扫描 vault 中所有笔记，查找引用指定会话的笔记
 *
 * 兼容 `source.session` 的新旧两种存储形态：旧版本存绝对路径，新版本存稳定 id。
 * 比较时统一归一化为会话 id，避免路径格式（斜杠方向/大小写/文件名变化）导致的失配。
 */
export async function findNotesBySession(
  sessionId: string,
  allNotes: NoteMeta[],
): Promise<NoteMeta[]> {
  const targetId = sessionIdFromReference(sessionId)
  return allNotes.filter((note) => {
    const ref = note.source?.session
    if (!ref) return false
    return sessionIdFromReference(ref) === targetId
  })
}

/** 路径归一化：统一小写与正斜杠（用于跨来源路径比较，兼容 Windows 反斜杠/大小写差异） */
function normalizePathKey(path: string): string {
  return path.replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '')
}

/**
 * 过滤已不存在的笔记引用（文件已被删除），分支引用保留
 *
 * 删除笔记后除清理会话文件引用行外，此处再兜底过滤一次：
 * 兼容历史遗留的悬空引用（旧版本删除时未清理会话引用行），
 * 并防止删除路径与会话引用行路径格式不一致（Windows 混合斜杠/大小写）
 * 导致引用行清理失败时界面仍残留已删除笔记。
 */
export async function filterExistingNoteRefs(refs: NoteReference[]): Promise<NoteReference[]> {
  const results = await Promise.all(refs.map(async (ref) => {
    // 分支引用（branchId）不是笔记文件，不参与存在性检查
    if (ref.kind === 'branch') return ref
    try {
      await readFile(ref.path)
      return ref
    } catch {
      return null
    }
  }))
  return results.filter((ref): ref is NoteReference => ref !== null)
}

/**
 * 从 vault 的所有会话文件中移除指定目标（笔记路径或分支 id）的引用行
 *
 * 删除笔记/分支后调用，清理原会话消息中残留的划线虚线标记
 * （`> 已生成笔记/分支: [[target|...]] 划线「…」`），避免引用悬空。
 * 单个会话文件处理失败不影响其余文件。
 */
export async function removeSessionReferences(
  vaultPath: string,
  targets: string[],
  kind: 'note' | 'branch',
): Promise<void> {
  if (targets.length === 0) return
  const sessionsDir = `${vaultPath}/sessions`
  let entries
  try {
    entries = await listDir(sessionsDir)
  } catch {
    return
  }

  const kindLabel = kind === 'branch' ? '分支' : '笔记'
  const normalizedTargets = targets.map(normalizePathKey)
  // 逐行解析引用行的目标（笔记路径或分支 id），归一化后比较：
  // 旧实现用正则直接拼接完整路径匹配整行，Windows 下删除路径（可能带反斜杠）
  // 与会话引用行路径（正斜杠）不一致时匹配失败，导致悬空引用残留
  const refLinePattern = new RegExp(`^> 已生成${kindLabel}: \\[\\[([^|\\]]+)\\|`)

  for (const entry of entries) {
    if (entry.is_dir || !entry.name.toLowerCase().endsWith('.md')) continue
    try {
      const filePath = `${sessionsDir}/${entry.name}`
      const raw = await readFile(filePath)
      const newRaw = raw.split('\n').filter((line) => {
        const m = line.match(refLinePattern)
        if (!m) return true
        return !normalizedTargets.includes(normalizePathKey(m[1]))
      }).join('\n')
      if (newRaw !== raw) await writeFile(filePath, newRaw)
    } catch {
      // 忽略单个文件处理失败
    }
  }
}