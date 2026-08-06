/**
 * 笔记链接建议器
 *
 * 基于向量相似度检索，为正在编辑的笔记推荐相关笔记链接。
 * 使用余弦相似度计算当前段落与已有笔记的关联程度。
 */

import { NoteIndexer } from './indexer'
import { EmbeddingEngine } from './engine'
import { parseReferenceMeta } from '../utils/reference-serializer'
import { readFile } from '../utils/vault-fs'

/** 链接建议 */
export interface LinkSuggestion {
  /** 笔记路径 */
  notePath: string
  /** 笔记标题 */
  title: string
  /** 相似度 (0-1) */
  similarity: number
  /** 内容片段预览 */
  snippet: string
}

/**
 * 笔记链接建议器
 */
export class NoteLinker {
  private indexer: NoteIndexer
  private engine: EmbeddingEngine

  constructor(indexer: NoteIndexer, engine: EmbeddingEngine) {
    this.indexer = indexer
    this.engine = engine
  }

  /**
   * 获取链接建议
   *
   * @param currentNotePath - 当前编辑的笔记路径（排除自身）
   * @param cursorParagraph - 光标所在段落文本
   * @param topK - 返回 Top-K 个结果
   * @returns 按相似度降序排列的建议列表
   */
  async suggestLinks(
    currentNotePath: string,
    cursorParagraph: string,
    topK: number = 5,
  ): Promise<LinkSuggestion[]> {
    if (!this.engine.isReady()) {
      return []
    }

    if (!cursorParagraph.trim()) {
      return []
    }

    try {
      // 向量化当前段落
      const queryVector = await this.engine.embed(cursorParagraph)

      // 收集所有候选笔记
      const entries = this.indexer.getAllEntries()
      const candidates: LinkSuggestion[] = []

      for (const entry of entries) {
        // 排除自身
        if (entry.path === currentNotePath) continue

        const similarity = cosineSimilarity(queryVector, entry.vector)

        candidates.push({
          notePath: entry.path,
          title: await resolveEntryTitle(entry.path),
          similarity,
          snippet: '',
        })
      }

      // 按相似度降序排序
      candidates.sort((a, b) => b.similarity - a.similarity)

      return candidates.slice(0, topK)
    } catch {
      return []
    }
  }
}

/**
 * 计算余弦相似度
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  if (normA === 0 || normB === 0) return 0

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

/**
 * 索引条目标题解析：
 * - 参考资料（`.json` 元数据路径）：读取元数据取真实标题（与知识检索一致），读取失败时回退路径文件名
 * - 笔记：从路径取文件名（去 `.md` 后缀）
 */
async function resolveEntryTitle(path: string): Promise<string> {
  if (path.endsWith('.json')) {
    try {
      return parseReferenceMeta(await readFile(path)).title
    } catch {
      // 元数据缺失或读取失败（如文件已被删除）时回退到路径文件名
    }
  }
  return extractTitle(path)
}

/**
 * 从路径中提取笔记标题
 */
function extractTitle(path: string): string {
  const name = path.split('/').pop() || path
  return name.replace(/\.md$/, '')
}