import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSessionStore } from './session'

// Mock vault-fs
vi.mock('../utils/vault-fs', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  createDir: vi.fn(),
}))

describe('session store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('createSession 创建新会话', () => {
    const store = useSessionStore()
    const id = store.createSession('测试会话')

    expect(id).toMatch(/^sess_\d+$/)
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

    expect(branchId).toMatch(/^branch_\d+$/)
    const branch = store.sessions.find(s => s.id === branchId)
    expect(branch).toBeDefined()
    expect(branch!.parent_session).toBe('sess_1')
    expect(branch!.fork_point).toBe('msg_3')
    expect(branch!.title).toBe('追问')
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