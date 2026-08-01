import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import MainChatPage from './MainChatPage.vue'

const { route, saveCurrentSession, saveStoredValue, chat } = vi.hoisted(() => ({
  route: { query: { thread: 'new_test' } },
  saveCurrentSession: vi.fn().mockResolvedValue('session-path'),
  saveStoredValue: vi.fn(),
  chat: vi.fn(),
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
vi.mock('../utils/session-linker', () => ({ extractNoteRefsFromSession: vi.fn(() => []) }))
vi.mock('../composables/useToast', () => ({ useToast: () => ({ error: vi.fn(), success: vi.fn() }) }))
vi.mock('../utils/session-serializer', () => ({
  generateSessionTitle: vi.fn(() => '测试会话'),
  getSessionFilePath: vi.fn(),
}))
vi.mock('../utils/vault-fs', () => ({ readFile: vi.fn() }))
vi.mock('../utils/local-storage', () => ({
  loadStoredValue: vi.fn(() => ({})),
  saveStoredValue,
}))

function createWrapper() {
  return mount(MainChatPage, {
    global: {
      stubs: {
        ChatView: { name: 'ChatView', props: ['messages', 'isStreaming', 'streamingText'], template: '<div />' },
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
      { role: 'user', content: '测试问题' },
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
      { role: 'user', content: '测试问题' },
      { role: 'assistant', content: '正常结束的回答' },
    ])
    expect(saveStoredValue).toHaveBeenCalled()
  })
})
