/**
 * read_reference 工具
 *
 * 供 LLM 在回答时按需分页读取参考资料（md 文档）的全文。
 * 借鉴 qwen-code 的 ReadFile 分页思路：
 * - 每次调用通过 offset/limit 读取指定行范围
 * - 返回内容明确标注"当前行范围 / 总行数"，让模型知道内容边界
 * - 模型需要更多内容时用 offset 继续读取下一页
 */

import type { ToolDefinition } from '../llm-provider'
import type { ReferenceMeta } from '../../types'
import { readFile } from '../../utils/vault-fs'
import { parseReferenceMeta } from '../../utils/reference-serializer'
import { getReferenceMetaPath } from '../../utils/reference-serializer'

/** 单次读取的最大行数（qwen-code 默认 1000 行，这里对齐） */
export const READ_REFERENCE_DEFAULT_LIMIT = 1000
/** 单次读取的最大字符数，超出部分截断并提示 */
export const READ_REFERENCE_MAX_CHARS = 8000

/** 工具执行上下文 */
export interface ToolContext {
  /** Vault 根目录路径（用于定位参考资料文件） */
  vaultPath: string
}

export const readReferenceTool: ToolDefinition = {
  name: 'read_reference',
  description:
    '读取参考资料（用户上传的学习资料）的正文内容。检索结果中会给出每个资料条目的正文预览和 reference_id（形如 {vault}/references/{id}/{id}.json），需要完整内容时用本工具读取。md 文档按行读取：offset 为 0 起始的行号，limit 为最多读取的行数；pdf 文档按页读取：offset 为 0 起始的页码，limit 为最多读取的页数。返回会标明当前读取的范围与总行数/总页数；若内容未读完，请用 offset 继续读取后续部分。',
  parameters: {
    type: 'object',
    properties: {
      reference_id: {
        type: 'string',
        description: '参考资料 ID，或形如 {vault}/references/{id}/{id}.json 的元数据 JSON 路径（优先使用检索结果中标注的 reference_id）',
      },
      offset: {
        type: 'number',
        description: '起始行号/页码（0 起始，md 为行号、pdf 为页码），默认 0',
      },
      limit: {
        type: 'number',
        description: `md 最多读取的行数（默认 ${READ_REFERENCE_DEFAULT_LIMIT}）；pdf 最多读取的页数（默认 1）`,
      },
    },
    required: ['reference_id'],
  },
}

/**
 * 将读取结果格式化为带边界提示的文本
 */
export function formatRangeResult(
  lines: string[],
  startLine: number,
  totalLines: number,
  totalChars: number,
  truncatedByChars: boolean,
): string {
  const content = lines.join('\n')
  const shown = truncatedByChars ? `${content}\n... [已截断，请使用 offset 继续读取]` : content
  return [
    `Showing lines ${startLine + 1}-${startLine + lines.length} of ${totalLines} total lines (约 ${totalChars} 字).`,
    '',
    '---',
    '',
    shown,
  ].join('\n')
}

/**
 * 将按页读取结果格式化为带边界提示的文本（pdf）
 */
export function formatPageResult(
  pages: string[],
  startPage: number,
  totalPages: number,
  truncatedByChars: boolean,
): string {
  const content = pages.join('\n\n')
  const shown = truncatedByChars ? `${content}\n... [已截断，请使用 offset 继续读取]` : content
  return [
    `Showing pages ${startPage + 1}-${startPage + pages.length} of ${totalPages} total pages.`,
    '',
    '---',
    '',
    shown,
  ].join('\n')
}

/**
 * 按 `<!-- page: N -->` 页边界标记切分提取产物为页数组。
 * 标记之间（或标记到文件末尾）的文本为对应页内容；忽略空白页。
 */
export function splitPdfPages(markdown: string): string[] {
  const pages: string[] = []
  let current: string[] = []
  for (const line of markdown.split('\n')) {
    if (/^<!-- page: \d+ -->\s*$/.test(line)) {
      if (current.length > 0) {
        pages.push(current.join('\n').trim())
        current = []
      }
      continue
    }
    current.push(line)
  }
  if (current.length > 0) {
    pages.push(current.join('\n').trim())
  }
  return pages.filter((page) => page.length > 0)
}

/** pdf 单次读取的默认页数（单页内容已足够模型判断，避免一次性塞入过多文本） */
const PDF_DEFAULT_PAGE_LIMIT = 1

/**
 * 执行 read_reference：按行范围读取参考资料 md 全文
 *
 * @returns 格式化后的分页内容；文件不存在 / 非 md 类型时返回说明文本（不抛错，方便模型继续）
 */
