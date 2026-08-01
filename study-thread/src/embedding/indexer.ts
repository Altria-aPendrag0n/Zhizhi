/**
 * Vault 笔记向量索引器
 *
 * 负责构建和维护笔记的向量索引，支持全量索引和增量更新。
 * 索引数据持久化到 localStorage，避免每次启动重复索引。
 */

import type { NoteMeta } from '../types'
import { parseNoteDate } from '../utils/date'
import { EmbeddingEngine, getEmbeddingEngine } from './engine'

/** 索引条目 */
export interface IndexEntry {
  /** 笔记路径 */
  path: string
  /** 向量数据 */
  vector: number[]
  /** 索引时间戳 */
  indexedAt: number
}

/** 索引存储格式 */
interface IndexStore {
  /** 版本号，用于兼容性检查 */
  version: number
  /** 索引条目列表 */
  entries: IndexEntry[]
}

/** 当前索引版本 */
const INDEX_VERSION = 1

/** localStorage 键名 */
const STORAGE_KEY = 'study-thread-note-index'

/**
 * 笔记向量索引器
 */
export class NoteIndexer {
  private engine: EmbeddingEngine
  private entries: Map<string, IndexEntry> = new Map()

  constructor(engine: EmbeddingEngine) {
    this.engine = engine
  }

  /**
   * 从 localStorage 加载已持久化的索引
   */
  loadFromStorage(): boolean {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return false

      const store: IndexStore = JSON.parse(raw)
      if (store.version !== INDEX_VERSION) return false

      this.entries.clear()
      for (const entry of store.entries) {
        this.entries.set(entry.path, entry)
      }
      return true
    } catch {
      return false
    }
  }

  /**
   * 将索引持久化到 localStorage
   */
  saveToStorage(): void {
    const store: IndexStore = {
      version: INDEX_VERSION,
      entries: Array.from(this.entries.values()),
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  }

  /**
   * 构建全量索引
   *
   * @param notes - 所有笔记元数据列表
   * @param getNoteContent - 获取笔记内容的回调函数
   * @param onProgress - 进度回调 (0-1)
   */
  async buildIndex(
    notes: NoteMeta[],
    getNoteContent: (path: string) => Promise<string>,
    onProgress?: (current: number, total: number) => void,
  ): Promise<void> {
    if (!this.engine.isReady()) {
      throw new Error('Embedding 引擎未就绪，请先初始化引擎')
    }

    const total = notes.length

    for (let i = 0; i < total; i++) {
      const note = notes[i]
      const existing = this.entries.get(note.path)

      // 检查是否需要重新索引：已索引且更新时间未变则跳过
      if (existing) {
        // 无效日期按 +Infinity 处理：无法判断是否更新过，保守地重新索引
        const updatedTime = parseNoteDate(note.updated)?.getTime() ?? Number.POSITIVE_INFINITY
        if (updatedTime <= existing.indexedAt) {
          onProgress?.(i + 1, total)
          continue
        }
      }

      // 获取笔记内容并构建索引文本
      try {
        const content = await getNoteContent(note.path)
        const indexText = buildIndexText(note, content)
        const vector = await this.engine.embed(indexText)

        this.entries.set(note.path, {
          path: note.path,
          vector,
          indexedAt: Date.now(),
        })
      } catch (e) {
        console.warn(`索引笔记失败: ${note.path}`, e)
      }

      onProgress?.(i + 1, total)
    }

    this.saveToStorage()
  }

  /**
   * 增量更新单篇笔记索引
   *
   * @param path - 笔记路径
   * @param content - 笔记内容
   */
  async updateNote(path: string, content: string): Promise<void> {
    if (!this.engine.isReady()) {
      throw new Error('Embedding 引擎未就绪')
    }

    const vector = await this.engine.embed(content)
    this.entries.set(path, {
      path,
      vector,
      indexedAt: Date.now(),
    })

    this.saveToStorage()
  }

  /**
   * 移除单篇笔记索引
   */
  removeNote(path: string): void {
    this.entries.delete(path)
    this.saveToStorage()
  }

  /**
   * 获取笔记向量
   */
  getVector(path: string): number[] | undefined {
    return this.entries.get(path)?.vector
  }

  /**
   * 获取所有索引条目
   */
  getAllEntries(): IndexEntry[] {
    return Array.from(this.entries.values())
  }

  /**
   * 获取索引大小
   */
  get size(): number {
    return this.entries.size
  }

  /**
   * 清空索引
   */
  clear(): void {
    this.entries.clear()
    localStorage.removeItem(STORAGE_KEY)
  }
}

/**
 * 构建用于索引的文本
 * 组合笔记的标题、命题和核心内容
 */
function buildIndexText(meta: NoteMeta, content: string): string {
  const parts: string[] = [meta.title]
  if (meta.proposition) parts.push(meta.proposition)
  // 取内容的前 500 个字符作为索引文本
  if (content) parts.push(content.slice(0, 500))
  return parts.join('\n')
}

/** 全局单例 */
let _indexerInstance: NoteIndexer | null = null

/**
 * 获取全局 NoteIndexer 实例
 */
export function getNoteIndexer(): NoteIndexer {
  if (!_indexerInstance) {
    _indexerInstance = new NoteIndexer(getEmbeddingEngine())
  }
  return _indexerInstance
}