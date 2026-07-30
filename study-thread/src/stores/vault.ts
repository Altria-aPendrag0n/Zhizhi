import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { DirEntry } from '../types'
import { listDir, startWatching, stopWatching } from '../utils/vault-fs'
import { saveSessionToVault } from '../utils/session-serializer'
import type { Session } from '../types'

export const useVaultStore = defineStore('vault', () => {
  const vaultPath = ref<string | null>(null)
  const fileTree = ref<DirEntry[]>([])
  const isOpen = ref(false)

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
  }

  function closeVault() {
    vaultPath.value = null
    fileTree.value = []
    isOpen.value = false
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

  async function saveCurrentSession(session: Session, isBranch = false): Promise<string | null> {
    if (!vaultPath.value) return null
    try {
      const filePath = await saveSessionToVault(vaultPath.value, session, isBranch)
      await refreshFileTree()
      return filePath
    } catch (e) {
      console.error('保存会话失败:', e)
      return null
    }
  }

  return {
    vaultPath,
    fileTree,
    isOpen,
    noteCount,
    sessionCount,
    openVault,
    closeVault,
    refreshFileTree,
    saveCurrentSession,
  }
})