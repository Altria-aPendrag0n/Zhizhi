/**
 * 复习缺口精准回写（P4-4）
 *
 * 从 AI 反馈文本解析出被标注的簇内笔记（回答涉及/应涉及的笔记），
 * 供评级面板标记「AI 缺口」引导用户聚焦评级；未涉及的笔记保持调度状态不变。
 */

import type { Note } from '../types'

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 从 AI 反馈文本中解析提及的簇内笔记路径（按标题匹配）
 *
 * 匹配优先级：
 * 1. `[[wikilink]]` 形式（兼容 `[[标题|别名]]`）
 * 2. 纯文本标题包含（标题长度 ≥ 2 防误匹配，如单字标题容易出现在任意句子中）
 *
 * 解析不到的笔记不会被标记，评级面板仍提供全量逐条评级兜底。
 *
 * @param feedbackText - AI 反馈文本（review-feedback SKILL 第 6 条要求明确标注涉及笔记标题）
 * @param notes - 复习簇内全部笔记（仅匹配簇内笔记，避免误匹配 vault 其他笔记）
 * @returns 提及的笔记路径（按输入顺序去重）
 */
export function parseMentionedNotes(feedbackText: string, notes: Note[]): string[] {
  if (!feedbackText || notes.length === 0) return []
  const matched: string[] = []
  for (const note of notes) {
    const title = note.title
    if (!title || title.length < 2) continue
    const escaped = escapeRegExp(title)
    // 1. [[标题]] / [[标题|别名]] 精确匹配
    const linkPattern = new RegExp(`\\[\\[\\s*${escaped}\\s*(?:\\|[^\\]]*)?\\]\\]`)
    if (linkPattern.test(feedbackText)) {
      matched.push(note.path)
      continue
    }
    // 2. 纯文本标题包含
    if (feedbackText.includes(title)) {
      matched.push(note.path)
    }
  }
  return matched
}
