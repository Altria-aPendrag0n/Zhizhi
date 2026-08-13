/**
 * 知识检索（RAG）工具
 *
 * 在会话发送时，从笔记与参考资料的向量索引中检索相关内容，
 * 组装成 markdown 片段注入系统提示，供 LLM 优先参考回答。
 *
 * 默认只注入摘要（标题/描述/标签/开头片段），让 LLM 先判断相关性；
 * 确认相关后由 LLM 通过 read_reference 工具分页读取全文
 * （借鉴 qwen-code 的 agentic 分页读取思路）。
 */

import { getEmbeddingEngine } from '../embedding/engine'
import { getNoteIndexer } from '../embedding/indexer'
import { cosineSimilarity } from '../embedding/linker'
import { readFile } from './vault-fs'
import { parseFrontmatter } from '../parser/frontmatter'
import { parseReferenceMeta } from './reference-serializer'
import { splitPdfPages } from '../api/tools/read-reference'

/** 单条命中正文注入的最大字符数（防止上下文超限） */
export const MAX_FULL_TEXT_LENGTH = 30000

/** 全部命中正文注入的总预算（高相似度命中优先） */
export const MAX_TOTAL_TEXT_LENGTH = 50000

/** 摘要模式：单条命中注入的正文预览字符数（保证模型能基于实际内容作答） */
export const MAX_PREVIEW_LENGTH = 4000

/** 摘要模式：全部命中正文预览总预算（高相似度命中优先） */
export const MAX_TOTAL_PREVIEW_LENGTH = 20000

/** 检索选项 */
export interface RetrieveOptions {
  /** 命中后同时注入完整正文（默认 false：注入摘要+正文预览，全文由 read_reference 工具按需读取） */
  includeFullText?: boolean
}

/** 知识检索命中项 */
export interface KnowledgeHit {
  kind: 'note' | 'reference'
  path: string
  title: string
  snippet: string // 简短摘要片段（≤300 字，用于展示）
  preview?: string // 正文开头预览（摘要模式注入，供 LLM 判断相关性并基于部分内容作答）
  fullText?: string // 命中资料的完整正文（includeFullText 模式），受单条上限与总预算限制
  truncated?: boolean // fullText 因长度限制被截断，注入时应提示信息不完整
  /** pdf 参考资料的总页数（命中 pdf 时用于提示按页读取） */
  pageCount?: number
  /** 命中章节标题（大 pdf 分块命中时展示，供模型定位） */
  sectionTitle?: string
  /** 命中块覆盖的起始页（0 起；大 pdf 分块命中时） */
  pageFrom?: number
  /** 命中块覆盖的结束页（0 起；大 pdf 分块命中时） */
  pageTo?: number
}

/** 笔记标题回退：从路径中提取文件名 */
function extractNoteTitle(path: string, meta: Record<string, unknown>): string {
  if (typeof meta.title === 'string' && meta.title.trim() !== '') {
    return meta.title.trim()
  }
  const name = path.split('/').pop() || path
  return name.replace(/\.md$/, '')
}

/**
 * 根据查询文本检索知识库（笔记与参考资料）
 *
 * @param query - 用户查询文本
 * @param topK - 返回 Top-K 个结果，默认 4
 * @param options - 检索选项（includeFullText 控制是否注入全文）
 * @returns 按相似度降序排列的命中列表；引擎未就绪 / 无条目 / 出错时返回 []
 */
