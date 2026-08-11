#!/usr/bin/env node
/**
 * Embedding 模型与 onnxruntime wasm 资源下载/校验脚本
 *
 * public/models/ 被 .gitignore 忽略（二进制资源不入库），换机器/CI 构建时该目录会缺失，
 * 导致打包出的应用 Embedding 检索功能静默失效。本脚本用于：
 *
 *  - 默认模式：把模型与 wasm 完整下载/复制到 public/models/（幂等，已存在且非空则跳过）
 *  - --check   ：校验必需文件存在且体积达标，缺失时以非零退出码提示（构建前置门禁）
 *
 * 用法：
 *   node scripts/fetch-models.mjs                 # 下载（含 ort wasm，优先从 node_modules 复制）
 *   node scripts/fetch-models.mjs --mirror        # 使用 hf-mirror.com 国内镜像
 *   node scripts/fetch-models.mjs --force         # 强制覆盖已存在文件
 *   node scripts/fetch-models.mjs --check         # 校验完整性（供 npm run build 调用）
 *
 * 模型来源：HuggingFace Xenova/all-MiniLM-L6-v2（与 src/embedding/model-assets.test.ts 的
 * REQUIRED_FILES 清单保持一致；改动模型/文件清单时需同步两处）。
 */

import { copyFile, mkdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const PROJECT_ROOT = resolve(__dirname, '..')
export const MODELS_DIR = join(PROJECT_ROOT, 'public', 'models')

/** 必需文件：相对 public/models 的路径 → 最小体积（字节），防截断下载 */
export const REQUIRED_FILES = {
  'Xenova/all-MiniLM-L6-v2/config.json': 1,
  'Xenova/all-MiniLM-L6-v2/tokenizer.json': 100_000,
  'Xenova/all-MiniLM-L6-v2/tokenizer_config.json': 1,
  'Xenova/all-MiniLM-L6-v2/special_tokens_map.json': 1,
  'Xenova/all-MiniLM-L6-v2/vocab.txt': 50_000,
  'Xenova/all-MiniLM-L6-v2/onnx/model_quantized.onnx': 5_000_000,
  'ort/ort-wasm-simd-threaded.wasm': 1_000_000,
  'ort/ort-wasm-simd.wasm': 1_000_000,
  'ort/ort-wasm-threaded.wasm': 1_000_000,
  'ort/ort-wasm.wasm': 1_000_000,
}

/** HuggingFace 仓库中的模型文件（相对仓库根） */
const HF_REPO = 'Xenova/all-MiniLM-L6-v2'
const MODEL_FILES = [
  'config.json',
  'special_tokens_map.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'vocab.txt',
  'onnx/model_quantized.onnx',
]

/** onnxruntime-web wasm 文件名（与 transformers.js 加载路径 /models/ort/ 对应） */
const ORT_WASM_FILES = [
  'ort-wasm-simd-threaded.wasm',
  'ort-wasm-simd.wasm',
  'ort-wasm-threaded.wasm',
  'ort-wasm.wasm',
]

const HF_ENDPOINT = process.env.HF_ENDPOINT || 'https://huggingface.co'
const MIRROR_ENDPOINT = 'https://hf-mirror.com'

function log(message) {
  console.log(`[fetch-models] ${message}`)
}

function fail(message) {
  console.error(`[fetch-models] 错误: ${message}`)
  process.exit(1)
}

async function fileSizeOk(relativePath, minBytes) {
  try {
    const info = await stat(join(MODELS_DIR, relativePath))
    return info.isFile() && info.size > minBytes
  } catch {
    return false
  }
}

async function copyOrtFromNodeModules(force) {
  // 优先从 node_modules/onnxruntime-web/dist 复制：版本与 transformers.js 依赖完全一致且离线可用
  const candidates = [
    join(PROJECT_ROOT, 'node_modules', 'onnxruntime-web', 'dist'),
    join(PROJECT_ROOT, '..', 'node_modules', 'onnxruntime-web', 'dist'),
  ]
  for (const distDir of candidates) {
    let ok = true
    for (const name of ORT_WASM_FILES) {
      if (!(await fileSizeOk(`ort/${name}`, REQUIRED_FILES[`ort/${name}`]))) {
        ok = false
        break
      }
    }
    if (ok && !force) {
      log('ort wasm 已存在且完整，跳过')
      return
    }
    try {
      await mkdir(join(MODELS_DIR, 'ort'), { recursive: true })
      const copied = []
      for (const name of ORT_WASM_FILES) {
        const src = join(distDir, name)
        const dest = join(MODELS_DIR, 'ort', name)
        await copyFile(src, dest)
        copied.push(name)
      }
      log(`已从 node_modules/onnxruntime-web/dist 复制 ort wasm（${copied.length} 个文件）`)
      return
    } catch {
      // 该候选目录不可用，尝试下一个
    }
  }
  fail(
    '未找到 node_modules/onnxruntime-web/dist 下的 wasm 文件。请先运行 npm install，' +
      '或手动将 onnxruntime-web 的 dist/*.wasm 复制到 public/models/ort/。',
  )
}

async function downloadFile(url, destPath, minBytes) {
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText} (${url})`)
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.length <= minBytes) {
    throw new Error(`下载文件过小（${buffer.length} 字节），疑似拦截页或截断: ${url}`)
  }
  await mkdir(dirname(destPath), { recursive: true })
  await writeFile(destPath, buffer)
}

async function downloadModelFiles(useMirror, force) {
  const endpoint = useMirror ? MIRROR_ENDPOINT : HF_ENDPOINT
  log(`模型来源: ${endpoint}/${HF_REPO}`)
  for (const rel of MODEL_FILES) {
    const minBytes = REQUIRED_FILES[`Xenova/all-MiniLM-L6-v2/${rel}`]
    if (!force && (await fileSizeOk(`Xenova/all-MiniLM-L6-v2/${rel}`, minBytes))) {
      log(`跳过（已存在）: ${rel}`)
      continue
    }
    const url = `${endpoint}/${HF_REPO}/resolve/main/${rel}`
    const dest = join(MODELS_DIR, 'Xenova', 'all-MiniLM-L6-v2', rel)
    try {
      await downloadFile(url, dest, minBytes)
      log(`已下载: ${rel}`)
    } catch (error) {
      fail(`${rel} 下载失败：${error instanceof Error ? error.message : error}`)
    }
  }
}

async function check() {
  const missing = []
  for (const [rel, minBytes] of Object.entries(REQUIRED_FILES)) {
    if (!(await fileSizeOk(rel, minBytes))) {
      missing.push(rel)
    }
  }
  if (missing.length === 0) {
    log('内置模型资源完整，OK')
    return
  }
  console.error(
    `[fetch-models] 缺少内置模型/wasm 资源（${missing.length} 项）：\n  ${missing.join('\n  ')}\n` +
      '请先运行 `npm run fetch:models`（国内网络可加 --mirror）补齐后再构建。',
  )
  process.exit(1)
}

async function main() {
  const args = process.argv.slice(2)
  const useMirror = args.includes('--mirror')
  const force = args.includes('--force')

  if (args.includes('--check')) {
    await check()
    return
  }

  log(`目标目录: ${MODELS_DIR}`)
  await mkdir(MODELS_DIR, { recursive: true })
  await copyOrtFromNodeModules(force)
  await downloadModelFiles(useMirror, force)
  await check()
  log('完成。现在可以执行 npm run tauri build 打包。')
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)))
