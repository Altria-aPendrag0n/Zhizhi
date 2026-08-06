import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EmbeddingEngine } from './engine'

const { pipelineMock, env } = vi.hoisted(() => {
  const env = {
    localModelPath: '',
    allowLocalModels: true,
    allowRemoteModels: true,
    backends: { onnx: { wasm: {} as Record<string, unknown> } },
  }
  return { pipelineMock: vi.fn(), env }
})

vi.mock('@xenova/transformers', () => ({
  env,
  pipeline: pipelineMock,
}))

/** 假 extractor：仅测试初始化流程，不执行真实嵌入 */
const fakeExtractor = { name: 'fake-extractor' } as never

beforeEach(() => {
  pipelineMock.mockReset()
})

describe('EmbeddingEngine.initialize（内置模型本地加载）', () => {
  it('配置本地模型路径、本地 wasm，并强制禁止远程下载', async () => {
    pipelineMock.mockResolvedValue(fakeExtractor)
    const engine = new EmbeddingEngine()

    await engine.initialize()

    expect(env.localModelPath).toBe('/models/')
    expect(env.allowLocalModels).toBe(true)
    expect(env.allowRemoteModels).toBe(false)
    expect(env.backends.onnx.wasm.wasmPaths).toBe('/models/ort/')
  })

  it('本地模型加载成功后进入就绪状态', async () => {
    pipelineMock.mockResolvedValue(fakeExtractor)
    const engine = new EmbeddingEngine()

    await engine.initialize()

    expect(engine.status).toBe('ready')
    expect(engine.isReady()).toBe(true)
    expect(pipelineMock).toHaveBeenCalledTimes(1)
  })

  it('本地模型加载失败时进入 error 状态并抛出带指引的错误', async () => {
    pipelineMock.mockRejectedValue(new Error('file not found locally'))
    const engine = new EmbeddingEngine()

    const promise = engine.initialize()
    await expect(promise).rejects.toThrow(/内置 Embedding 模型加载失败/)
    await expect(promise).rejects.toThrow(/public\/models/)

    expect(engine.status).toBe('error')
    expect(engine.isReady()).toBe(false)
    // 失败后清理缓存并重试一次，共 2 次尝试
    expect(pipelineMock).toHaveBeenCalledTimes(2)
  })

  it('首次失败（疑似脏缓存）时清理缓存并重试成功', async () => {
    pipelineMock
      .mockRejectedValueOnce(new Error('Unexpected token <, "<!doctype" is not valid JSON'))
      .mockResolvedValueOnce(fakeExtractor)
    const engine = new EmbeddingEngine()

    await engine.initialize()

    expect(engine.isReady()).toBe(true)
    expect(pipelineMock).toHaveBeenCalledTimes(2)
  })

  it('已就绪后再次 initialize 不会重复加载模型', async () => {
    pipelineMock.mockResolvedValue(fakeExtractor)
    const engine = new EmbeddingEngine()

    await engine.initialize()
    await engine.initialize()

    expect(pipelineMock).toHaveBeenCalledTimes(1)
    expect(engine.isReady()).toBe(true)
  })
})
