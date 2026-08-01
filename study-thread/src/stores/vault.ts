import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { DirEntry, NoteMeta } from '../types'
import { listDir, startWatching, stopWatching, readFile, deleteFile, fileExists } from '../utils/vault-fs'
import { getSessionFilePath, saveSessionToVault } from '../utils/session-serializer'
import type { NoteReference } from '../utils/session-linker'
import type { Session } from '../types'
import { getNoteIndexer } from '../embedding/indexer'

const LAST_VAULT_KEY = 'study-thread-last-vault'

export const useVaultStore = defineStore('vault', () => {
  const vaultPath = ref<string | null>(null)
  const fileTree = ref<DirEntry[]>([])
  const isOpen = ref(false)
  const isIndexing = ref(false)
  const indexProgress = ref(0)

  const noteCount = computed(() => {
    // 简单实现：计数 notes 目录下的 .md 文件
    return 0
  })

  const sessionCount = computed(() => {
    return 0
  })

  async function openVault(path: string) {
    vaultPath.value = path
    isOpen.value = true
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
   * 初始化笔记向量索引
   */
  async function initIndex() {
    if (!vaultPath.value) return

    const indexer = getNoteIndexer()

    // 从 localStorage 加载已有索引
    const loaded = indexer.loadFromStorage()
    if (loaded) {
      console.log(`已加载索引缓存 (${indexer.size} 条)`)
      return
    }

    // 需要全量索引（首次或缓存失效）
    // 收集 notes 目录下的笔记
    const notesDir = fileTree.value.find((e) => e.name === 'notes' && e.is_dir)
    if (!notesDir || !notesDir.children) return

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

    if (noteMetas.length === 0) return

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

  async function restoreLastVault(): Promise<boolean> {
    const path = localStorage.getItem(LAST_VAULT_KEY)
    if (!path) return false

    try {
      await openVault(path)
      return true
    } catch {
      localStorage.removeItem(LAST_VAULT_KEY)
      return false
    }
  }

  function closeVault() {
    vaultPath.value = null
    fileTree.value = []
    isOpen.value = false
    localStorage.removeItem(LAST_VAULT_KEY)
    // 停止文件监听
    stopWatching().catch(console.error)
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
    noteCount,
    sessionCount,    openVault,
    restoreLastVault,
    closeVault,
    refreshFileTree,
    saveCurrentSession,
    deleteSession,
    initIndex,
  }
})
