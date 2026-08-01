import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Session, Message } from '../types'
import {
  type SessionTreeNode,
  createRootNode,
  createBranchNode,
  addBranchToTree,
  findNode,
  serializeTree,
  deserializeTree,
} from '../utils/session-tree'
import { readFile, writeFile, createDir, fileExists } from '../utils/vault-fs'
import { getSessionFilePath, saveSessionToVault } from '../utils/session-serializer'

export const useSessionStore = defineStore('session', () => {
  const sessions = ref<Session[]>([])
  const currentSessionId = ref<string | null>(null)
  const messages = ref<Message[]>([])
  const isStreaming = ref(false)
  const sessionTree = ref<SessionTreeNode | null>(null)
  let sessionCounter = 0
  let branchCounter = 0

  const currentSession = computed(() =>
    sessions.value.find((session) => session.id === currentSessionId.value) || null,
  )

  function createSession(title: string = '新会话'): string {
    sessionCounter++
    const id = `sess_${Date.now()}_${sessionCounter}`
    const session: Session = {
      id,
      title,
      created: new Date().toISOString(),
      parent_session: null,
      fork_point: null,
      tags: [],
      messages: [],
    }
    sessions.value.push(session)
    currentSessionId.value = id
    messages.value = []
    return id
  }

  function switchSession(id: string) {
    const session = sessions.value.find((item) => item.id === id)
    if (!session) return

    currentSessionId.value = id
    messages.value = [...session.messages]
  }

  function addMessage(message: Message) {
    messages.value.push(message)
    const session = sessions.value.find((item) => item.id === currentSessionId.value)
    if (session) session.messages = [...messages.value]
  }

  function createBranch(parentId: string, forkMessageId: string, title: string): string {
    branchCounter++
    const branchId = `branch_${Date.now()}_${branchCounter}`
    sessions.value.push({
      id: branchId,
      title,
      created: new Date().toISOString(),
      parent_session: parentId,
      fork_point: forkMessageId,
      tags: [],
      messages: [],
    })
    return branchId
  }

  function loadBranchContext(sessionId: string): Message[] {
    const session = sessions.value.find((item) => item.id === sessionId)
    return session ? [...session.messages] : []
  }

  async function initSessionTree(vaultPath: string): Promise<void> {
    const treePath = `${vaultPath}/.study-thread/session-tree.json`
    try {
      const tree = deserializeTree(await readFile(treePath))
      if (tree) {
        sessionTree.value = tree
        return
      }
    } catch {}

    sessionTree.value = null
  }

  function addBranchToSessionTree(parentId: string, branchId: string, title: string, file: string): void {
    if (!sessionTree.value) return
    sessionTree.value = addBranchToTree(
      sessionTree.value,
      parentId,
      createBranchNode(branchId, title, file, parentId),
    )
  }

  async function saveSessionTree(vaultPath: string): Promise<void> {
    if (!sessionTree.value) return
    const treeDir = `${vaultPath}/.study-thread`
    await createDir(treeDir)
    await writeFile(`${treeDir}/session-tree.json`, serializeTree(sessionTree.value))
  }

  async function createBranchInVault(
    vaultPath: string,
    parentSession: Session,
    forkMessageIndex: number,
    branchTitle: string,
    parentSessionFile?: string,
  ): Promise<string | null> {
    try {
      const parentFile = parentSessionFile || getSessionFilePath(vaultPath, parentSession.id)
      if (!(await fileExists(parentFile))) await saveSessionToVault(vaultPath, parentSession)
      await initSessionTree(vaultPath)

      if (!sessionTree.value || !findNode(sessionTree.value, parentSession.id)) {
        sessionTree.value = createRootNode(parentSession.id, parentSession.title, parentFile)
      }

      const branchId = createBranch(parentSession.id, String(forkMessageIndex), branchTitle)
      const branchSession = sessions.value.find((session) => session.id === branchId)
      if (!branchSession) return null

      const branchFile = await saveSessionToVault(vaultPath, branchSession, true)
      addBranchToSessionTree(parentSession.id, branchId, branchTitle, branchFile)
      await saveSessionTree(vaultPath)
      return branchId
    } catch (error) {
      console.error('创建分支失败:', error)
      return null
    }
  }

  function getBranches(nodeId: string): SessionTreeNode[] {
    return sessionTree.value ? findNode(sessionTree.value, nodeId)?.children || [] : []
  }

  return {
    sessions,
    currentSessionId,
    messages,
    isStreaming,
    currentSession,
    sessionTree,
    createSession,
    switchSession,
    addMessage,
    createBranch,
    loadBranchContext,
    initSessionTree,
    addBranchToSessionTree,
    saveSessionTree,
    createBranchInVault,
    getBranches,
  }
})