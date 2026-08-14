/**
 * Markdown 参考资料按章节分块
 *
 * 超大的 md 参考资料超出上下文预算时，按 H1/H2 章节标题切分为多个块，
 * 每块单独建立向量索引，检索命中后回落具体章节。无标题时按预算逐行切分。
 * 与 PDF 分块（pdf-chunk）不同：md 没有页边界标记，定位单位是「章节标题」而非页码。
 */

import { parseHeadings } from './markdown-headings'

/** 单个分块的最大字符数，超出则按行再细分（约 800-1500 tokens） */
export const MD_CHUNK_MAX_CHARS = 4000
/** 判定是否需要分块的最小字符数：超过则分块，否则整篇单块索引 */
export const MD_CHUNK_MIN_CHARS = 6000

/** 单个分块 */
export interface MdChunk {
  /** 章节标题（首个标题之前的内容为空字符串） */
  title: string
  /** 块内容（供向量嵌入） */
  text: string
}

/**
 * 将一组行按字符预算逐行累加切分，保证子块不超出预算。
 * 超大单行无法再分，允许单块超预算（与 PDF 超大页处理一致）。
 */
function splitLinesByBudget(title: string, lines: string[]): MdChunk[] {
  const chunks: MdChunk[] = []
  let buffer: string[] = []
  let chars = 0

  const flush = () => {
    const text = buffer.join('\n').trim()
    if (text) chunks.push({ title, text })
    buffer = []
    chars = 0
  }

  for (const line of lines) {
    if (buffer.length > 0 && chars + line.length > MD_CHUNK_MAX_CHARS) {
      flush()
    }
    buffer.push(line)
    chars += line.length
  }
  flush()
  return chunks
}

/** 将一组行组装为单个分块（未超预算时直接使用；空块返回 null） */
function makeChunk(title: string, lines: string[]): MdChunk | null {
  const text = lines.join('\n').trim()
  if (!text) return null
  return { title, text }
}

/** 将一组行按预算切分：未超预算单块，超预算按行细分 */
function splitSection(title: string, lines: string[]): MdChunk[] {
  const total = lines.reduce((sum, line) => sum + line.length, 0)
  if (total <= MD_CHUNK_MAX_CHARS) {
    const chunk = makeChunk(title, lines)
    return chunk ? [chunk] : []
  }
  return splitLinesByBudget(title, lines)
}

/**
 * 将 md 参考资料正文按 H1/H2 章节分块。
 *
 * 标题层级：复用 parseHeadings（跳过围栏代码块内的 # 行），只取 H1/H2 作为章节边界；
 * H3+ 归入所属章节内容。首个标题之前的内容归入空标题块。
 *
 * @returns 章节块列表；单个章节超预算时按行细分；无标题时整篇按预算切分。
 */
export function chunkMdByChapters(markdown: string): MdChunk[] {
  const lines = markdown.split('\n')
  const chapters = parseHeadings(markdown).filter((heading) => heading.level <= 2)

  if (chapters.length === 0) {
    return splitSection('', lines)
  }

  const chunks: MdChunk[] = []

  // 首个章节标题之前的内容（前言 / 封面等）
  if (chapters[0].line > 0) {
    chunks.push(...splitSection('', lines.slice(0, chapters[0].line)))
  }

  for (let i = 0; i < chapters.length; i++) {
    const start = chapters[i].line
    const end = i + 1 < chapters.length ? chapters[i + 1].line : lines.length
    chunks.push(...splitSection(chapters[i].text, lines.slice(start, end)))
  }

  return chunks
}
