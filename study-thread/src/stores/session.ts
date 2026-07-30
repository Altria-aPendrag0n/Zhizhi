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
import { readFile, writeFile, createDir } from '../utils/vault-fs'
import { serializeSession } from '../utils/session-serializer'

export const useSessionStore = defineStore('session', () => {
  const sessions = ref<Session[]>([])
  const currentSessionId = ref<string | null>(null)
  const messages = ref<Message[]>([])
  const isStreaming = ref(false)
  const sessionTree = ref<SessionTreeNode | null>(null)

  const currentSession = computed(() =>
    sessions.value.find((s) => s.id === currentSessionId.value) || null,
  )

  function createSession(title: string = '新会话'): string {
    const id = `sess_${Date.now()}`
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
    const session = sessions.value.find((s) => s.id === id)
    if (session) {
      currentSessionId.value = id
      messages.value = [...session.messages]
    }
  }

  function addMessage(message: Message) {
    messages.value.push(message)
    const session = sessions.value.find((s) => s.id === currentSessionId.value)
    if (session) {
      session.messages = [...messages.value]
    }
  }

  function createBranch(parentId: string, forkMessageId: string, title: string): string {
    const branchId = `branch_${Date.now()}`
    const branch: Session = {
      id: branchId,
      title,
      created: new Date().toISOString(),
      parent_session: parentId,
      fork_point: forkMessageId,
      tags: [],
      messages: [],
    }
    sessions.value.push(branch)
    return branchId
  }

  function loadBranchContext(sessionId: string): Message[] {
    const session = sessions.value.find((s) => s.id === sessionId)
    return session ? [...session.messages] : []
  }

  // ===== 会话树管理 =====

  /**
   * 初始化会话树（从 vault 加载或创建新树）
   */
  async function initSessionTree(vaultPath: string): Promise<void> {
    const treePath = `${vaultPath}/.study-thread/session-tree.json`
    try {
      const raw = await readFile(treePath)
      const tree = deserializeTree(raw)
      if (tree) {
        sessionTree.value = tree
        return
      }
    } catch {
      // 文件不存在或读取失败，创建新树
    }

    // 创建空根节点
    sessionTree.value = createRootNode('root', '会话树', '')
  }

  /**
   * 在树中添加分支节点
   */
  function addBranchToSessionTree(
    parentId: string,
    branchId: string,
    title: string,
    file: string,
  ): void {
    if (!sessionTree.value) return
    const branch = createBranchNode(branchId, title, file, parentId)
    sessionTree.value = addBranchToTree(sessionTree.value, parentId, branch)
  }

  /**
   * 保存会话树到 vault
   */
  async function saveSessionTree(vaultPath: string): Promise<void> {
    if (!sessionTree.value) return
    const treeDir = `${vaultPath}/.study-thread`
    const treePath = `${treeDir}/session-tree.json`
    try {
      await createDir(treeDir)
      await writeFile(treePath, serializeTree(sessionTree.value))
    } catch (e) {
      console.error('保存会话树失败:', e)
    }
  }

  /**
   * 创建分支并保存到 vault
   */
  async function createBranchInVault(
    vaultPath: string,
    parentSession: Session,
    forkMessageIndex: number,
    branchTitle: string,
  ): Promise<string | null> {
    try {
      const branchId = createBranch(parentSession.id, String(forkMessageIndex), branchTitle)

      // 构建分支文件路径
      const sessionsDir = `${vaultPath}/sessions`
      const topicDir = `${sessionsDir}/${sanitizeDirName(parentSession.title)}`
      const branchFile = `${topicDir}/branch-${sanitizeDirName(branchTitle)}.md`

      // 创建分支文件
      const branchSession: Session = {
        id: branchId,
        title: branchTitle,
        created: new Date().toISOString(),
        parent_session: parentSession.id,
        fork_point: String(forkMessageIndex),
        tags: [],
        messages: [],
      }

      await createDir(topicDir)
      const content = serializeSession(branchSession)
      await writeFile(branchFile, content)

      // 更新会话树
      addBranchToSessionTree(parentSession.id, branchId, branchTitle, branchFile)
      await saveSessionTree(vaultPath)

      return branchId
    } catch (e) {
      console.error('创建分支失败:', e)
      return null
    }
  }

  /**
   * 获取会话树中指定节点的所有分支
   */
  function getBranches(nodeId: string): SessionTreeNode[] {
    const node = sessionTree.value ? findNode(sessionTree.value, nodeId) : null
    return node?.children || []
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

/**
 * 清理目录名（用于会话目录）
 */
function sanitizeDirName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 50)
}