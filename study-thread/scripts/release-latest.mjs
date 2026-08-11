#!/usr/bin/env node
/**
 * 自动更新发版清单生成脚本（Tauri updater latest.json 生成器）
 *
 * Tauri updater 通过远端 `latest.json` 清单发现新版本，清单中每条记录包含
 * 目标平台的安装包下载地址与签名（.sig 内容）。本脚本从本地构建产物中
 * 自动收集安装包与对应签名，生成可直接上传到 GitHub Release 的清单。
 *
 * 前置条件：
 *   1. 已执行 `npm run tauri build`（构建时需配置 TAURI_SIGNING_PRIVATE_KEY，
 *      产物旁才会生成 *.sig 签名文件）
 *   2. 产物目录存在安装包（src-tauri/target/release/bundle/<target>/ 下）
 *
 * 用法：
 *   node scripts/release-latest.mjs                            # 扫描产物生成 latest.json
 *   node scripts/release-latest.mjs --notes "v0.1 测试版发布"    # 附带发版说明
 *   node scripts/release-latest.mjs --notes-file RELEASE.md     # 从文件读取发版说明
 *   node scripts/release-latest.mjs --output dist/latest.json   # 指定输出路径（默认打印到 stdout）
 *
 * 输出：打印生成的 latest.json 内容 + 需要上传到 GitHub Release 的文件清单。
 *
 * 与 fetch-models.mjs 一致，本脚本为构建/发版辅助工具，不参与应用运行时。
 */

import { readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '..')
const BUNDLE_ROOT = join(PROJECT_ROOT, 'src-tauri', 'target', 'release', 'bundle')

/** 目标目录 → updater 平台键（安装包后缀 → 平台键的兜底映射，实际以目录名为准） */
const TARGET_PLATFORM = {
  nsis: 'windows-x86_64',
  msi: 'windows-x86_64',
  'msi-arm64': 'windows-aarch64',
  'nsis-arm64': 'windows-aarch64',
  dmg: 'darwin-x86_64',
  'dmg-arm64': 'darwin-aarch64',
  app: 'darwin-x86_64',
  'app-arm64': 'darwin-aarch64',
  deb: 'linux-x86_64',
  'deb-arm64': 'linux-aarch64',
  rpm: 'linux-x86_64',
  appimage: 'linux-x86_64',
}

/** 同一平台出现多个产物时的选择优先级（Windows 优先 NSIS，自更新支持更好） */
const TARGET_PREFERENCE = ['nsis', 'msi', 'dmg', 'app', 'appimage', 'deb', 'rpm']

function log(message) {
  console.log(`[release-latest] ${message}`)
}

function fail(message) {
  console.error(`[release-latest] 错误: ${message}`)
  process.exit(1)
}

/** 读取 tauri.conf.json 中的版本号 */
async function readVersion() {
  const conf = JSON.parse(
    await readFile(join(PROJECT_ROOT, 'src-tauri', 'tauri.conf.json'), 'utf-8'),
  )
  if (!conf.version) fail('tauri.conf.json 中缺少 version 字段')
  return String(conf.version)
}

/** 读取发版说明 */
async function readNotes(args, version) {
  const inlineIdx = args.indexOf('--notes')
  if (inlineIdx !== -1 && args[inlineIdx + 1]) return args[inlineIdx + 1]
  const fileIdx = args.indexOf('--notes-file')
  if (fileIdx !== -1 && args[fileIdx + 1]) {
    return await readFile(resolve(PROJECT_ROOT, args[fileIdx + 1]), 'utf-8')
  }
  return `知枝 v${version} 更新`
}

/** 扫描产物目录，收集 { target, artifactPath, sigPath } */
async function collectArtifacts() {
  const found = []
  let targetDirs
  try {
    targetDirs = await readdir(BUNDLE_ROOT)
  } catch {
    fail(
      `未找到产物目录 ${BUNDLE_ROOT}。请先执行 \`npm run tauri build\`（并配置 ` +
        'TAURI_SIGNING_PRIVATE_KEY 以生成签名文件）。',
    )
  }
  for (const target of targetDirs) {
    const platform = TARGET_PLATFORM[target]
    if (!platform) continue
    const dir = join(BUNDLE_ROOT, target)
    let files
    try {
      files = await readdir(dir)
    } catch {
      continue
    }
    for (const file of files) {
      // 跳过签名文件本身与目录
      if (file.endsWith('.sig') || file.endsWith('.json')) continue
      const artifactPath = join(dir, file)
      const info = await stat(artifactPath).catch(() => null)
      if (!info || !info.isFile()) continue
      // 仅收集安装包类产物（exe/msi/dmg/app/appimage/deb/rpm）
      if (!/\.(exe|msi|dmg|appimage|deb|rpm)$/i.test(file)) continue
      const sigPath = `${artifactPath}.sig`
      const hasSig = await stat(sigPath).then(() => true).catch(() => false)
      found.push({ platform, target, artifactPath, sigPath, hasSig })
    }
  }
  return found
}

