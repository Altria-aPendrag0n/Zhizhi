import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { DirEntry } from '../types'
import { startWatching, stopWatching } from '../utils/vault-fs'

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

  function openVault(path: string) {
    vaultPath.value = path
    isOpen.value = true
    // 启动文件监听
    startWatching(path, (event) => {
      console.log('文件变更:', event)
      // 后续可触发自动刷新
    }).catch(console.error)
  }

  function closeVault() {
    vaultPath.value = null
    fileTree.value = []
    isOpen.value = false
    // 停止文件监听
    stopWatching().catch(console.error)
  }

  async function refreshFileTree() {
    // 后续任务会实现
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
  }
})