import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ReferenceMeta } from '../types'
import { createDir, listDir, readFile, writeFile, deleteFile, writeFileBytes, readFileBytes } from '../utils/vault-fs'
import {
  generateReferenceId,
  getReferencesDir,
  getReferenceMetaPath,
  getReferenceFilePath,
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
 * 构建用于向量索引的文本：标题、描述、标签、md 正文
 */
async function buildIndexText(meta: ReferenceMeta): Promise<string> {
  const content = meta.fileType === 'md' ? await readFile(meta.filePath) : ''
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
        if (entry.is_dir || !entry.name.toLowerCase().endsWith('.json')) continue
        try {
          metas.push(parseReferenceMeta(await readFile(entry.path)))
        } catch {
          // 跳过损坏或无法解析的元数据文件
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

  async function uploadReference(vaultPath: string, file: File): Promise<ReferenceMeta | null> {
    const type = detectReferenceType(file.name)
    if (!type) return null

    const id = generateReferenceId()
    try {
      await createDir(getReferencesDir(vaultPath))
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
      }
      await writeFile(meta.path, serializeReferenceMeta(meta))

      references.value = sortReferences([...references.value, meta])

      // 尽力而为地同步向量索引，失败不影响上传结果
      try {
        const indexText = await buildIndexText(meta)
        await getNoteIndexer().updateNote(meta.path, indexText)
      } catch {
        // 索引失败静默处理
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
      try {
        const indexText = await buildIndexText(next)
        await getNoteIndexer().updateNote(next.path, indexText)
      } catch {
        // 索引失败静默处理
      }
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
  }
})
