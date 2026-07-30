/**
 * 本地 Embedding 引擎
 *
 * 基于 transformers.js 的本地文本向量化引擎。
 * 支持 all-MiniLM-L6-v2（英文优先）和 text2vec-base-chinese（中文优先）模型。
 * 模型首次加载时自动下载并缓存到浏览器 IndexedDB。
 */

import { pipeline, type FeatureExtractionPipeline } from '@xenova/transformers'

/** 支持的模型名称 */
export type EmbeddingModel = 'Xenova/all-MiniLM-L6-v2' | 'Xenova/text2vec-base-chinese'

/** 默认模型：英文 384 维 */
const DEFAULT_MODEL: EmbeddingModel = 'Xenova/all-MiniLM-L6-v2'

/** 引擎初始化状态 */
export type EngineStatus = 'idle' | 'loading' | 'ready' | 'error'

/**
 * 本地 Embedding 引擎
 */
export class EmbeddingEngine {
  private modelName: EmbeddingModel
  private extractor: FeatureExtractionPipeline | null = null
  private _status: EngineStatus = 'idle'
  private _progress: number = 0
  private _error: string | null = null

  constructor(modelName: EmbeddingModel = DEFAULT_MODEL) {
    this.modelName = modelName
  }

  /** 获取当前状态 */
  get status(): EngineStatus {
    return this._status
  }

  /** 获取加载进度 (0-1) */
  get progress(): number {
    return this._progress
  }

  /** 获取错误信息 */
  get error(): string | null {
    return this._error
  }

  /** 引擎是否就绪 */
  isReady(): boolean {
    return this._status === 'ready' && this.extractor !== null
  }

  /**
   * 初始化引擎，加载模型
   *
   * @param onProgress - 可选的进度回调，接收 0-1 的进度值
   */
  async initialize(onProgress?: (progress: number) => void): Promise<void> {
    if (this._status === 'ready') return
    if (this._status === 'loading') return

    this._status = 'loading'
    this._progress = 0
    this._error = null

    try {
      this.extractor = await pipeline('feature-extraction', this.modelName, {
        progress_callback: (info: { progress: number }) => {
          this._progress = info.progress
          onProgress?.(info.progress)
        },
      })
      this._status = 'ready'
      this._progress = 1
    } catch (e) {
      this._status = 'error'
      this._error = (e as Error).message
      throw e
    }
  }

  /**
   * 单文本向量化
   *
   * @param text - 要向量化的文本
   * @returns 向量数组（384 维或 768 维）
   */
  async embed(text: string): Promise<number[]> {
    if (!this.isReady()) {
      throw new Error('Embedding 引擎未就绪，请先调用 initialize()')
    }

    const result = await this.extractor!(text, {
      pooling: 'mean',
      normalize: true,
    })

    return Array.from(result.data as Float32Array)
  }

  /**
   * 批量向量化
   *
   * @param texts - 要向量化的文本数组
   * @returns 向量数组的数组
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!this.isReady()) {
      throw new Error('Embedding 引擎未就绪，请先调用 initialize()')
    }

    const results: number[][] = []

    for (const text of texts) {
      const result = await this.extractor!(text, {
        pooling: 'mean',
        normalize: true,
      })
      results.push(Array.from(result.data as Float32Array))
    }

    return results
  }

  /**
   * 切换模型（需要重新初始化）
   */
  changeModel(modelName: EmbeddingModel): void {
    this.modelName = modelName
    this.extractor = null
    this._status = 'idle'
    this._progress = 0
    this._error = null
  }
}

/** 全局单例 */
let _instance: EmbeddingEngine | null = null

/**
 * 获取全局 Embedding 引擎实例
 */
export function getEmbeddingEngine(): EmbeddingEngine {
  if (!_instance) {
    _instance = new EmbeddingEngine()
  }
  return _instance
}