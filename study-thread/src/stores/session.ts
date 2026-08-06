import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Session, Message } from '../types'
import {
  type SessionTreeNode,
  createRootNode,
  createBranchNode,
  addBranchToTree,
  findNode,
  getNodeDepth,
  collectSubtreeIds,
  removeNodeFromTree,
  serializeTree,
  deserializeTree,
} from '../utils/session-tree'
import { readFile, writeFile, createDir, fileExists, deleteFile } from '../utils/vault-fs'
import { getSessionFilePath, saveSessionToVault } from '../utils/session-serializer'
import { buildForkContextPreview } from '../utils/branch-context'
import { removeSessionReferences } from '../utils/session-linker'

/** 分支嵌套的最大层数（主会话为第 0 层，最多到第 3 层分支） */
export const MAX_BRANCH_DEPTH = 3

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
    highlightedText?: string,
  ): Promise<string | null> {
    try {
      await initSessionTree(vaultPath)

      // 深度限制：父节点深度达到上限时不再允许创建更深的分支
      if (sessionTree.value && findNode(sessionTree.value, parentSession.id)) {
        const depth = getNodeDepth(sessionTree.value, parentSession.id)
        if (depth >= MAX_BRANCH_DEPTH) {
          console.warn(`分支深度已达上限（${MAX_BRANCH_DEPTH} 层），拒绝创建更深分支`)
          return null
        }
      }

      // 父会话可能是分支（嵌套分支），需按对应文件命名规则定位/保存
      const isParentBranch = parentSession.id.startsWith('branch_')
      const parentFile = parentSessionFile || getSessionFilePath(vaultPath, parentSession.id, isParentBranch)
      if (!(await fileExists(parentFile))) await saveSessionToVault(vaultPath, parentSession, isParentBranch)
      await initSessionTree(vaultPath)

      if (!sessionTree.value || !findNode(sessionTree.value, parentSession.id)) {
        sessionTree.value = createRootNode(parentSession.id, parentSession.title, parentFile)
      }

      const branchId = createBranch(parentSession.id, String(forkMessageIndex), branchTitle)
      const branchSession = sessions.value.find((session) => session.id === branchId)
      if (!branchSession) return null

      // 分叉点上下文（划线内容上下各三句话）随分支文件持久化，供前端识别渲染
      const forkContextText = buildForkContextPreview(parentSession.messages, forkMessageIndex, highlightedText)
      if (forkContextText) branchSession.fork_context = forkContextText
      // 划线文本持久化到 frontmatter，供分叉点上下文渲染后 DOM 高亮定位
      if (highlightedText) branchSession.fork_highlight = highlightedText

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

  /** 获取节点分支深度（主会话为 0） */
  function getNodeBranchDepth(nodeId: string): number {
    return sessionTree.value ? getNodeDepth(sessionTree.value, nodeId) : 0
  }

  /**
   * 删除会话节点及其所有子分支
   *
   * 会话在管理上相互独立：删除一个会话时级联删除其下所有分支（含嵌套），
   * 不影响同级与上级会话。无 vault 时视为本地会话，直接放行；
   * 有 vault 但节点不在会话树中（本地模拟会话，如空的新会话改名而来）时同样放行。
   *
   * @param vaultPath - vault 根目录（可为 null）
   * @param nodeId - 要删除的会话/分支 id
   * @returns 是否删除成功
   */
  async function deleteSessionNodeFromVault(
    vaultPath: string | null,
    nodeId: string,
  ): Promise<boolean> {
    if (!vaultPath) return true
    try {
      await initSessionTree(vaultPath)
      if (!sessionTree.value || !findNode(sessionTree.value, nodeId)) {
        // 本地模拟会话（不在 vault 会话树中，如空的新会话改名而来、内置示例会话等）：
        // 按 id 尝试删除对应会话文件（若存在），文件不存在也视为本地会话放行
        const filePath = getSessionFilePath(vaultPath, nodeId, nodeId.startsWith('branch_'))
        if (await fileExists(filePath)) await deleteFile(filePath)
        return true
      }

      // 级联删除该会话及其所有子分支的会话文件
      const ids = collectSubtreeIds(sessionTree.value, nodeId)
      for (const id of ids) {
        const isBranch = id.startsWith('branch_')
        const filePath = getSessionFilePath(vaultPath, id, isBranch)
        if (await fileExists(filePath)) await deleteFile(filePath)
      }

      // 清理其他会话文件中对被删分支的引用行（划线虚线标记）
      const removedBranchIds = ids.filter((id) => id.startsWith('branch_'))
      if (removedBranchIds.length > 0) {
        await removeSessionReferences(vaultPath, removedBranchIds, 'branch')
      }

      sessionTree.value = removeNodeFromTree(sessionTree.value, nodeId)
      await saveSessionTree(vaultPath)
      return true
    } catch (error) {
      console.error('删除会话失败:', error)
      return false
    }
  }

  return {
    sessions,
    currentSessionId,
    messages,
    isStreaming,
    currentSession,
    sessionTree,
    MAX_BRANCH_DEPTH,
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
    getNodeBranchDepth,
    deleteSessionNodeFromVault,
  }
})