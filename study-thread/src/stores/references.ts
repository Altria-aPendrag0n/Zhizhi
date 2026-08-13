import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ReferenceMeta } from '../types'
import { createDir, listDir, readFile, writeFile, deleteFile, writeFileBytes, readFileBytes, extractPdfText } from '../utils/vault-fs'
import type { DirEntry } from '../utils/vault-fs'
import {
  generateReferenceId,
  getReferencesDir,
  getReferenceDir,
  getReferenceMetaPath,
  getReferenceFilePath,
  getReferenceExtractedPath,
  detectReferenceType,
  serializeReferenceMeta,
  parseReferenceMeta,
  sanitizeFileName,
} from '../utils/reference-serializer'
import { getNoteIndexer } from '../embedding/indexer'

function sortReferences(references: ReferenceMeta[]): ReferenceMeta[] {
  return [...references].sort((a, b) => b.updated.localeCompare(a.updated))
}

/**
 * 用 sanitizeFileName 的清理规则处理原始文件名（去掉扩展名部分），作为参考资料标题
 */
function toReferenceTitle(fileName: string): string {
  const cleaned = sanitizeFileName(fileName)
  const dotIndex = cleaned.lastIndexOf('.')
  return dotIndex > 0 ? cleaned.slice(0, dotIndex) : cleaned
}

/**
 * 构建用于向量索引的文本：标题、描述、标签、正文（md 读原文件，已解析的 pdf 读提取产物）
 */
async function buildIndexText(meta: ReferenceMeta): Promise<string> {
  let content = ''
  if (meta.fileType === 'md') {
    content = await readFile(meta.filePath)
  } else if (meta.fileType === 'pdf' && meta.extractedPath) {
    try {
      content = await readFile(meta.extractedPath)
    } catch {
      // 提取产物尚未生成或读取失败：仅索引元数据
      content = ''
    }
  }
  return [meta.title, meta.description, meta.tags.join(' '), content].filter(Boolean).join('\n')
}

/**
 * 将字节数组编码为 base64（分块拼接避免大数组导致栈溢出）
 */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

