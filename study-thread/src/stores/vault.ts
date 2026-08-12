import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { DirEntry, NoteMeta } from '../types'
import { listDir, startWatching, stopWatching, readFile, deleteFile, fileExists } from '../utils/vault-fs'
import { getSessionFilePath, saveSessionToVault } from '../utils/session-serializer'
import type { NoteReference } from '../utils/session-linker'
import type { Session } from '../types'
import { getNoteIndexer, type NoteIndexer } from '../embedding/indexer'
import { getEmbeddingEngine } from '../embedding/engine'
import { getReferencesDir, parseReferenceMeta } from '../utils/reference-serializer'
import { parseNoteDate } from '../utils/date'

const LAST_VAULT_KEY = 'study-thread-last-vault'

export const useVaultStore = defineStore('vault', () => {
  const vaultPath = ref<string | null>(null)
  const fileTree = ref<DirEntry[]>([])
  const isOpen = ref(false)
  const isIndexing = ref(false)
  const indexProgress = ref(0)
  /** 启动时 vault 恢复尝试是否已结束（无论成功/失败/无记录）；用于界面避免显示"未打开 vault"的闪烁 */
  const vaultReady = ref(false)

  const noteCount = computed(() => {
    // 简单实现：计数 notes 目录下的 .md 文件
    return 0
  })

  const sessionCount = computed(() => {
    return 0
  })

  async function openVault(path: string) {
    // 校验路径有效性：不存在 / 非目录 / 不可读时立即失败并抛错，避免"幽灵 Vault"——
    // 旧版会在路径失效（资料库被删除/移动/重命名）时静默"打开成功"，导致主界面统计、
    // 笔记、复习等文件读取全部失败并显示为空，而侧边栏会话等本地缓存数据仍显示，造成
    // "资料库有内容但统计为 0" 的假象。VaultSettings / restoreLastVault 已捕获该错误。
    try {
      await listDir(path)
    } catch {
      throw new Error(`目录不存在或无法读取：${path}`)
    }
    vaultPath.value = path
    isOpen.value = true
    vaultReady.value = true
    localStorage.setItem(LAST_VAULT_KEY, path)
    // 启动文件监听
    startWatching(path, (event) => {
      console.log('文件变更:', event)
      // 后续可触发自动刷新
    }).catch(console.error)
    // 读取文件树
    try {
      fileTree.value = await listDir(path)
    } catch (e) {
      console.error('读取文件树失败:', e)
    }

    // 后台加载索引
    initIndex().catch((e) => {
      console.warn('索引初始化失败（非关键功能）:', e)
    })
  }

  /**
   * 初始化笔记 + 参考资料向量索引
   *
   * 笔记索引仅在无缓存时全量构建；参考资料无论是否有缓存都会增量同步，
   * 因为上传/编辑可能发生在缓存建立之后。引擎未就绪时跳过，由 App 在引擎就绪后重新触发。
   */
  async function initIndex() {
    if (!vaultPath.value) return

    const indexer = getNoteIndexer()

    // 引擎未就绪时跳过：App.vue 会在引擎初始化完成后重新调用 initIndex
    if (!getEmbeddingEngine().isReady()) return

    const loaded = indexer.loadFromStorage()
    if (loaded) {
      console.log(`已加载索引缓存 (${indexer.size} 条)`)
    } else {
      // 首次构建（无缓存）：全量索引 notes 目录下的笔记
      const notesDir = fileTree.value.find((e) => e.name === 'notes' && e.is_dir)
      if (notesDir && notesDir.children) {
        const noteMetas: NoteMeta[] = (notesDir.children || [])
          .filter((e) => e.name.endsWith('.md'))
          .map((e) => ({
            path: e.path,
            title: e.name.replace('.md', ''),
            type: 'concept' as const,
            tags: [],
            created: '',
            updated: '',
          }))

        if (noteMetas.length > 0) {
          isIndexing.value = true
          indexProgress.value = 0
          try {
            await indexer.buildIndex(
              noteMetas,
              async (path) => {
                try {
                  return await readFile(path)
                } catch {
                  return ''
                }
              },
              (current, total) => {
                indexProgress.value = current / total
              },
            )
            console.log(`索引完成: ${indexer.size} 条笔记`)
          } finally {
            isIndexing.value = false
            indexProgress.value = 0
          }
        }
      }
    }

    // 参考资料：无论是否有缓存都增量同步（上传/编辑可能发生在缓存之后）
    await syncReferencesIndex(indexer)
  }

  /**
   * 增量同步参考资料索引
   *
   * md 类型全文嵌入，其余类型仅嵌入元数据（标题/描述/标签）。
   * 与 buildIndex 的跳过策略一致：已索引且 updated 未变时跳过，避免重复嵌入。
   */
  async function syncReferencesIndex(indexer: NoteIndexer) {
    if (!vaultPath.value) return

    const referencesDir = getReferencesDir(vaultPath.value)
    const refEntries = await listDir(referencesDir).catch(() => [] as DirEntry[])
    const refMetaEntries = refEntries.filter((e) => e.name.endsWith('.json'))
    if (refMetaEntries.length === 0) return

    // 已索引条目的 indexedAt，用于跳过未变更的参考资料
    const indexedAtByPath = new Map(indexer.getAllEntries().map((e) => [e.path, e.indexedAt]))

    let synced = 0
    for (const entry of refMetaEntries) {
      try {
        const meta = parseReferenceMeta(await readFile(entry.path))
        const updatedTime = parseNoteDate(meta.updated)?.getTime() ?? Number.POSITIVE_INFINITY
        const prevIndexedAt = indexedAtByPath.get(meta.path)
        if (prevIndexedAt !== undefined && updatedTime <= prevIndexedAt) continue

        const indexText = [
          meta.title,
          meta.description,
          meta.tags.join(' '),
          meta.fileType === 'md' ? await readFile(meta.filePath) : '',
        ]
          .filter(Boolean)
          .join('\n')
        await indexer.updateNote(meta.path, indexText)
        synced++
      } catch (e) {
        console.warn(`索引参考资料失败: ${entry.path}`, e)
      }
    }
    if (synced > 0) {
      console.log(`参考资料索引完成: 新增/更新 ${synced} 条`)
    }
  }

  async function restoreLastVault(): Promise<boolean> {
    const path = localStorage.getItem(LAST_VAULT_KEY)
    if (!path) {
      vaultReady.value = true
      return false
    }

    try {
      await openVault(path)
      return true
    } catch {
      localStorage.removeItem(LAST_VAULT_KEY)
      vaultReady.value = true
      return false
    }
  }

  function closeVault() {
    vaultPath.value = null
    fileTree.value = []
    isOpen.value = false
    vaultReady.value = true
    localStorage.removeItem(LAST_VAULT_KEY)
    // 停止文件监听
    stopWatching().catch(console.error)
  }

  /**
   * 删除 Vault 目录（永久删除，不可恢复）。
   *
   * 删除前必须先停止文件监听：Windows 下 notify watcher 持有目录句柄，
   * 直接删除会报"文件夹正在使用中"。删除当前打开的 vault 时同步清空状态
   * 与 last-vault 记录，界面回到"未打开 Vault"空态。
   */
  async function deleteVault(path: string): Promise<boolean> {
    try {
      await stopWatching()
      await deleteFile(path)
      if (vaultPath.value === path) {
        vaultPath.value = null
        fileTree.value = []
        isOpen.value = false
        vaultReady.value = true
        localStorage.removeItem(LAST_VAULT_KEY)
      }
      return true
    } catch (e) {
      console.error('删除 Vault 失败:', e)
      return false
    }
  }

  async function refreshFileTree() {
    if (vaultPath.value) {
      try {
        fileTree.value = await listDir(vaultPath.value)
      } catch (e) {
        console.error('刷新文件树失败:', e)
      }
    }
  }

  async function saveCurrentSession(
    session: Session,
    isBranch = false,
    noteRefs: NoteReference[] = [],
  ): Promise<string | null> {
    if (!vaultPath.value) return null
    try {
      const filePath = await saveSessionToVault(vaultPath.value, session, isBranch, noteRefs)
      await refreshFileTree()
      return filePath
    } catch (e) {
      console.error('保存会话失败:', e)
      return null
    }
  }

  async function deleteSession(sessionId: string, isBranch = false): Promise<boolean> {
    if (!vaultPath.value) return true

    try {
      const filePath = getSessionFilePath(vaultPath.value, sessionId, isBranch)
      if (await fileExists(filePath)) {
        await deleteFile(filePath)
      }
      await refreshFileTree()
      return true
    } catch (e) {
      console.error('删除会话文件失败:', e)
      return false
    }
  }

  return {
    vaultPath,
    fileTree,
    isOpen,
    isIndexing,
    indexProgress,
    vaultReady,
    noteCount,
    sessionCount,    openVault,
    restoreLastVault,
    closeVault,
    deleteVault,
    refreshFileTree,
    saveCurrentSession,
    deleteSession,
    initIndex,
  }
})
