import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSessionStore } from './session'
import {
  createRootNode,
  createBranchNode,
  addBranchToTree,
  findNode,
  serializeTree,
} from '../utils/session-tree'

const vaultFs = vi.hoisted(() => ({
  createDir: vi.fn().mockResolvedValue(undefined),
  fileExists: vi.fn().mockResolvedValue(true),
  readFile: vi.fn().mockRejectedValue(new Error('not found')),
  writeFile: vi.fn().mockResolvedValue(undefined),
  deleteFile: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../utils/vault-fs', () => vaultFs)



describe('session store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('createSession 创建新会话', () => {
    const store = useSessionStore()
    const id = store.createSession('测试会话')

    expect(id).toMatch(/^sess_\d+_\d+$/)
    expect(store.currentSessionId).toBe(id)
    expect(store.sessions).toHaveLength(1)
    expect(store.sessions[0].title).toBe('测试会话')
    expect(store.sessions[0].messages).toEqual([])
    expect(store.messages).toEqual([])
  })

  it('createSession 使用默认标题', () => {
    const store = useSessionStore()
    store.createSession()
    expect(store.sessions[0].title).toBe('新会话')
  })

  it('switchSession 切换会话', () => {
    const store = useSessionStore()
    const id1 = store.createSession('会话1')
    store.addMessage({ role: 'user', content: '消息1' })
    const id2 = store.createSession('会话2')
    store.addMessage({ role: 'user', content: '消息2' })

    store.switchSession(id1)
    expect(store.currentSessionId).toBe(id1)
    expect(store.messages).toHaveLength(1)
    expect(store.messages[0].content).toBe('消息1')

    store.switchSession(id2)
    expect(store.messages[0].content).toBe('消息2')
  })

  it('addMessage 添加消息并同步到会话', () => {
    const store = useSessionStore()
    store.createSession('测试')
    store.addMessage({ role: 'user', content: '你好' })
    store.addMessage({ role: 'assistant', content: '你好！' })

    expect(store.messages).toHaveLength(2)
    expect(store.sessions[0].messages).toHaveLength(2)
  })

  it('createBranch 创建分支会话', () => {
    const store = useSessionStore()
    store.createSession('主会话')
    const branchId = store.createBranch('sess_1', 'msg_3', '追问')

    expect(branchId).toMatch(/^branch_\d+_\d+$/)
    const branch = store.sessions.find(s => s.id === branchId)
    expect(branch).toBeDefined()
    expect(branch!.parent_session).toBe('sess_1')
    expect(branch!.fork_point).toBe('msg_3')
    expect(branch!.title).toBe('追问')
  })

  it('createBranchInVault 复用已存在的真实来源会话文件', async () => {
    const store = useSessionStore()
    const parent = {
      id: 'source-session',
      title: '来源会话',
      created: '2026-01-01T00:00:00.000Z',
      parent_session: null,
      fork_point: null,
      tags: [],
      messages: [{ role: 'user' as const, content: '来源消息' }],
    }

    const branchId = await store.createBranchInVault('/vault', parent, 0, '笔记追问', '/vault/sessions/existing.md')

    expect(branchId).toMatch(/^branch_\d+_\d+$/)
    expect(vaultFs.fileExists).toHaveBeenCalledWith('/vault/sessions/existing.md')
    expect(vaultFs.writeFile).not.toHaveBeenCalledWith('/vault/sessions/source-session.md', expect.any(String))
  })

  it('从分支创建嵌套分支时按分支文件命名规则定位父会话', async () => {
    const root = createRootNode('root', '主会话', '/vault/sessions/root.md')
    const b1 = createBranchNode('branch_b1', '分支1', '/vault/sessions/branch-branch_b1.md', 'root')
    const tree = addBranchToTree(root, 'root', b1)
    vaultFs.readFile.mockResolvedValue(serializeTree(tree))

    const store = useSessionStore()
    const parentBranch = {
      id: 'branch_b1',
      title: '分支1',
      created: '2026-01-01T00:00:00.000Z',
      parent_session: 'root',
      fork_point: '0',
      tags: [],
      messages: [{ role: 'user' as const, content: '分支内的提问' }],
    }

    const branchId = await store.createBranchInVault('/vault', parentBranch, 0, '分支2')

    expect(branchId).toMatch(/^branch_\d+_\d+$/)
    // 父分支按 branch- 前缀文件定位（fileExists 为 true 时不重写父文件）
    expect(vaultFs.fileExists).toHaveBeenCalledWith('/vault/sessions/branch-branch_b1.md')
    // 新分支仍按分支文件命名规则保存
    expect(vaultFs.writeFile).toHaveBeenCalledWith(`/vault/sessions/branch-${branchId}.md`, expect.any(String))
  })

  it('分支深度达到上限（第 3 层）后拒绝再创建嵌套分支', async () => {
    const root = createRootNode('root', '主会话', '/vault/sessions/root.md')
    const b1 = createBranchNode('b1', '分支1', '/vault/sessions/branch-b1.md', 'root')
    let tree = addBranchToTree(root, 'root', b1)
    const b2 = createBranchNode('b2', '分支2', '/vault/sessions/branch-b2.md', 'b1')
    tree = addBranchToTree(tree, 'b1', b2)
    const b3 = createBranchNode('b3', '分支3', '/vault/sessions/branch-b3.md', 'b2')
    tree = addBranchToTree(tree, 'b2', b3)
    vaultFs.readFile.mockResolvedValue(serializeTree(tree))

    const store = useSessionStore()
    const parentBranch = {
      id: 'b3',
      title: '分支3',
      created: '2026-01-01T00:00:00.000Z',
      parent_session: 'b2',
      fork_point: '0',
      tags: [],
      messages: [],
    }

    const branchId = await store.createBranchInVault('/vault', parentBranch, 0, '分支4')
    expect(branchId).toBeNull()
  })

  it('第 3 层分支仍允许创建（深度 2 的父分支）', async () => {
    const root = createRootNode('root', '主会话', '/vault/sessions/root.md')
    const b1 = createBranchNode('b1', '分支1', '/vault/sessions/branch-b1.md', 'root')
    let tree = addBranchToTree(root, 'root', b1)
    const b2 = createBranchNode('b2', '分支2', '/vault/sessions/branch-b2.md', 'b1')
    tree = addBranchToTree(tree, 'b1', b2)
    vaultFs.readFile.mockResolvedValue(serializeTree(tree))

    const store = useSessionStore()
    const parentBranch = {
      id: 'b2',
      title: '分支2',
      created: '2026-01-01T00:00:00.000Z',
      parent_session: 'b1',
      fork_point: '0',
      tags: [],
      messages: [],
    }

    const branchId = await store.createBranchInVault('/vault', parentBranch, 0, '分支3')
    expect(branchId).toMatch(/^branch_\d+_\d+$/)
  })

  describe('deleteSessionNodeFromVault', () => {
    /** root → [branch_b1 → branch_b1c, branch_b2] */
    function buildTree() {
      const root = createRootNode('root', '主会话', '/vault/sessions/root.md')
      const b1 = createBranchNode('branch_b1', '分支1', '/vault/sessions/branch-branch_b1.md', 'root')
      let tree = addBranchToTree(root, 'root', b1)
      const b2 = createBranchNode('branch_b2', '分支2', '/vault/sessions/branch-branch_b2.md', 'root')
      tree = addBranchToTree(tree, 'root', b2)
      const b1c = createBranchNode('branch_b1c', '分支1子', '/vault/sessions/branch-branch_b1c.md', 'branch_b1')
      tree = addBranchToTree(tree, 'branch_b1', b1c)
      return tree
    }

    it('删除主会话时级联删除其所有子分支文件，树清空', async () => {
      vaultFs.readFile.mockResolvedValue(serializeTree(buildTree()))
      const store = useSessionStore()

      const ok = await store.deleteSessionNodeFromVault('/vault', 'root')

      expect(ok).toBe(true)
      // 主会话文件及其全部后代分支文件均被删除
      expect(vaultFs.deleteFile).toHaveBeenCalledWith('/vault/sessions/root.md')
      expect(vaultFs.deleteFile).toHaveBeenCalledWith('/vault/sessions/branch-branch_b1.md')
      expect(vaultFs.deleteFile).toHaveBeenCalledWith('/vault/sessions/branch-branch_b1c.md')
      expect(vaultFs.deleteFile).toHaveBeenCalledWith('/vault/sessions/branch-branch_b2.md')
      // 根节点被移除 → 树清空
      expect(store.sessionTree).toBeNull()
    })

    it('删除分支时级联删除其子分支，不影响上级与同级', async () => {
      vaultFs.readFile.mockResolvedValue(serializeTree(buildTree()))
      const store = useSessionStore()

      const ok = await store.deleteSessionNodeFromVault('/vault', 'branch_b1')

      expect(ok).toBe(true)
      expect(vaultFs.deleteFile).toHaveBeenCalledWith('/vault/sessions/branch-branch_b1.md')
      expect(vaultFs.deleteFile).toHaveBeenCalledWith('/vault/sessions/branch-branch_b1c.md')
      expect(vaultFs.deleteFile).not.toHaveBeenCalledWith('/vault/sessions/root.md')
      expect(vaultFs.deleteFile).not.toHaveBeenCalledWith('/vault/sessions/branch-branch_b2.md')
      // 树中该分支及其子分支已移除，上级与同级保留
      expect(findNode(store.sessionTree!, 'branch_b1')).toBeNull()
      expect(findNode(store.sessionTree!, 'branch_b1c')).toBeNull()
      expect(findNode(store.sessionTree!, 'branch_b2')).not.toBeNull()
      expect(store.sessionTree!.id).toBe('root')
    })

    it('不在会话树中的节点返回 false', async () => {
      vaultFs.readFile.mockResolvedValue(serializeTree(buildTree()))
      const store = useSessionStore()

      expect(await store.deleteSessionNodeFromVault('/vault', 'nonexistent')).toBe(false)
    })

    it('无 vault 时放行（本地会话）', async () => {
      const store = useSessionStore()
      expect(await store.deleteSessionNodeFromVault(null, 'local-1')).toBe(true)
    })
  })

  it('loadBranchContext 加载分支上下文', () => {
    const store = useSessionStore()
    store.createSession('主会话')
    store.addMessage({ role: 'user', content: '问题1' })
    store.addMessage({ role: 'assistant', content: '回答1' })

    const context = store.loadBranchContext(store.currentSessionId!)
    expect(context).toHaveLength(2)
    expect(context[0].content).toBe('问题1')
  })

  it('isStreaming 状态管理', () => {
    const store = useSessionStore()
    expect(store.isStreaming).toBe(false)
    store.isStreaming = true
    expect(store.isStreaming).toBe(true)
  })

  it('createMultipleSessions 创建多个会话', () => {
    const store = useSessionStore()
    store.createSession('会话1')
    store.createSession('会话2')
    store.createSession('会话3')

    expect(store.sessions).toHaveLength(3)
    expect(store.currentSessionId).toBe(store.sessions[2].id)
  })
})