export const useReferenceStore = defineStore('references', () => {
  const references = ref<ReferenceMeta[]>([])
  const isLoading = ref(false)
  const currentVaultPath = ref<string | null>(null)

  const referenceCount = computed(() => references.value.length)

  async function loadAllReferences(vaultPath: string) {
    isLoading.value = true
    try {
      currentVaultPath.value = vaultPath
      const entries = await listDir(getReferencesDir(vaultPath))
      const metas: ReferenceMeta[] = []
      for (const entry of entries) {
        // 新格式：每个参考资料一个自包含文件夹，元数据位于 {dir}/{name}.json
        if (entry.is_dir) {
          try {
            metas.push(parseReferenceMeta(await readFile(getReferenceMetaPath(vaultPath, entry.name))))
          } catch {
            // 跳过损坏或无法解析的元数据文件
          }
          continue
        }
        // 旧扁平格式：根目录 {id}.json，做懒迁移后读取
        if (entry.name.toLowerCase().endsWith('.json')) {
          try {
            const migrated = await migrateLegacyReference(vaultPath, entry)
            if (migrated) {
              metas.push(migrated)
              continue
            }
          } catch {
            // 迁移失败，回退为直接读取（兼容只读/失败场景）
          }
          try {
            metas.push(parseReferenceMeta(await readFile(entry.path)))
          } catch {
            // 跳过损坏或无法解析的元数据文件
          }
        }
      }
      references.value = sortReferences(metas)
    } catch {
      // 目录不存在或读取失败时静默置空列表
      references.value = []
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 懒迁移旧扁平格式参考资料到自包含文件夹：
   * 读取根目录 {id}.json 与 {id}.{ext}，复制到 {id}/ 下并删除旧文件。
   * 任一步失败返回 null（旧文件保留，下次扫描重试，幂等）。
   */
  async function migrateLegacyReference(vaultPath: string, entry: DirEntry): Promise<ReferenceMeta | null> {
    const oldMeta = parseReferenceMeta(await readFile(entry.path))
    const id = oldMeta.id
    if (!id) return null

    const dir = getReferenceDir(vaultPath, id)
    const newFilePath = getReferenceFilePath(vaultPath, id, oldMeta.fileType)

    // 迁移原始文件（二进制读回，兼容 md/pdf/png）
    if (oldMeta.filePath && oldMeta.filePath !== newFilePath) {
      try {
        const bytes = await readFileBytes(oldMeta.filePath)
        await writeFileBytes(newFilePath, bytes)
        await deleteFile(oldMeta.filePath)
      } catch {
        return null
      }
    }

    // 写新元数据并删除旧元数据
    try {
      const migrated: ReferenceMeta = {
        ...oldMeta,
        path: getReferenceMetaPath(vaultPath, id),
        filePath: newFilePath,
      }
      await writeFile(migrated.path, serializeReferenceMeta(migrated))
      await deleteFile(entry.path)
      return migrated
    } catch {
      return null
    }
  }

  /** 写元数据文件并按 path 更新内存列表（保持 updated 降序） */
  async function persistMeta(meta: ReferenceMeta): Promise<void> {
    await writeFile(meta.path, serializeReferenceMeta(meta))
    references.value = sortReferences(references.value.map((item) => (item.path === meta.path ? meta : item)))
  }

  /** 尽力而为地重建单篇参考资料的向量索引（失败不影响主流程） */
  async function refreshIndex(meta: ReferenceMeta): Promise<void> {
    try {
      const indexText = await buildIndexText(meta)
      await getNoteIndexer().updateNote(meta.path, indexText)
    } catch {
      // 索引失败静默处理
    }
  }

  /**
   * 解析一个 pdf 参考资料：pending → parsing → parsed / failed。
   * 成功后写 {id}.extracted.md 并回填页数/字符数/产物路径；失败写 parseError。
   * 解析不阻塞调用方（uploadReference 后台触发）。
   */
  async function parseReference(meta: ReferenceMeta, vaultPath: string): Promise<void> {
    if (meta.fileType !== 'pdf') return

    // 进入 parsing 状态（清除旧错误），立即回写供 UI 展示
    const parsing: ReferenceMeta = { ...meta, parseStatus: 'parsing', parseError: undefined }
    await persistMeta(parsing)

    try {
      const result = await extractPdfText(meta.filePath)
      const extractedPath = getReferenceExtractedPath(vaultPath, meta.id)
      await writeFile(extractedPath, result.markdown)

      const parsed: ReferenceMeta = {
        ...parsing,
        parseStatus: 'parsed',
        pageCount: result.page_count,
        extractedChars: result.chars,
        extractedPath,
        extractedAt: new Date().toISOString(),
      }
      await persistMeta(parsed)
      // 解析成功后用提取正文重建索引，使 pdf 内容可被知识检索命中
      await refreshIndex(parsed)
    } catch (e) {
      const failed: ReferenceMeta = {
        ...parsing,
        parseStatus: 'failed',
        parseError: e instanceof Error ? e.message : String(e),
      }
      await persistMeta(failed)
    }
  }

  /** 重新解析一个解析失败的 pdf（供 UI「重试」按钮） */
  async function retryParseReference(metaPath: string): Promise<void> {
    const meta = references.value.find((item) => item.path === metaPath)
    if (!meta || meta.fileType !== 'pdf') return
    const vaultPath = currentVaultPath.value
    if (!vaultPath) return
    await parseReference(meta, vaultPath)
  }

  async function uploadReference(vaultPath: string, file: File): Promise<ReferenceMeta | null> {
    const type = detectReferenceType(file.name)
    if (!type) return null

    currentVaultPath.value = vaultPath

    const id = generateReferenceId()
    try {
      await createDir(getReferenceDir(vaultPath, id))
      const filePath = getReferenceFilePath(vaultPath, id, type)
      const bytes = new Uint8Array(await file.arrayBuffer())
      await writeFileBytes(filePath, bytes)

      const now = new Date().toISOString()
      const meta: ReferenceMeta = {
        id,
        path: getReferenceMetaPath(vaultPath, id),
        title: toReferenceTitle(file.name),
        description: '',
        tags: [],
        fileType: type,
        fileName: file.name,
        filePath,
        created: now,
        updated: now,
        // pdf 初始为待解析，md/png 不设置解析状态
        parseStatus: type === 'pdf' ? 'pending' : undefined,
      }
      await writeFile(meta.path, serializeReferenceMeta(meta))

      references.value = sortReferences([...references.value, meta])

      // md 立即用正文索引；pdf 先用元数据索引（解析完成后用提取正文重建）
      await refreshIndex(meta)

      // pdf 上传后立即后台解析（不阻塞上传返回）
      if (type === 'pdf') {
        void parseReference(meta, vaultPath)
      }

      return meta
    } catch (error) {
      console.error('上传参考资料失败:', error)
      return null
    }
  }

  async function updateReference(meta: ReferenceMeta): Promise<ReferenceMeta | null> {
    try {
      const updated = new Date().toISOString()
      const next: ReferenceMeta = { ...meta, updated }
      await writeFile(next.path, serializeReferenceMeta(next))
      references.value = sortReferences([...references.value.filter((item) => item.path !== next.path), next])

      // 尽力而为地重算索引
      await refreshIndex(next)
      return next
    } catch (error) {
      console.error('更新参考资料失败:', error)
      return null
    }
  }

  async function deleteReference(metaPath: string): Promise<boolean> {
    const meta = references.value.find((item) => item.path === metaPath)
    if (!meta) return false

    let success = true
    // 新文件夹结构：递归删除整个自包含文件夹（含元数据/原始文件/提取产物）；
    // 旧扁平结构（兼容）：删除元数据 JSON 与原始文件两个文件
    const isDirLayout = meta.path.endsWith(`/${meta.id}/${meta.id}.json`)
    if (isDirLayout) {
      const dir = meta.path.slice(0, meta.path.lastIndexOf('/'))
      try {
        await deleteFile(dir)
      } catch {
        success = false
      }
    } else {
      try {
        await deleteFile(meta.path)
      } catch {
        success = false
      }
      try {
        await deleteFile(meta.filePath)
      } catch {
        success = false
      }
    }

    references.value = references.value.filter((item) => item.path !== metaPath)
    getNoteIndexer().removeNote(meta.path)
    return success
  }

  async function loadReferencePreview(meta: ReferenceMeta): Promise<string> {
    if (meta.fileType === 'md') {
      return readFile(meta.filePath)
    }
    if (meta.fileType === 'png') {
      const bytes = await readFileBytes(meta.filePath)
      return `data:image/png;base64,${bytesToBase64(bytes)}`
    }
    return ''
  }

  return {
    references,
    isLoading,
    currentVaultPath,
    referenceCount,
    loadAllReferences,
    uploadReference,
    updateReference,
    deleteReference,
    loadReferencePreview,
    retryParseReference,
  }
})
