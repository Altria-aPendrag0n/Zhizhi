import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import PlanBoard from './PlanBoard.vue'
import type { PlanDoc } from '../../types'

const { routerPush, toast, planStore, vaultStore, sessionStore, providerChat } = vi.hoisted(() => ({
  routerPush: vi.fn().mockResolvedValue(undefined),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  planStore: {
    plans: [] as PlanDoc[],
    todayGroups: [] as Array<{ plan: PlanDoc; tasks: PlanDoc['tasks'] }>,
    todayCount: 0,
    completeTask: vi.fn().mockResolvedValue(true),
    associateSession: vi.fn().mockResolvedValue(true),
    setPlanStatus: vi.fn().mockResolvedValue(true),
    createPlan: vi.fn().mockResolvedValue('/vault/plans/rust-30d.md'),
  },
  vaultStore: {
    vaultPath: '/vault' as string | null,
    saveCurrentSession: vi.fn().mockResolvedValue('/vault/sessions/sess_x.md'),
  },
  sessionStore: { loadSessionsFromVault: vi.fn().mockResolvedValue(undefined) },
  providerChat: vi.fn(),
}))

vi.mock('vue-router', () => ({ useRouter: () => ({ push: routerPush }) }))
vi.mock('../../composables/useToast', () => ({ useToast: () => toast }))
vi.mock('../../stores/plan', () => ({ usePlanStore: () => planStore }))
vi.mock('../../stores/vault', () => ({ useVaultStore: () => vaultStore }))
vi.mock('../../stores/session', () => ({ useSessionStore: () => sessionStore }))
vi.mock('../../stores/settings', () => ({
  useSettingsStore: () => ({
    getProviderConfig: () => ({ type: 'openai-compat' as const, apiKey: 'key', baseUrl: 'http://x', model: 'm' }),
  }),
}))
vi.mock('../../stores/notes', () => ({ useNoteStore: () => ({ notes: [] }) }))
vi.mock('../../stores/references', () => ({ useReferenceStore: () => ({ references: [] }) }))
vi.mock('../../api/provider-factory', () => ({ createProvider: () => ({ chat: providerChat }) }))

function planDoc(partial: Partial<PlanDoc> = {}): PlanDoc {
  return {
    path: '/vault/plans/rust-30d.md',
    kind: 'plan',
    plan: 'rust-30d',
    title: '30 天入门 Rust',
    goal: '能独立写出 CLI 工具',
    status: 'active',
    created: '2026-09-03',
    daily_minutes: 60,
    phases: [{ id: 'p1', title: '基础语法', objective: '掌握所有权' }],
    tasks: [
      { id: 't1', phase: 'p1', title: '安装工具链', detail: '安装 rustup', estimate: 30, done: false, done_at: null, sessions: [] },
      { id: 't2', phase: 'p1', title: 'Hello World', estimate: 20, done: false, done_at: null, sessions: [] },
    ],
    body: '路径说明。',
    ...partial,
  }
}

function mockReply(text: string) {
  providerChat.mockImplementation(async function* () {
    yield { type: 'text', content: text }
  })
}

const PLAN_JSON = JSON.stringify({
  plan: 'rust-30d',
  title: '30 天入门 Rust',
  goal: '能独立写出 CLI 工具',
  daily_minutes: 60,
  phases: [{ id: 'p1', title: '基础语法' }],
  tasks: [{ id: 't001', phase: 'p1', title: '安装工具链', detail: '安装 rustup', estimate: 60 }],
  body: '# 30 天入门 Rust',
})

describe('PlanBoard 列表模式', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    planStore.plans = []
    planStore.todayGroups = []
    planStore.todayCount = 0
    vaultStore.vaultPath = '/vault'
  })

  it('无计划时显示空态，点击 CTA 进入生成向导', async () => {
    const wrapper = mount(PlanBoard)
    expect(wrapper.text()).toContain('还没有学习计划')
    await wrapper.find('.plan-board__cta').trigger('click')
    expect(wrapper.text()).toContain('制定学习计划')
    expect(wrapper.find('form.plan-board__composer').exists()).toBe(true)
    // 空向导不渲染对话容器（避免出现无法输入的空框），首条消息发出后才出现
    expect(wrapper.find('.plan-board__chat').exists()).toBe(false)
    providerChat.mockImplementation(async function* () {})
    await wrapper.find('textarea.plan-board__input').setValue('想学 Rust')
    await wrapper.find('form.plan-board__composer').trigger('submit')
    await flushPromises()
    expect(wrapper.find('.plan-board__chat').exists()).toBe(true)
  })

  it('今日任务按计划分组渲染，勾选写回 plan store', async () => {
    const plan = planDoc()
    planStore.plans = [plan]
    planStore.todayGroups = [{ plan, tasks: [plan.tasks[0]] }]
    planStore.todayCount = 1

    const wrapper = mount(PlanBoard)
    expect(wrapper.text()).toContain('今日任务（1）')
    expect(wrapper.text()).toContain('安装工具链')

    await wrapper.find('input.plan-board__task-check').setValue(true)
    expect(planStore.completeTask).toHaveBeenCalledWith('rust-30d', 't1', true)
  })

  it('「开始学习」落盘任务上下文会话、回填关联并跳转', async () => {
    const plan = planDoc()
    planStore.plans = [plan]
    planStore.todayGroups = [{ plan, tasks: [plan.tasks[0]] }]
    planStore.todayCount = 1

    const wrapper = mount(PlanBoard)
    await wrapper.find('.plan-board__task-start').trigger('click')
    await flushPromises()

    expect(vaultStore.saveCurrentSession).toHaveBeenCalledTimes(1)
    const savedSession = vaultStore.saveCurrentSession.mock.calls[0][0]
    expect(savedSession.messages[0].content).toContain('今日任务：安装工具链')
    expect(savedSession.messages[0].content).toContain('学习计划「30 天入门 Rust」')
    expect(planStore.associateSession).toHaveBeenCalledWith('rust-30d', 't1', '/vault/sessions/sess_x.md')
    expect(routerPush).toHaveBeenCalledWith({ path: '/chat', query: { thread: expect.stringMatching(/^sess_/) } })
  })

  it('计划卡片展开显示阶段进度与状态操作', async () => {
    const plan = planDoc()
    planStore.plans = [plan]

    const wrapper = mount(PlanBoard)
    expect(wrapper.text()).toContain('全部计划（1）')
    await wrapper.find('.plan-board__plan-head').trigger('click')
    expect(wrapper.text()).toContain('预计')
    await wrapper.findAll('.plan-board__action').filter((b) => b.text() === '暂停')[0].trigger('click')
    expect(planStore.setPlanStatus).toHaveBeenCalledWith('rust-30d', 'paused')
  })
})

