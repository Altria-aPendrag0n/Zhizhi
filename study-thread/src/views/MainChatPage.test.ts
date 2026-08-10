import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import MainChatPage from './MainChatPage.vue'

const { route, saveCurrentSession, saveStoredValue, chat, retrieveKnowledgeContext } = vi.hoisted(() => ({
  route: { query: { thread: 'new_test' } },
  saveCurrentSession: vi.fn().mockResolvedValue('session-path'),
  saveStoredValue: vi.fn(),
  chat: vi.fn(),
  retrieveKnowledgeContext: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('../stores/settings', () => ({
  useSettingsStore: () => ({
    getProviderConfig: () => ({ apiKey: 'test-key', model: 'test-model' }),
  }),
}))

vi.mock('../stores/busy', () => ({
  useBusyStore: () => ({ active: false, message: '', start: vi.fn(), stop: vi.fn() }),
}))

vi.mock('../stores/vault', () => ({
  useVaultStore: () => ({
    vaultPath: '',
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
vi.mock('../utils/vault-fs', () => ({ readFile: vi.fn() }))
vi.mock('../utils/knowledge-retrieval', () => ({ retrieveKnowledgeContext }))
vi.mock('../utils/local-storage', () => ({
  loadStoredValue: vi.fn(() => ({})),
  saveStoredValue,
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
    route.query.thread = 'new_test'
    chat.mockReset()
    retrieveKnowledgeContext.mockReset()
    retrieveKnowledgeContext.mockResolvedValue('')
    saveCurrentSession.mockClear()
    saveStoredValue.mockClear()
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
    expect(saveStoredValue).toHaveBeenCalled()
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
    expect(saveStoredValue).toHaveBeenCalled()
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
    retrieveKnowledgeContext.mockResolvedValue('### [笔记] 测试笔记\n测试片段内容')

    await sendMessage(createWrapper())

    expect(retrieveKnowledgeContext).toHaveBeenCalledWith('测试问题')
    // system prompt 通过 options.systemPrompt 传入 provider
    const systemPrompt = capturedOptions.systemPrompt as string
    expect(systemPrompt).toContain('你是知枝，一位学习伴读助手')
    expect(systemPrompt).toContain('### [笔记] 测试笔记')
    expect(systemPrompt).toContain('测试片段内容')
  })
})
