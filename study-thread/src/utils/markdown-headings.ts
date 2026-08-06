/**
 * Markdown 标题层级解析
 *
 * 用于"加入笔记"时展示笔记的标题大纲（## / ### / #### …），
 * 并定位每个标题小节的边界，以便在指定位置插入划线内容。
 */

export interface MarkdownHeading {
  /** 标题级别（1-6，对应 # 到 ######） */
  level: number
  /** 标题文本（去除 # 前缀与首尾空白） */
  text: string
  /** 标题所在行号（0 起） */
  line: number
  /** 该小节内容的最后一行行号（下一个同级/更高级标题的前一行；无后续标题则为文件最后一行） */
  end: number
}

/**
 * 解析 Markdown 中的标题层级（按文档顺序）
 *
 * 跳过围栏代码块（``` 包裹）内的 # 行，避免把代码中的井号误判为标题。
 *
 * @param markdown - 笔记正文（不含 frontmatter）
 * @returns 按文档顺序排列的标题列表
 */
export function parseHeadings(markdown: string): MarkdownHeading[] {
  const lines = markdown.split('\n')
  const rawHeadings: Array<{ level: number; text: string; line: number }> = []

  let inFence = false
  for (let i = 0; i < lines.length; i++) {
    const fenceMatch = lines[i].match(/^\s*(```|~~~)/)
    if (fenceMatch) {
      inFence = !inFence
      continue
    }
    if (inFence) continue

    const headingMatch = lines[i].match(/^(#{1,6})\s+(.+?)\s*#*\s*$/)
    if (headingMatch) {
      rawHeadings.push({
        level: headingMatch[1].length,
        text: headingMatch[2].trim(),
        line: i,
      })
    }
  }

  return rawHeadings.map((heading, index) => {
    const next = rawHeadings[index + 1]
    const end = next ? next.line - 1 : lines.length - 1
    return { ...heading, end }
  })
}