export async function executeReadReference(
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<string> {
  const rawId = args.reference_id
  if (typeof rawId !== 'string' || rawId.trim() === '') {
    return '错误：缺少有效的 reference_id 参数。'
  }

  // 解析元数据 JSON 路径：传入 id 或完整 .json 路径均可
  const metaPath = rawId.trim().endsWith('.json')
    ? rawId.trim()
    : getReferenceMetaPath(context.vaultPath, rawId.trim())

  let meta
  try {
    meta = parseReferenceMeta(await readFile(metaPath))
  } catch {
    return `错误：无法找到参考资料 "${rawId}" 的元数据，请确认 reference_id 正确。`
  }

  if (meta.fileType === 'pdf') {
    return readPdfReference(args, meta)
  }

  if (meta.fileType !== 'md') {
    return `该参考资料（${meta.title}）为 ${meta.fileType} 文件，无法读取文本内容。`
  }

  let content: string
  try {
    content = await readFile(meta.filePath)
  } catch {
    return `错误：无法读取参考资料 "${meta.title}" 的正文文件。`
  }

  const lines = content.split('\n')
  const totalLines = lines.length
  const totalChars = content.length

  // 计算本次读取的行范围
  const offset = typeof args.offset === 'number' && Number.isInteger(args.offset) && args.offset > 0
    ? Math.min(args.offset, totalLines)
    : 0
  const limit = typeof args.limit === 'number' && Number.isInteger(args.limit) && args.limit > 0
    ? args.limit
    : READ_REFERENCE_DEFAULT_LIMIT
  const end = Math.min(offset + limit, totalLines)

  const selected = lines.slice(offset, end)

  // 字符上限：超出时截断（保留"已截断"提示）
  let truncated = false
  let shownLines = selected
  let acc = 0
  const capped: string[] = []
  for (const line of selected) {
    if (acc + line.length > READ_REFERENCE_MAX_CHARS) {
      // 单行本身超限（通常是第一行）：截断该行并停止
      if (acc === 0) {
        capped.push(line.slice(0, READ_REFERENCE_MAX_CHARS))
        truncated = true
        break
      }
      truncated = true
      break
    }
    acc += line.length
    capped.push(line)
  }
  if (truncated) {
    shownLines = capped
  }

  return formatRangeResult(shownLines, offset, totalLines, totalChars, truncated)
}

/**
 * 按页读取 pdf 参考资料的提取产物（{id}.extracted.md）。
 * offset/limit 语义为起始页（0 起）/ 页数；未解析或解析失败返回说明文本。
 */
async function readPdfReference(args: Record<string, unknown>, meta: ReferenceMeta): Promise<string> {
  if (!meta.extractedPath) {
    if (meta.parseStatus === 'failed') {
      return `该 PDF（${meta.title}）解析失败${meta.parseError ? `：${meta.parseError}` : ''}，无法读取内容。`
    }
    return `该 PDF（${meta.title}）尚未完成解析（当前状态：${meta.parseStatus || '待解析'}），无法读取内容，请稍后重试。`
  }

  let markdown: string
  try {
    markdown = await readFile(meta.extractedPath)
  } catch {
    return `错误：无法读取参考资料 "${meta.title}" 的提取产物。`
  }

  const pages = splitPdfPages(markdown)
  const totalPages = pages.length
  if (totalPages === 0) {
    return `该 PDF（${meta.title}）没有可读取的文本内容。`
  }

  // 计算本次读取的页范围（默认读 1 页）
  const offset = typeof args.offset === 'number' && Number.isInteger(args.offset) && args.offset > 0
    ? Math.min(args.offset, totalPages)
    : 0
  const limit = typeof args.limit === 'number' && Number.isInteger(args.limit) && args.limit > 0
    ? args.limit
    : PDF_DEFAULT_PAGE_LIMIT
  const end = Math.min(offset + limit, totalPages)

  const selected = pages.slice(offset, end)

  // 字符上限：超出时截断（保留"已截断"提示）
  let truncated = false
  let shownPages = selected
  let acc = 0
  const capped: string[] = []
  for (const page of selected) {
    if (acc + page.length > READ_REFERENCE_MAX_CHARS) {
      if (acc === 0) {
        capped.push(page.slice(0, READ_REFERENCE_MAX_CHARS))
        truncated = true
        break
      }
      truncated = true
      break
    }
    acc += page.length
    capped.push(page)
  }
  if (truncated) {
    shownPages = capped
  }

  return formatPageResult(shownPages, offset, totalPages, truncated)
}
