import { describe, it, expect } from 'vitest'
import { existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * 内置模型/onnxruntime 资源完整性校验。
 * 这些文件随应用打包（Vite public 目录），保证 Embedding 功能完全离线可用；
 * 缺失或损坏会导致打包分发后用户的检索功能静默失效，因此用测试守住。
 */
const MODELS_DIR = resolve(process.cwd(), 'public/models')

/** 必需文件：相对 public/models 的路径 → 最小体积（字节），防截断下载 */
const REQUIRED_FILES: Record<string, number> = {
  // 模型文件（Xenova/all-MiniLM-L6-v2）
  'Xenova/all-MiniLM-L6-v2/config.json': 1,
  'Xenova/all-MiniLM-L6-v2/tokenizer.json': 100_000,
  'Xenova/all-MiniLM-L6-v2/tokenizer_config.json': 1,
  'Xenova/all-MiniLM-L6-v2/special_tokens_map.json': 1,
  'Xenova/all-MiniLM-L6-v2/vocab.txt': 50_000,
  'Xenova/all-MiniLM-L6-v2/onnx/model_quantized.onnx': 5_000_000,
  // onnxruntime wasm（本地加载，避免从 CDN 下载）
  'ort/ort-wasm-simd-threaded.wasm': 1_000_000,
  'ort/ort-wasm-simd.wasm': 1_000_000,
  'ort/ort-wasm-threaded.wasm': 1_000_000,
  'ort/ort-wasm.wasm': 1_000_000,
}

describe('内置模型资源', () => {
  it('所需模型与 wasm 文件齐全且非空', () => {
    for (const [relative, minBytes] of Object.entries(REQUIRED_FILES)) {
      const filePath = resolve(MODELS_DIR, relative)
      expect(existsSync(filePath), `缺少内置文件: ${relative}`).toBe(true)
      const size = statSync(filePath).size
      expect(size, `文件过小（可能截断）: ${relative}`).toBeGreaterThan(minBytes)
    }
  })
})
