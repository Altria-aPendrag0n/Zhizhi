/**
 * 本地 Embedding 引擎
 *
 * 基于 transformers.js 的本地文本向量化引擎。
 * 支持 all-MiniLM-L6-v2（英文优先）和 text2vec-base-chinese（中文优先）模型。
 * 模型与 onnxruntime wasm 均随应用内置（public/models），完全离线加载，不访问网络。
 */

import { env, pipeline, type FeatureExtractionPipeline } from '@xenova/transformers'

/** 支持的模型名称 */
export type EmbeddingModel = 'Xenova/all-MiniLM-L6-v2' | 'Xenova/text2vec-base-chinese'

/** 默认模型：英文 384 维 */
const DEFAULT_MODEL: EmbeddingModel = 'Xenova/all-MiniLM-L6-v2'

/**
 * 配置 transformers.js 使用应用内置的本地资源，实现完全离线可用：
 * - 模型文件随应用打包在 `/models/` 下（Vite public 目录，构建时复制到 dist）
 * - onnxruntime 的 wasm 也本地化到 `/models/ort/`，避免从 CDN 下载
 *
 * 强制 `allowRemoteModels = false`：模型只从本地加载，绝不访问网络，
 * 避免用户环境网络被拦截时回退远程下载导致反复失败。
 */
function configureLocalModelEnv(): void {
  env.localModelPath = '/models/'
  env.allowLocalModels = true
  env.allowRemoteModels = false
  if (env.backends?.onnx?.wasm) {
    env.backends.onnx.wasm.wasmPaths = '/models/ort/'
  }
}

/** 引擎初始化状态 */
export type EngineStatus = 'idle' | 'loading' | 'ready' | 'error'

/** transformers.js 浏览器 Cache Storage 名称（与其内部实现保持一致） */
const TRANSFORMERS_CACHE = 'transformers-cache'

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
   * 初始化引擎，加载内置模型
   *
   * 模型只从本地资源（`/models/`）加载，`allowRemoteModels = false`
   * 保证不发起任何网络请求。
   *
   * 本地文件加载失败时，先清理该模型在浏览器 Cache Storage 中的条目再重试一次：
   * 若开发服务器在模型文件加入前启动，`/models/...` 会 404 并回退返回 index.html（200），
   * 该 HTML 会被 transformers.js 缓存，导致此后即使文件存在也一直命中脏缓存报
   * “Unexpected token '<'”（HTML 被当作 JSON 解析）。
   *
   * @param onProgress - 可选的进度回调，接收 0-1 的进度值
   */
  async initialize(onProgress?: (progress: number) => void): Promise<void> {
    if (this._status === 'ready') return
    if (this._status === 'loading') return

    this._status = 'loading'
    this._progress = 0
    this._error = null

    configureLocalModelEnv()

    let lastError: unknown = null
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        this.extractor = await pipeline('feature-extraction', this.modelName, {
          progress_callback: (info: { progress: number }) => {
            this._progress = info.progress
            onProgress?.(info.progress)
          },
        })
        this._status = 'ready'
        this._progress = 1
        return
      } catch (e) {
        lastError = e
        this.extractor = null
        // 清理本地模型路径下可能被污染的缓存（如曾缓存的 index.html），再重试一次
        await this.clearLocalModelCache()
        console.warn(
          `[embedding] 内置模型本地加载失败${attempt === 0 ? '，清理缓存后重试' : ''}: ${e instanceof Error ? e.message : String(e)}`,
        )
      }
    }

    const detail = lastError instanceof Error ? lastError.message : String(lastError)
    const message =
      '内置 Embedding 模型加载失败：请确认应用资源中包含 public/models 目录下的完整模型文件 ' +
      `（${this.modelName} 的 config/tokenizer/onnx 文件及 ort/*.wasm）。原因: ${detail}`
    this._status = 'error'
    this._error = message
    console.warn(`[embedding] ${message}`)
    throw new Error(message)
  }

  /**
   * 清理本地模型路径（`/models/`）在浏览器 Cache Storage 中的条目
   */
  private async clearLocalModelCache(): Promise<void> {
    try {
      if (typeof caches === 'undefined') return
      const cache = await caches.open(TRANSFORMERS_CACHE)
      const keys = await cache.keys()
      for (const request of keys) {
        if (request.url.includes('/models/')) {
          await cache.delete(request)
        }
      }
    } catch {
      // 清理失败不影响主流程
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
