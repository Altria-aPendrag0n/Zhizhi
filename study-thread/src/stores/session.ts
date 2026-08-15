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
  updateNodeTitle,
  serializeTree,
  deserializeTree,
} from '../utils/session-tree'
import { readFile, writeFile, createDir, fileExists, deleteFile, listDir } from '../utils/vault-fs'
import { getSessionFilePath, resolveSessionFile, saveSessionToVault, parseSessionMeta, type SessionMeta } from '../utils/session-serializer'
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
  /** 侧边栏顶层会话列表（来自 vault sessions/*.md，分支/复习会话不在此列） */
  const sessionList = ref<SessionMeta[]>([])
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
    // 自动写入消息级时间戳：serializer 会持久化为「## 用户 · <timestamp>」，
    // 供主界面学习频率统计按天归位问答次数；存量会话文件无时间戳时按会话 created 近似
    const stamped: Message = message.timestamp
      ? message
      : { ...message, timestamp: new Date().toISOString() }
    messages.value.push(stamped)
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

  /**
   * 从 vault 加载侧边栏会话列表（仓库即真相：扫描 sessions/*.md 解析 frontmatter）。
   *
   * 分支与复习会话（旧 branch-/review- 前缀、新 branch_/review_ id 前缀）在会话树中
   * 按父会话嵌套展示，均不进入顶层会话列表；按创建时间倒序排列。
   */
  async function loadSessionsFromVault(vaultPath: string): Promise<void> {
    try {
      const entries = await listDir(`${vaultPath}/sessions`)
      const metas: SessionMeta[] = []
      for (const entry of entries) {
        if (entry.is_dir || !entry.name.toLowerCase().endsWith('.md')) continue
        if (
          entry.name.startsWith('branch-') ||
          entry.name.startsWith('review-') ||
          entry.name.startsWith('branch_') ||
          entry.name.startsWith('review_')
        ) continue
        try {
          const content = await readFile(entry.path)
          const meta = parseSessionMeta(content, entry.path)
          if (meta.id) metas.push(meta)
        } catch {
          // 单个文件损坏跳过，不影响列表
        }
      }
      metas.sort((a, b) => b.created.localeCompare(a.created))
      sessionList.value = metas
    } catch {
      sessionList.value = []
    }
    await initSessionTree(vaultPath)
  }

  /** 重写会话 md frontmatter 中的 title 字段（保持其余内容不变） */
  function replaceFrontmatterTitle(content: string, title: string): string {
    const lines = content.split('\n')
    let inFrontmatter = false
    let replaced = false
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (line.trim() === '---') {
        if (!inFrontmatter) {
          inFrontmatter = true
          continue
        }
        break
      }
      if (inFrontmatter && !replaced && /^title\s*:/.test(line)) {
        lines[i] = `title: ${title}`
        replaced = true
      }
    }
    return lines.join('\n')
  }

  /**
   * 重命名会话：改写 vault 中会话 md 的 frontmatter title（仓库即真相），
   * 并同步更新文件名 slug 与会话树节点标题。引用方以稳定 id 定位文件，
   * 因此文件名随标题变化不会破坏笔记/分支链接。分支/复习会话的重命名当前
   * 不在 UI 暴露，仅支持顶层会话。
   */
  async function renameSessionTitle(vaultPath: string, sessionId: string, title: string): Promise<boolean> {
    const isBranch = sessionId.startsWith('branch_')
    const isReview = sessionId.startsWith('review_')
    const currentFile = await resolveSessionFile(vaultPath, sessionId)
      ?? getSessionFilePath(vaultPath, sessionId, isBranch, isReview)
    const newFile = getSessionFilePath(vaultPath, sessionId, isBranch, isReview, title)
    try {
      const content = await readFile(currentFile)
      const updated = replaceFrontmatterTitle(content, title)
      if (newFile !== currentFile) {
        await writeFile(newFile, updated)
        await deleteFile(currentFile)
      } else {
        await writeFile(currentFile, updated)
      }
      if (sessionTree.value && findNode(sessionTree.value, sessionId)) {
        sessionTree.value = updateNodeTitle(sessionTree.value, sessionId, title)
        await saveSessionTree(vaultPath)
      }
      await loadSessionsFromVault(vaultPath)
      return true
    } catch {
      return false
    }
  }

  function addBranchToSessionTree(parentId: string, branchId: string, title: string): void {
    if (!sessionTree.value) return
    sessionTree.value = addBranchToTree(
      sessionTree.value,
      parentId,
      createBranchNode(branchId, title, branchId, parentId),
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
    occurrence = 1,
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

      // 父会话可能是分支（嵌套分支），先按稳定 id 定位已有文件，找不到再回退旧路径/生成
      const isParentBranch = parentSession.id.startsWith('branch_')
      const parentFile = await resolveSessionFile(vaultPath, parentSession.id)
        ?? parentSessionFile
        ?? getSessionFilePath(vaultPath, parentSession.id, isParentBranch)
      if (!(await fileExists(parentFile))) await saveSessionToVault(vaultPath, parentSession, isParentBranch)
      await initSessionTree(vaultPath)

      if (!sessionTree.value || !findNode(sessionTree.value, parentSession.id)) {
        sessionTree.value = createRootNode(parentSession.id, parentSession.title, parentSession.id)
      }

      const branchId = createBranch(parentSession.id, String(forkMessageIndex), branchTitle)
      const branchSession = sessions.value.find((session) => session.id === branchId)
      if (!branchSession) return null

      // 分叉点上下文（划线内容上下各三句话）随分支文件持久化，供前端识别渲染
      const forkContextText = buildForkContextPreview(parentSession.messages, forkMessageIndex, highlightedText, occurrence)
      if (forkContextText) branchSession.fork_context = forkContextText
      // 划线文本持久化到 frontmatter，供分叉点上下文渲染后 DOM 高亮定位
      if (highlightedText) branchSession.fork_highlight = highlightedText
      // 划线文本在消息中的出现序号（第 N 处），重复文本时 DOM 高亮按序号定位
      if (occurrence > 1) branchSession.fork_highlight_occ = occurrence

      await saveSessionToVault(vaultPath, branchSession, true)
      addBranchToSessionTree(parentSession.id, branchId, branchTitle)
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
        const filePath = await resolveSessionFile(vaultPath, nodeId)
          ?? getSessionFilePath(vaultPath, nodeId, nodeId.startsWith('branch_'))
        if (await fileExists(filePath)) await deleteFile(filePath)
        return true
      }

      // 级联删除该会话及其所有子分支的会话文件（按 id 定位，兼容新旧命名）
      const ids = collectSubtreeIds(sessionTree.value, nodeId)
      for (const id of ids) {
        const isBranch = id.startsWith('branch_')
        const filePath = await resolveSessionFile(vaultPath, id)
          ?? getSessionFilePath(vaultPath, id, isBranch)
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
    sessionList,
    MAX_BRANCH_DEPTH,
    createSession,
    switchSession,
    addMessage,
    createBranch,
    loadBranchContext,
    initSessionTree,
    loadSessionsFromVault,
    renameSessionTitle,
    addBranchToSessionTree,
    saveSessionTree,
    createBranchInVault,
    getBranches,
    getNodeBranchDepth,
    deleteSessionNodeFromVault,
  }
})