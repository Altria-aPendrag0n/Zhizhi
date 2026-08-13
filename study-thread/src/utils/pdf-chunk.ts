/**
 * PDF 提取产物按章节分块
 *
 * 大 PDF 的 extracted.md 超出上下文预算时，按 H1/H2 章节标题切分为多个块，
 * 每块单独建立向量索引，检索命中后回落具体章节与页码区间。
 * 无标题的 PDF 退化为按页分块；单个章节超过预算时按页再细分。
 */

/** 单个分块的最大字符数，超出则按页再细分（约 800-1500 tokens） */
export const PDF_CHUNK_MAX_CHARS = 4000
/** 判定是否需要分块的最小字符数：超过则分块，否则整篇单块索引 */
export const PDF_CHUNK_MIN_CHARS = 6000

/** 单个分块 */
export interface PdfChunk {
  /** 章节标题（首个标题之前的内容为空字符串） */
  title: string
  /** 块内容（已去除页边界标记，供向量嵌入） */
  text: string
  /** 块覆盖的起始页（0 起） */
  pageFrom: number
  /** 块覆盖的结束页（0 起） */
  pageTo: number
}

/** 页边界标记：`<!-- page: N -->`（N 为 1 起物理页码） */
const PAGE_RE = /^<!-- page: (\d+) -->\s*$/
/** H1/H2 章节标题 */
const HEADING_RE = /^(#{1,2})\s+(.+?)\s*#*\s*$/

/** 一行文本及其所属物理页（0 起） */
interface PageLine {
  text: string
  page: number
}

interface Segment {
  title: string
  lines: PageLine[]
}

/**
 * 将 extracted.md 拆成「行 + 物理页」序列，跳过页边界标记本身。
 */
function toPageLines(markdown: string): PageLine[] {
  const result: PageLine[] = []
  let page = 0
  for (const raw of markdown.split('\n')) {
    const match = raw.match(PAGE_RE)
    if (match) {
      page = parseInt(match[1], 10) - 1
      continue
    }
    result.push({ text: raw, page })
  }
  return result
}

/**
 * 按 H1/H2 标题切分为章节段；首个标题之前的内容归入空标题段。
 */
function splitByHeadings(lines: PageLine[]): Segment[] {
  const segments: Segment[] = []
  let current: Segment | null = null

  const flush = () => {
    if (current && current.lines.some((line) => line.text.trim() !== '')) {
      segments.push(current)
    }
    current = null
  }

  for (const line of lines) {
    const heading = line.text.match(HEADING_RE)
    if (heading) {
      flush()
      current = { title: heading[2].trim(), lines: [line] }
      continue
    }
    if (!current) {
      current = { title: '', lines: [line] }
      continue
    }
    current.lines.push(line)
  }
  flush()
  return segments
}

/** 行序列覆盖的页码区间（0 起，闭区间） */
function pageRange(lines: PageLine[]): { from: number; to: number } {
  let from = lines[0]?.page ?? 0
  let to = from
  for (const line of lines) {
    if (line.page < from) from = line.page
    if (line.page > to) to = line.page
  }
  return { from, to }
}

/** 将一组行组装为分块（去页标记、压缩空白；空块返回 null） */
function makeChunk(title: string, lines: PageLine[]): PdfChunk | null {
  const text = lines.map((line) => line.text).join('\n').trim()
  if (!text) return null
  const { from, to } = pageRange(lines)
  return { title, text, pageFrom: from, pageTo: to }
}

/** 将一组行按物理页聚合，供超大章节按页细分 */
function groupByPage(lines: PageLine[]): PageLine[][] {
  const pages: PageLine[][] = []
  let current: PageLine[] = []
  let currentPage = lines[0]?.page ?? 0
  for (const line of lines) {
    if (line.page !== currentPage) {
      if (current.length > 0) pages.push(current)
      current = []
      currentPage = line.page
    }
    current.push(line)
  }
  if (current.length > 0) pages.push(current)
  return pages
}

/**
 * 超大章节按页细分：逐页累加，接近上限时切开，保证子块不超出预算。
 */
function splitSegmentByPage(segment: Segment): PdfChunk[] {
  const chunks: PdfChunk[] = []
  let buffer: PageLine[] = []
  let chars = 0

  const flush = () => {
    const chunk = makeChunk(segment.title, buffer)
    if (chunk) chunks.push(chunk)
    buffer = []
    chars = 0
  }

  for (const pageLines of groupByPage(segment.lines)) {
    const pageChars = pageLines.reduce((sum, line) => sum + line.text.length, 0)
    if (buffer.length > 0 && chars + pageChars > PDF_CHUNK_MAX_CHARS) {
      flush()
    }
    buffer.push(...pageLines)
    chars += pageChars
  }
  flush()
  return chunks
}

/**
 * 将 PDF 提取产物按章节分块。
 *
 * @returns 章节块列表；单个章节超预算时按页细分；无标题时退化为按页分块。
 */
export function chunkPdfByChapters(markdown: string): PdfChunk[] {
  const lines = toPageLines(markdown)
  const segments = splitByHeadings(lines)

  const chunks: PdfChunk[] = []
  for (const segment of segments) {
    const totalChars = segment.lines.reduce((sum, line) => sum + line.text.length, 0)
    if (totalChars <= PDF_CHUNK_MAX_CHARS) {
      const chunk = makeChunk(segment.title, segment.lines)
      if (chunk) chunks.push(chunk)
    } else {
      chunks.push(...splitSegmentByPage(segment))
    }
  }
  return chunks
}