/** 同一平台多产物去重（按 TARGET_PREFERENCE 优先级取最优） */
function pickBestPerPlatform(found) {
  const best = new Map()
  for (const item of found) {
    const current = best.get(item.platform)
    if (!current) {
      best.set(item.platform, item)
      continue
    }
    const rank = (t) => {
      const i = TARGET_PREFERENCE.indexOf(t)
      return i === -1 ? TARGET_PREFERENCE.length : i
    }
    if (rank(item.target) < rank(current.target)) best.set(item.platform, item)
  }
  return [...best.values()]
}

/**
 * GitHub 会对 Release 资产名做规范化：实测非 ASCII 字符（如中文产品名）会在
 * 上传时被剥离（`知枝_0.1.0_x64-setup.exe` → `_0.1.0_x64-setup.exe`）。
 * 这里与 GitHub 行为保持一致，生成与实际存储名匹配的下载 URL。
 */
function sanitizeAssetName(name) {
  const sanitized = name.replace(/[^\x20-\x7E]/g, '')
  if (sanitized !== name) {
    log(`资产名含非 ASCII 字符，GitHub 将剥离为：${sanitized}`)
  }
  return sanitized
}

async function main() {
  const args = process.argv.slice(2)
  const outputIdx = args.indexOf('--output')
  const outputPath = outputIdx !== -1 && args[outputIdx + 1]
    ? resolve(PROJECT_ROOT, args[outputIdx + 1])
    : null

  const version = await readVersion()
  const notes = (await readNotes(args, version)).replace('{version}', version)

  const found = await collectArtifacts()
  if (found.length === 0) {
    fail('产物目录中未找到安装包。请先执行 npm run tauri build。')
  }
  const selected = pickBestPerPlatform(found)

  const missingSig = selected.filter((item) => !item.hasSig)
  if (missingSig.length > 0) {
    fail(
      '以下产物缺少 *.sig 签名文件：\n' +
        missingSig.map((i) => `  ${i.artifactPath}`).join('\n') +
        '\n构建时请配置 TAURI_SIGNING_PRIVATE_KEY（tauri build 会自动生成签名）。' +
        '缺少签名将导致客户端校验失败，无法更新。',
    )
  }

  const baseUrl = args.find((a) => a.startsWith('--base-url='))?.split('=')[1]
  if (!baseUrl) {
    fail(
      '缺少 --base-url 参数（GitHub Release 下载根地址），' +
        '例如：node scripts/release-latest.mjs --base-url=https://github.com/<OWNER>/<REPO>/releases/latest/download',
    )
  }

  const platforms = {}
  for (const item of selected) {
    let signature = ''
    if (item.hasSig) {
      signature = (await readFile(item.sigPath, 'utf-8')).trim()
    }
    const fileName = relative(BUNDLE_ROOT, item.artifactPath).split(/[\\/]/).pop()
    const assetName = sanitizeAssetName(fileName)
    platforms[item.platform] = {
      signature,
      url: `${baseUrl}/${encodeURIComponent(assetName)}`,
    }
  }

  const manifest = {
    version,
    notes,
    pub_date: new Date().toISOString(),
    platforms,
  }

  const json = `${JSON.stringify(manifest, null, 2)}\n`
  if (outputPath) {
    await writeFile(outputPath, json)
    log(`已写入 ${outputPath}`)
  } else {
    console.log(json)
  }

  console.log('='.repeat(60))
  console.log(`请将以下文件一并上传到 GitHub Release（${version}）：`)
  for (const item of selected) {
    console.log(`  - ${item.artifactPath}`)
    if (item.hasSig) console.log(`  - ${item.sigPath}`)
  }
  if (outputPath) console.log(`  - ${outputPath}（改名为 latest.json 上传）`)
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)))
