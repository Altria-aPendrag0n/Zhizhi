import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import App from './App.vue'
import { loadStoredValue, saveStoredValue } from './utils/local-storage'

const { route, push } = vi.hoisted(() => {
  // useRoute 返回响应式对象，使 App.vue 的 watch(() => route.path) 在测试中可被路由变化触发
  const { reactive } = require('vue')
  return {
    route: reactive({ path: '/chat', fullPath: '/chat', query: {} as Record<string, string> }),
    push: vi.fn(),
  }
})

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

vi.mock('./stores/busy', () => ({
  useBusyStore: () => ({ active: false, message: '', start: vi.fn(), stop: vi.fn() }),
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
        TopBar: { name: 'TopBar', props: ['breadcrumbs', 'showBack'], template: '<div />' },
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

  it('在 /settings 隐藏会话栏（保留项目栏）', () => {
    route.path = '/settings'
    const wrapper = createWrapper()

    expect(wrapper.findComponent({ name: 'AppShell' }).props('hideThreads')).toBe(true)
  })

  it('在非笔记路由保留会话栏', () => {
    const wrapper = createWrapper()

    expect(wrapper.findComponent({ name: 'AppShell' }).props('hideThreads')).toBe(false)
  })

  it('会话/笔记/设置界面显示返回按钮', () => {
    route.path = '/chat'
    expect(createWrapper().findComponent({ name: 'TopBar' }).props('showBack')).toBe(true)

    route.path = '/notes'
    expect(createWrapper().findComponent({ name: 'TopBar' }).props('showBack')).toBe(true)

    route.path = '/notes/测试笔记'
    expect(createWrapper().findComponent({ name: 'TopBar' }).props('showBack')).toBe(true)

    route.path = '/settings'
    expect(createWrapper().findComponent({ name: 'TopBar' }).props('showBack')).toBe(true)
  })

  it('无站内历史时点击返回回退到会话页', async () => {
    window.history.replaceState(null, '')
    route.path = '/settings'
    const wrapper = createWrapper()

    await wrapper.findComponent({ name: 'TopBar' }).vm.$emit('back')

    expect(push).toHaveBeenCalledWith('/chat')
  })

  it('选择项目 ID 2 时导航到资料库', async () => {
    const wrapper = createWrapper()

    await wrapper.findComponent({ name: 'ProjectRail' }).vm.$emit('select', '2')

    expect(push).toHaveBeenCalledWith({ path: '/notes' })
  })

  it('切换到资料库时不提前切换会话列表（避免闪现资料库会话栏）', async () => {
    const wrapper = createWrapper()
    const projectRail = wrapper.findComponent({ name: 'ProjectRail' })

    // 资料库项目的默认会话列表（知枝学习/认知科学论文索引/机器学习基础）
    await projectRail.vm.$emit('select', '2')

    // 资料库路由隐藏会话栏：切换时不应把会话列表先换成资料库项目的会话
    const threadsProp = wrapper.findComponent({ name: 'ThreadList' }).props('threads') as { title: string }[]
    expect(threadsProp.map((t) => t.title)).not.toContain('认知科学论文索引')
    expect(threadsProp.map((t) => t.title)).not.toContain('机器学习基础')
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

  it('划线跳转进入笔记详情时左侧项目栏同步高亮资料库', async () => {
    const wrapper = createWrapper()
    expect(wrapper.findComponent({ name: 'ProjectRail' }).props('activeId')).toBe('1')

    route.path = '/notes/测试笔记'
    await flushPromises()

    expect(wrapper.findComponent({ name: 'ProjectRail' }).props('activeId')).toBe('2')
  })

  it('路由进入学习地图时左侧项目栏同步高亮学习地图', async () => {
    const wrapper = createWrapper()
    await wrapper.findComponent({ name: 'ProjectRail' }).vm.$emit('select', '2')
    expect(wrapper.findComponent({ name: 'ProjectRail' }).props('activeId')).toBe('2')

    route.path = '/hub'
    await flushPromises()

    expect(wrapper.findComponent({ name: 'ProjectRail' }).props('activeId')).toBe('3')
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