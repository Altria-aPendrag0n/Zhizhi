import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import MainChatPage from './MainChatPage.vue'

const { route, saveCurrentSession, chat, retrieveKnowledgeContext, routerReplace } = vi.hoisted(() => ({
  route: { query: { thread: 'new_test' } },
  saveCurrentSession: vi.fn().mockResolvedValue('session-path'),
  chat: vi.fn(),
  retrieveKnowledgeContext: vi.fn(),
  routerReplace: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ push: vi.fn(), replace: routerReplace }),
}))

vi.mock('../stores/settings', () => ({
  useSettingsStore: () => ({
    getProviderConfig: () => ({ apiKey: 'test-key', model: 'test-model' }),
  }),
}))

vi.mock('../stores/vault', () => ({
  useVaultStore: () => ({
    vaultPath: '/vault',
    saveCurrentSession,
  }),
}))

vi.mock('../stores/notes', () => ({
  useNoteStore: () => ({ saveNote: vi.fn() }),
}))

vi.mock('../api/provider-factory', () => ({
  createProvider: () => ({ chat }),
}))

vi.mock('../api/skills/extract-note', () => ({ extractNote: vi.fn() }))
vi.mock('../utils/session-linker', () => ({
  extractNoteRefsFromSession: vi.fn(() => []),
  filterExistingNoteRefs: vi.fn(async () => []),
}))
vi.mock('../composables/useToast', () => ({ useToast: () => ({ error: vi.fn(), success: vi.fn() }) }))
vi.mock('../utils/session-serializer', () => ({
  generateSessionTitle: vi.fn(() => '测试会话'),
  getSessionFilePath: vi.fn(),
}))
vi.mock('../utils/vault-fs', () => ({ readFile: vi.fn().mockRejectedValue(new Error('会话文件不存在')) }))
vi.mock('../utils/knowledge-retrieval', () => ({ retrieveKnowledgeContext }))
vi.mock('../stores/session', () => ({
  useSessionStore: () => ({ loadSessionsFromVault: vi.fn().mockResolvedValue(undefined) }),
}))

function createWrapper() {
  return mount(MainChatPage, {
    global: {
      stubs: {
        ChatView: { name: 'ChatView', props: ['messages', 'isStreaming', 'streamingText', 'streamingThinking'], template: '<div />' },
        Composer: { name: 'Composer', template: '<div />' },
      },
    },
  })
}

async function sendMessage(wrapper: ReturnType<typeof createWrapper>) {
  await wrapper.findComponent({ name: 'Composer' }).vm.$emit('send', '测试问题')
  await flushPromises()
  return wrapper.findComponent({ name: 'ChatView' })
}

describe('MainChatPage', () => {
  beforeEach(() => {
    // chat-runner 为真实 Pinia store（后台回答状态全局管理），需激活 Pinia
    setActivePinia(createPinia())
    route.query.thread = 'new_test'
    chat.mockReset()
    retrieveKnowledgeContext.mockReset()
    retrieveKnowledgeContext.mockResolvedValue({ context: '', sources: [] })
    saveCurrentSession.mockClear()
    routerReplace.mockClear()
  })

  it('重复 stop 不会用空 streamingText 覆盖已提交的 AI 回答', async () => {
    chat.mockReturnValue((async function* () {
      yield { type: 'text' as const, content: '已提交的回答' }
      yield { type: 'stop' as const }
      yield { type: 'stop' as const }
    })())

    const chatView = await sendMessage(createWrapper())

    expect(chatView.props('messages')).toEqual([
      { role: 'user', content: '测试问题', timestamp: expect.any(String) },
      { role: 'assistant', content: '已提交的回答' },
    ])
    expect(chatView.props('streamingText')).toBe('')
    expect(chatView.props('isStreaming')).toBe(false)
    // 回答持久化到 vault 会话文件（仓库即真相，无本地缓存）
    expect(saveCurrentSession).toHaveBeenCalled()
  })

  it('流结束但未发送 stop 时仍会提交并持久化 AI 回答', async () => {
    chat.mockReturnValue((async function* () {
      yield { type: 'text' as const, content: '正常结束的回答' }
    })())

    const chatView = await sendMessage(createWrapper())

    expect(chatView.props('messages')).toEqual([
      { role: 'user', content: '测试问题', timestamp: expect.any(String) },
      { role: 'assistant', content: '正常结束的回答' },
    ])
    expect(saveCurrentSession).toHaveBeenCalled()
  })

  it('思考内容与回答分离：流式分别输出，结束后保存到 message.thinking', async () => {
    chat.mockReturnValue((async function* () {
      yield { type: 'thinking' as const, content: '思考中' }
      yield { type: 'text' as const, content: '回答内容' }
      yield { type: 'stop' as const }
    })())

    const chatView = await sendMessage(createWrapper())

    expect(chatView.props('messages')).toEqual([
      { role: 'user', content: '测试问题', timestamp: expect.any(String) },
      { role: 'assistant', content: '回答内容', thinking: '思考中' },
    ])
    expect(chatView.props('streamingThinking')).toBe('')
    expect(chatView.props('streamingText')).toBe('')
  })

  it('知识检索结果注入 system 提示', async () => {
    let capturedOptions: Record<string, unknown> = {}
    chat.mockImplementation(async function* (_messages: unknown, options: unknown) {
      capturedOptions = options as Record<string, unknown>
      yield { type: 'text' as const, content: '带知识库的回答' }
      yield { type: 'stop' as const }
    })
    retrieveKnowledgeContext.mockResolvedValue({ context: '### [笔记] 测试笔记\n测试片段内容', sources: [] })

    await sendMessage(createWrapper())

    expect(retrieveKnowledgeContext).toHaveBeenCalledWith('测试问题')
    // system prompt 通过 options.systemPrompt 传入 provider
    const systemPrompt = capturedOptions.systemPrompt as string
    expect(systemPrompt).toContain('你是知枝，一位学习伴读助手')
    expect(systemPrompt).toContain('### [笔记] 测试笔记')
    expect(systemPrompt).toContain('测试片段内容')
  })

  it('空白界面发送自动创建新会话：落盘到 new_* 会话并在回答后跳转路由', async () => {
    route.query.thread = ''
    chat.mockReturnValue((async function* () {
      yield { type: 'text' as const, content: '自动创建的会话回答' }
      yield { type: 'stop' as const }
    })())

    const chatView = await sendMessage(createWrapper())

    // 用户消息与回答都在当前页面完成流式渲染
    expect(chatView.props('messages')).toEqual([
      { role: 'user', content: '测试问题', timestamp: expect.any(String) },
      { role: 'assistant', content: '自动创建的会话回答' },
    ])
    // 会话以 new_* 占位 id 落盘（vault store 的 saveCurrentSession 收到该 id 的 Session）
    expect(saveCurrentSession).toHaveBeenCalledWith(
      expect.objectContaining({ id: expect.stringMatching(/^new_\d+$/) }),
      false,
      expect.any(Array),
    )
    // 回答结束后跳转路由，把会话 id 写入 URL
    expect(routerReplace).toHaveBeenCalledWith({
      path: '/chat',
      query: { thread: expect.stringMatching(/^new_\d+$/) },
    })
  })
})
