import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import App from './App.vue'
import { loadStoredValue, saveStoredValue } from './utils/local-storage'

const { route, push } = vi.hoisted(() => ({
  route: { path: '/chat', fullPath: '/chat', query: {} as Record<string, string> },
  push: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ push, replace: vi.fn() }),
}))

vi.mock('./utils/local-storage', () => ({
  loadStoredValue: vi.fn(() => null),
  saveStoredValue: vi.fn(),
}))

vi.mock('./composables/useToast', () => ({
  useToast: () => ({ info: vi.fn(), error: vi.fn(), success: vi.fn() }),
}))

vi.mock('./embedding/engine', () => ({
  getEmbeddingEngine: () => ({ initialize: vi.fn().mockResolvedValue(undefined) }),
}))

vi.mock('./stores/vault', () => ({
  useVaultStore: () => ({
    restoreLastVault: vi.fn().mockResolvedValue(undefined),
    deleteSession: vi.fn(),
    initIndex: vi.fn().mockResolvedValue(undefined),
  }),
}))

vi.mock('./stores/session', () => ({
  useSessionStore: () => ({
    getBranches: vi.fn(() => []),
    initSessionTree: vi.fn().mockResolvedValue(undefined),
    deleteSessionNodeFromVault: vi.fn().mockResolvedValue(true),
  }),
}))

function createWrapper() {
  return mount(App, {
    global: {
      stubs: {
        AppShell: {
          name: 'AppShell',
          props: ['hideThreads'],
          template: '<div><slot name="rail" /><slot name="threads" /><slot name="toolbar" /><slot name="main" /></div>',
        },
        ProjectRail: { name: 'ProjectRail', props: ['projects', 'activeId'], template: '<div />' },
        ThreadList: { name: 'ThreadList', props: ['threads', 'activeId'], template: '<div />' },
        TopBar: true,
        Toast: true,
        RouterView: true,
      },
      mocks: {
        $route: route,
      },
    },
  })
}

describe('App 项目导航', () => {
  beforeEach(() => {
    route.path = '/chat'
    route.query = {}
    push.mockReset()
  })

  it('在 /notes 与笔记详情隐藏会话栏', () => {
    route.path = '/notes'
    const notesWrapper = createWrapper()

    expect(notesWrapper.findComponent({ name: 'AppShell' }).props('hideThreads')).toBe(true)

    route.path = '/notes/测试笔记'
    const detailWrapper = createWrapper()

    expect(detailWrapper.findComponent({ name: 'AppShell' }).props('hideThreads')).toBe(true)
  })

  it('在非笔记路由保留会话栏', () => {
    const wrapper = createWrapper()

    expect(wrapper.findComponent({ name: 'AppShell' }).props('hideThreads')).toBe(false)
  })

  it('选择项目 ID 2 时导航到资料库', async () => {
    const wrapper = createWrapper()

    await wrapper.findComponent({ name: 'ProjectRail' }).vm.$emit('select', '2')

    expect(push).toHaveBeenCalledWith({ path: '/notes' })
  })

  it('再次选择已激活的资料库时会修正错误路由', async () => {
    const wrapper = createWrapper()
    const projectRail = wrapper.findComponent({ name: 'ProjectRail' })
    await projectRail.vm.$emit('select', '2')
    push.mockClear()

    route.path = '/chat'
    await projectRail.vm.$emit('select', '2')

    expect(push).toHaveBeenCalledWith({ path: '/notes' })
  })

  it('资料库残留 tab=references 等 query 时点击资料库会修正回默认笔记视图', async () => {
    const wrapper = createWrapper()
    const projectRail = wrapper.findComponent({ name: 'ProjectRail' })
    await projectRail.vm.$emit('select', '2')
    push.mockClear()

    // 停留在资料库的参考资料 tab（path 正确但残留 query）
    route.path = '/notes'
    route.query = { tab: 'references' }
    await projectRail.vm.$emit('select', '2')

    expect(push).toHaveBeenCalledWith({ path: '/notes' })
  })

  it('资料库无残留 query 时再次点击不触发多余导航', async () => {
    const wrapper = createWrapper()
    const projectRail = wrapper.findComponent({ name: 'ProjectRail' })
    await projectRail.vm.$emit('select', '2')
    push.mockClear()

    route.path = '/notes'
    route.query = {}
    await projectRail.vm.$emit('select', '2')

    expect(push).not.toHaveBeenCalled()
  })
})

