/**
 * 笔记链接建议器
 *
 * 基于向量相似度检索，为正在编辑的笔记推荐相关笔记链接。
 * 使用余弦相似度计算当前段落与已有笔记的关联程度。
 */

import { NoteIndexer } from './indexer'
import { EmbeddingEngine } from './engine'

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
          title: extractTitle(entry.path),
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
 * 从路径中提取笔记标题
 */
function extractTitle(path: string): string {
  const name = path.split('/').pop() || path
  return name.replace(/\.md$/, '')
}