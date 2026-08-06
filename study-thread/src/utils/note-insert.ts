/**
 * 划线内容插入工具
 *
 * 将划线摘录原文原样插入到已有笔记的指定标题小节末尾，
 * 不加工原文、不加引用标记。供"加入笔记"功能使用。
 */

import { parseHeadings } from './markdown-headings'

/** 加入笔记的目标位置信息 */
export interface AddToNoteTarget {
  /** 目标笔记文件路径 */
  notePath: string
  /** 目标标题行号；null 表示插入到文件末尾 */
  headingLine: number | null
  /** 目标标题文本（展示用） */
  headingText: string
  /** 弹窗加载的最新笔记正文（不含 frontmatter），插入基于该内容计算 */
  body: string
}

/**
 * 在行数组指定位置插入划线原文，并保证与上下文之间有空白分隔
 *
 * @param lines - 正文行数组
 * @param insertIndex - 插入到 lines[insertIndex] 之前
 * @param highlightedText - 划线原文
 */
function insertBlockAt(lines: string[], insertIndex: number, highlightedText: string): string {
  // 空内容归一：''.split('\n') 会产生 ['']，视为无任何行
  if (lines.length === 1 && lines[0] === '') {
    lines.length = 0
    insertIndex = 0
  }
  const blockLines = highlightedText.trim().split('\n')

  // 前导空行：上一行非空时补一个空行
  if (insertIndex > 0 && lines[insertIndex - 1].trim() !== '') {
    lines.splice(insertIndex, 0, '')
    insertIndex++
  }
  lines.splice(insertIndex, 0, ...blockLines)

  // 尾部空行：后面还有内容且非空时补一个空行
  const afterIndex = insertIndex + blockLines.length
  if (afterIndex < lines.length && lines[afterIndex].trim() !== '') {
    lines.splice(afterIndex, 0, '')
  }
  return lines.join('\n')
}

/**
 * 将划线内容插入到指定标题小节末尾
 *
 * 小节边界：下一个同级或更高级标题之前。
 *
 * @param markdown - 笔记正文（不含 frontmatter）
 * @param headingLine - 目标标题行号（parseHeadings 返回的 line）
 * @param highlightedText - 划线原文
 * @returns 插入后的完整正文
 * @throws 目标标题不存在时抛出错误
 */
export function insertHighlightAt(
  markdown: string,
  headingLine: number,
  highlightedText: string,
): string {
  const heading = parseHeadings(markdown).find((h) => h.line === headingLine)
  if (!heading) {
    throw new Error(`找不到所选标题（行 ${headingLine}）`)
  }
  const lines = markdown.split('\n')
  return insertBlockAt(lines, heading.end + 1, highlightedText)
}

/**
 * 将划线内容插入到文件末尾
 *
 * @param markdown - 笔记正文（不含 frontmatter）
 * @param highlightedText - 划线原文
 * @returns 插入后的完整正文
 */
export function insertHighlightAtEnd(markdown: string, highlightedText: string): string {
  const lines = markdown.split('\n')
  return insertBlockAt(lines, lines.length, highlightedText)
}
