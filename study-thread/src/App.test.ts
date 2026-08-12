import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import App from './App.vue'

const { route, push, replace } = vi.hoisted(() => {
  // useRoute 返回响应式对象，使 App.vue 的 watch(() => route.path) 在测试中可被路由变化触发
  const { reactive } = require('vue')
  return {
    route: reactive({ path: '/chat', fullPath: '/chat', query: {} as Record<string, string> }),
    push: vi.fn(),
    replace: vi.fn(),
  }
})

vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ push, replace }),
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
    vaultPath: '/vault',
    restoreLastVault: vi.fn().mockResolvedValue(undefined),
    deleteSession: vi.fn(),
    initIndex: vi.fn().mockResolvedValue(undefined),
  }),
}))

/** 会话 store mock：sessionList 以 ref 提供，mock 通过 getter 解包，测试中可直接改写模拟仓库加载结果 */
const sessionState = vi.hoisted(() => {
  const { ref } = require('vue')
  const sessionList = ref([]) as { value: Array<{ id: string; title: string; created: string; filePath: string }> }
  return {
    sessionList,
    getBranches: vi.fn(() => []),
    initSessionTree: vi.fn().mockResolvedValue(undefined),
    loadSessionsFromVault: vi.fn().mockResolvedValue(undefined),
    renameSessionTitle: vi.fn().mockResolvedValue(true),
    deleteSessionNodeFromVault: vi.fn().mockResolvedValue(true),
  }
})

vi.mock('./stores/session', () => ({
  useSessionStore: () => ({
    // getter 解包 ref：组件读取 sessionList 得到数组，且测试改写 .value 仍触发响应式
    get sessionList() { return sessionState.sessionList.value },
    getBranches: sessionState.getBranches,
    initSessionTree: sessionState.initSessionTree,
    loadSessionsFromVault: sessionState.loadSessionsFromVault,
    renameSessionTitle: sessionState.renameSessionTitle,
    deleteSessionNodeFromVault: sessionState.deleteSessionNodeFromVault,
  }),
}))

vi.mock('./stores/notes', () => ({
  useNoteStore: () => ({
    notes: [],
  }),
}))

const SAMPLE_SESSIONS = [
  { id: 'sess_1', title: '费曼学习法拆解', created: '2026-08-12T02:30:00.000Z', filePath: '/vault/sessions/sess_1.md' },
  { id: 'sess_2', title: '工作记忆的边界', created: '2026-08-10T09:15:00.000Z', filePath: '/vault/sessions/sess_2.md' },
]

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
        WelcomeOverlay: true,
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
    sessionState.sessionList.value = [...SAMPLE_SESSIONS]
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

  it('切换到资料库时不切换会话列表（会话列表来自 vault，资料库路由隐藏会话栏）', async () => {
    const wrapper = createWrapper()
    const projectRail = wrapper.findComponent({ name: 'ProjectRail' })

    await projectRail.vm.$emit('select', '2')

    // 资料库项目无独立会话列表：会话栏为空，不展示项目2的旧会话
    const threadsProp = wrapper.findComponent({ name: 'ThreadList' }).props('threads') as { title: string }[]
    expect(threadsProp).toHaveLength(0)
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

describe('App 仓库会话列表（vault 驱动）', () => {
  beforeEach(() => {
    route.path = '/chat'
    route.query = {}
    push.mockReset()
  })

  it('会话栏从 sessionStore.sessionList 派生（仓库即真相，无本地缓存）', () => {
    sessionState.sessionList.value = [...SAMPLE_SESSIONS]
    const wrapper = createWrapper()

    const threads = wrapper.findComponent({ name: 'ThreadList' }).props('threads') as { id: string; title: string; meta: string }[]
    expect(threads.map((t) => t.id)).toEqual(['sess_1', 'sess_2'])
    expect(threads.map((t) => t.title)).toEqual(['费曼学习法拆解', '工作记忆的边界'])
    // meta 由 created 时间格式化，非空字符串
    expect(threads.every((t) => typeof t.meta === 'string' && t.meta.length > 0)).toBe(true)
  })

  it('vault 打开后触发仓库会话列表加载', () => {
    createWrapper()

    expect(sessionState.loadSessionsFromVault).toHaveBeenCalledWith('/vault')
  })

  it('新建会话仅导航到空会话，不写本地缓存（首条消息落盘后由仓库列表承载）', async () => {
    const wrapper = createWrapper()
    await wrapper.findComponent({ name: 'ProjectRail' }).vm.$emit('select', '1')
    push.mockClear()

    await wrapper.findComponent({ name: 'ThreadList' }).vm.$emit('new-thread')

    expect(push).toHaveBeenCalledWith(expect.objectContaining({ path: '/chat' }))
    const threadQuery = (push.mock.calls[0][0] as { query: { thread: string } }).query.thread
    expect(threadQuery).toMatch(/^new_\d+$/)
  })

  it('重命名会话改写仓库 md 并刷新列表', async () => {
    sessionState.sessionList.value = [...SAMPLE_SESSIONS]
    const wrapper = createWrapper()
    const threadList = wrapper.findComponent({ name: 'ThreadList' })

    await threadList.vm.$emit('rename', 'sess_1', '新标题')

    expect(sessionState.renameSessionTitle).toHaveBeenCalledWith('/vault', 'sess_1', '新标题')
    expect(sessionState.loadSessionsFromVault).toHaveBeenCalledWith('/vault')
  })

  it('删除会话删除仓库文件并刷新列表，回到空会话页', async () => {
    sessionState.sessionList.value = [...SAMPLE_SESSIONS]
    route.query = { thread: 'sess_1' }
    const wrapper = createWrapper()
    const threadList = wrapper.findComponent({ name: 'ThreadList' })
    replace.mockClear()

    await threadList.vm.$emit('delete', 'sess_1')
    await flushPromises()

    expect(sessionState.deleteSessionNodeFromVault).toHaveBeenCalledWith('/vault', 'sess_1')
    expect(sessionState.loadSessionsFromVault).toHaveBeenCalledWith('/vault')
    expect(replace).toHaveBeenCalledWith({ path: '/chat' })
  })
})