describe('App 冷启动项目与会话选择', () => {
  beforeEach(() => {
    vi.mocked(loadStoredValue).mockReset()
    vi.mocked(saveStoredValue).mockReset()
    route.path = '/chat'
    route.query = {}
    push.mockReset()
  })

  it('忽略持久化的激活项，固定展示项目1知枝学习及其首个会话，并在运行中切换时持久化', async () => {
    const sessions = {
      projects: [
        { id: '1', name: '知枝学习' },
        { id: '2', name: '资料库' },
      ],
      projectThreads: {
        '1': [{ id: 'ai_1', title: '项目1 AI 会话', meta: '10:00' }],
        '2': [{ id: 'library_1', title: '项目2 会话', meta: '09:00' }],
      },
      activeProjectId: '2',
      activeThreadId: 'library_1',
    }
    vi.mocked(loadStoredValue).mockImplementation((key) => {
      if (key === 'study-thread-session-list') return sessions
      if (key === 'study-thread-messages') return {}
      return null
    })

    vi.resetModules()
    const { default: ColdStartApp } = await import('./App.vue')
    const wrapper = mount(ColdStartApp, {
      global: {
        stubs: {
          AppShell: { template: '<div><slot name="rail" /><slot name="threads" /><slot name="toolbar" /><slot name="main" /></div>' },
          ProjectRail: { name: 'ProjectRail', props: ['projects', 'activeId'], template: '<div />' },
          ThreadList: { name: 'ThreadList', props: ['threads', 'activeId'], template: '<div />' },
          TopBar: true,
          Toast: true,
          RouterView: true,
        },
        mocks: { $route: route },
      },
    })

    expect(wrapper.findComponent({ name: 'ProjectRail' }).props('activeId')).toBe('1')
    expect(wrapper.findComponent({ name: 'ThreadList' }).props('threads')).toEqual(sessions.projectThreads['1'])
    expect(wrapper.findComponent({ name: 'ThreadList' }).props('activeId')).toBe('ai_1')

    await wrapper.findComponent({ name: 'ProjectRail' }).vm.$emit('select', '2')

    expect(saveStoredValue).toHaveBeenCalledWith('study-thread-session-list', {
      ...sessions,
      activeProjectId: '2',
      activeThreadId: 'library_1',
    })
  })
})
describe('App 冷启动会话迁移', () => {
  beforeEach(() => {
    vi.mocked(loadStoredValue).mockReset()
    vi.mocked(loadStoredValue).mockReturnValue(null)
    vi.mocked(saveStoredValue).mockReset()
  })

  it('将恢复的无消息 new_* 新会话改名为知枝学习并持久化', async () => {
    const sessions = {
      projects: [{ id: '1', name: '知枝学习' }],
      projectThreads: {
        '1': [{ id: 'new_empty', title: '新会话', meta: '10:00' }],
      },
      activeProjectId: '1',
      activeThreadId: 'new_empty',
    }
    vi.mocked(loadStoredValue).mockImplementation((key) => {
      if (key === 'study-thread-session-list') return sessions
      if (key === 'study-thread-messages') return {}
      return null
    })

    vi.resetModules()
    const { default: ColdStartApp } = await import('./App.vue')
    const wrapper = mount(ColdStartApp, {
      global: {
        stubs: {
          AppShell: { template: '<div><slot name="rail" /><slot name="threads" /><slot name="toolbar" /><slot name="main" /></div>' },
          ProjectRail: true,
          ThreadList: { name: 'ThreadList', props: ['threads'], template: '<div />' },
          TopBar: true,
          Toast: true,
          RouterView: true,
        },
        mocks: { $route: route },
      },
    })

    expect(wrapper.findComponent({ name: 'ThreadList' }).props('threads')).toEqual([
      { id: 'new_empty', title: '知枝学习', meta: '10:00' },
    ])
    expect(saveStoredValue).toHaveBeenCalledWith('study-thread-session-list', {
      ...sessions,
      projectThreads: {
        '1': [{ id: 'new_empty', title: '知枝学习', meta: '10:00' }],
      },
    })
  })

  it('不改名手动新建或已有消息的会话', async () => {
    const sessions = {
      projects: [{ id: '1', name: '知枝学习' }],
      projectThreads: {
        '1': [
          { id: 'manual_1', title: '新会话', meta: '10:00' },
          { id: 'new_messages', title: '新会话', meta: '09:00' },
        ],
      },
      activeProjectId: '1',
      activeThreadId: 'manual_1',
    }
    vi.mocked(loadStoredValue).mockImplementation((key) => {
      if (key === 'study-thread-session-list') return sessions
      if (key === 'study-thread-messages') return { new_messages: [{ role: 'user', content: '你好' }] }
      return null
    })

    vi.resetModules()
    const { default: ColdStartApp } = await import('./App.vue')
    const wrapper = mount(ColdStartApp, {
      global: {
        stubs: {
          AppShell: { template: '<div><slot name="rail" /><slot name="threads" /><slot name="toolbar" /><slot name="main" /></div>' },
          ProjectRail: true,
          ThreadList: { name: 'ThreadList', props: ['threads'], template: '<div />' },
          TopBar: true,
          Toast: true,
          RouterView: true,
        },
        mocks: { $route: route },
      },
    })

    expect(wrapper.findComponent({ name: 'ThreadList' }).props('threads')).toEqual(sessions.projectThreads['1'])
    expect(saveStoredValue).not.toHaveBeenCalled()
  })
})