describe('PlanBoard 生成向导', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    planStore.plans = []
    planStore.todayGroups = []
    planStore.todayCount = 0
    vaultStore.vaultPath = '/vault'
  })

  async function enterWizardAndSend(reply: string) {
    mockReply(reply)
    const wrapper = mount(PlanBoard)
    await wrapper.find('.plan-board__cta').trigger('click')
    await wrapper.find('textarea.plan-board__input').setValue('想用 30 天入门 Rust，每天 1 小时')
    await wrapper.find('form.plan-board__composer').trigger('submit')
    await flushPromises()
    return wrapper
  }

  it('发送后调用规划师模型，合法计划 JSON 渲染预览卡', async () => {
    const wrapper = await enterWizardAndSend(`好的，这是计划草案：\n\n\`\`\`json\n${PLAN_JSON}\n\`\`\``)

    expect(providerChat).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('就这样，生成计划')
    expect(wrapper.text()).toContain('30 天入门 Rust')
    // 用户消息与 AI 回复各自落盘一次（正式会话）
    expect(vaultStore.saveCurrentSession).toHaveBeenCalledTimes(2)
    const savedSession = vaultStore.saveCurrentSession.mock.calls[0][0]
    expect(savedSession.kind).toBe('plan')
    expect(savedSession.id).toMatch(/^plan_/)
  })

  it('畸形 JSON 输出展示可读错误并允许继续对话', async () => {
    const wrapper = await enterWizardAndSend('```json\n{ "title": "残缺"\n```')
    expect(wrapper.text()).toContain('请让 AI 重新输出')
    expect(wrapper.find('.plan-board__preview').exists()).toBe(false)
    // 输入框未被预览锁定，可继续对话
    expect((wrapper.find('textarea.plan-board__input').element as HTMLTextAreaElement).disabled).toBe(false)
  })

  it('普通追问回复（无 JSON）不触发预览也不报错', async () => {
    const wrapper = await enterWizardAndSend('你之前接触过编程吗？每天大概能投入多久？')
    expect(wrapper.find('.plan-board__preview').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('请让 AI 重新输出')
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('确认生成：计划落盘、会话回填 plan_id 并返回列表', async () => {
    const wrapper = await enterWizardAndSend(`\`\`\`json\n${PLAN_JSON}\n\`\`\``)
    await wrapper.findAll('button').filter((b) => b.text() === '就这样，生成计划')[0].trigger('click')
    await flushPromises()

    expect(planStore.createPlan).toHaveBeenCalledTimes(1)
    const [, draftArg] = planStore.createPlan.mock.calls[0]
    expect(draftArg).toMatchObject({ plan: 'rust-30d', title: '30 天入门 Rust', kind: 'plan' })
    // 会话回填 plan_id 与标题后再次落盘，并刷新侧边栏
    const calls = vaultStore.saveCurrentSession.mock.calls
    const lastCall = calls[calls.length - 1][0]
    expect(lastCall.plan_id).toBe('rust-30d')
    expect(lastCall.title).toBe('计划：30 天入门 Rust')
    expect(sessionStore.loadSessionsFromVault).toHaveBeenCalledWith('/vault')
    expect(toast.success).toHaveBeenCalled()
    expect(wrapper.text()).toContain('还没有学习计划')
  })

  it('「继续调整」关闭预览并保留对话继续发送', async () => {
    const wrapper = await enterWizardAndSend(`\`\`\`json\n${PLAN_JSON}\n\`\`\``)
    await wrapper.findAll('button').filter((b) => b.text() === '继续调整')[0].trigger('click')
    expect(wrapper.find('.plan-board__preview').exists()).toBe(false)
    expect((wrapper.find('textarea.plan-board__input').element as HTMLTextAreaElement).disabled).toBe(false)
    // 对话消息仍在
    expect(wrapper.text()).toContain('想用 30 天入门 Rust')
  })
})