export async function retrieveKnowledge(
  query: string,
  topK = 4,
  options: RetrieveOptions = {},
): Promise<KnowledgeHit[]> {
  const { includeFullText = false } = options
  try {
    const engine = getEmbeddingEngine()
    if (!engine.isReady()) return []

    const indexer = getNoteIndexer()
    const entries = indexer.getAllEntries()
    if (entries.length === 0) return []

    const queryVector = await engine.embed(query)

    // 收集相似度并按降序取 topK（保留条目引用，供分块命中回填位置信息）
    const scored = entries
      .map((entry) => ({
        entry,
        similarity: cosineSimilarity(queryVector, entry.vector),
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK)

    const hits: KnowledgeHit[] = []
    // 总量预算：按相似度降序处理，高相关命中优先注入全文
    let remaining = MAX_TOTAL_TEXT_LENGTH
    let previewRemaining = MAX_TOTAL_PREVIEW_LENGTH
    for (const { entry } of scored) {
      const path = entry.path
      try {
        let hit: KnowledgeHit
        if (path.endsWith('.json')) {
          // 参考资料：元数据 JSON（标题/描述/标签）
          const meta = parseReferenceMeta(await readFile(path))
          const snippet = [meta.title, meta.description, meta.tags.join(' ')]
            .filter(Boolean)
            .join('\n')
            .slice(0, 300)
          hit = { kind: 'reference', path, title: meta.title, snippet }
          // pdf 命中时附带页数，供提示按页读取
          if (meta.fileType === 'pdf' && meta.pageCount) {
            hit.pageCount = meta.pageCount
          }
          // 分块命中（大 pdf）：回填章节标题与页码区间，供模型定位到具体页
          if (entry.chunkIndex !== undefined) {
            hit.sectionTitle = entry.chunkTitle
            hit.pageFrom = entry.pageFrom
            hit.pageTo = entry.pageTo
          }
          // md 或已解析的 pdf：includeFullText 模式注入全文，否则注入正文开头预览
          if (meta.fileType === 'md' || (meta.fileType === 'pdf' && meta.extractedPath)) {
            const sourcePath = meta.fileType === 'md' ? meta.filePath : meta.extractedPath!
            const content = (await readFile(sourcePath)).trim()
            // 分块命中时注入该块覆盖页区间的正文（而非整篇），使预览与位置提示一致
            const effective =
              meta.fileType === 'pdf' && entry.chunkIndex !== undefined
                ? splitPdfPages(content)
                    .slice(entry.pageFrom ?? 0, (entry.pageTo ?? 0) + 1)
                    .filter(Boolean)
                    .join('\n\n')
                : content
            if (includeFullText) {
              hit.fullText = effective
            } else {
              hit.preview = effective.slice(0, MAX_PREVIEW_LENGTH)
            }
          }
        } else {
          // 笔记：frontmatter 提取标题与正文
          const { meta, body } = parseFrontmatter(await readFile(path))
          const title = extractNoteTitle(path, meta)
          const bodyText = body.trim()
          const snippet = [title, bodyText.slice(0, 300)].filter(Boolean).join('\n').slice(0, 300)
          hit = { kind: 'note', path, title, snippet }
          if (includeFullText) {
            hit.fullText = bodyText
          } else {
            hit.preview = bodyText.slice(0, MAX_PREVIEW_LENGTH)
          }
        }

        // 全文注入模式：长度受单条上限与总量预算双重限制，超限时截断并标记
        if (hit.fullText) {
          if (hit.fullText.length > MAX_FULL_TEXT_LENGTH) {
            hit.fullText = hit.fullText.slice(0, MAX_FULL_TEXT_LENGTH)
            hit.truncated = true
          }
          if (remaining > 0 && hit.fullText.length > remaining) {
            hit.fullText = hit.fullText.slice(0, remaining)
            hit.truncated = true
          }
          if (remaining <= 0) {
            hit.fullText = undefined
          }
          remaining -= hit.fullText?.length ?? 0
        }

        // 预览预算：摘要模式按相似度优先，超出总预算的条目降级为纯摘要
        if (hit.preview) {
          if (previewRemaining > 0 && hit.preview.length > previewRemaining) {
            hit.preview = hit.preview.slice(0, previewRemaining)
          }
          if (previewRemaining <= 0) {
            hit.preview = undefined
          }
          previewRemaining -= hit.preview?.length ?? 0
        }
        hits.push(hit)
      } catch {
        // 任一命中读取失败则跳过该命中
        continue
      }
    }

    return hits
  } catch {
    return []
  }
}

/**
 * 生成参考资料的 read_reference 工具指引。
 * 分块命中时指向命中的章节与页码区间；普通命中指向全文按页读取。
 */
function referenceToolHint(hit: KnowledgeHit): string {
  if (hit.pageFrom !== undefined && hit.pageTo !== undefined) {
    const section = hit.sectionTitle ? `「${hit.sectionTitle}」` : ''
    const pageLabel = `第 ${hit.pageFrom + 1}-${hit.pageTo + 1} 页`
    const limit = hit.pageTo - hit.pageFrom + 1
    return `\n> 该内容来自${section}${pageLabel}，完整 PDF 共 ${hit.pageCount ?? '?'} 页。可用工具 read_reference 读取对应内容：read_reference({ reference_id: "${hit.path}", offset: ${hit.pageFrom}, limit: ${limit} })`
  }
  if (hit.pageCount) {
    return `\n> 该 PDF 共 ${hit.pageCount} 页，完整内容可通过工具 read_reference 按页读取：read_reference({ reference_id: "${hit.path}", offset: 0, limit: 1 })`
  }
  return `\n> 完整全文可通过工具 read_reference 读取：read_reference({ reference_id: "${hit.path}" })`
}

/**
 * 将知识检索命中项格式化为 markdown 片段
 */
export function buildKnowledgeContext(hits: KnowledgeHit[]): string {
  if (hits.length === 0) return ''

  const kindLabels: Record<KnowledgeHit['kind'], string> = {
    note: '笔记',
    reference: '参考资料',
  }

  // 内容优先级：完整正文（includeFullText）> 正文预览（默认模式）> 元数据摘要（pdf/png 或预算降级）
  const sections = hits.map((hit) => {
    let content = hit.fullText ?? hit.snippet
    if (!hit.fullText && hit.preview) {
      content = `（正文预览）\n${hit.preview}`
    }
    const truncatedNote =
      hit.truncated && hit.fullText ? '\n\n（注：该内容过长，已截断展示，可能存在信息缺失）' : ''
    // 参考资料标注 reference_id：模型需要用完整内容时通过 read_reference 工具读取；
    // 分块命中额外提示章节与页码区间，引导精读对应页
    const toolHint = hit.kind === 'reference' ? referenceToolHint(hit) : ''
    return `### [${kindLabels[hit.kind]}] ${hit.title}\n${content}${truncatedNote}${toolHint}`
  })

  return [
    '以下是从你的知识库（笔记与参考资料）中检索到的与用户问题相关的内容，已附正文预览。',
    '请优先基于这些内容回答；参考资料如需完整内容，',
    '请调用 read_reference 工具读取全文（reference_id 见各条目标注），不要只依据预览作答。',
    '',
    ...sections,
  ].join('\n')
}

/**
 * 检索知识库并返回注入用的 markdown 上下文（摘要模式）
 *
 * 只注入命中条目的摘要，引导 LLM 判断相关性；需要完整内容时
 * 由 LLM 通过 read_reference 工具分页读取参考资料全文。
 *
 * 整体 try/catch 兜底：任何异常返回 ''，保证不阻塞聊天。
 *
 * @param query - 用户查询文本
 * @param topK - 返回 Top-K 个结果，默认 4
 * @returns 命中时返回 buildKnowledgeContext 的结果，否则返回 ''
 */
export async function retrieveKnowledgeContext(query: string, topK = 4): Promise<string> {
  try {
    const hits = await retrieveKnowledge(query, topK)
    if (hits.length === 0) return ''
    return buildKnowledgeContext(hits)
  } catch {
    return ''
  }
}
