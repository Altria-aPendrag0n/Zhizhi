import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePlanStore } from './plan'
import { serializePlanFile } from '../utils/plan-parser'
import type { PlanDoc } from '../types'

const { vaultFs } = vi.hoisted(() => ({
  vaultFs: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    listDir: vi.fn(),
    createDir: vi.fn(),
    fileExists: vi.fn(),
    deleteFile: vi.fn(),
  },
}))
vi.mock('../utils/vault-fs', () => vaultFs)

function planDoc(partial: Partial<PlanDoc> = {}): PlanDoc {
  return {
    path: '',
    kind: 'plan',
    plan: 'rust-30d',
    title: '30 天入门 Rust',
    goal: '能独立写出 CLI 工具',
    status: 'active',
    created: '2026-09-03',
    daily_minutes: 60,
    phases: [{ id: 'p1', title: '基础语法' }],
    tasks: [
      { id: 't1', phase: 'p1', title: '安装工具链', estimate: 30, done: false, done_at: null, sessions: [] },
      { id: 't2', phase: 'p1', title: 'Hello World', estimate: 20, done: false, done_at: null, sessions: [] },
    ],
    body: '路径说明。',
    ...partial,
  }
}

describe('plan store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vaultFs.readFile.mockResolvedValue('')
    vaultFs.writeFile.mockResolvedValue(undefined)
    vaultFs.createDir.mockResolvedValue(undefined)
    vaultFs.listDir.mockResolvedValue([])
  })

  it('loadPlans 扫描 plans/ 目录、跳过目录与非 md、按 created 倒序', async () => {
    const a = planDoc({ plan: 'plan-a', title: '计划A', created: '2026-09-01' })
    const b = planDoc({ plan: 'plan-b', title: '计划B', created: '2026-09-02' })
    vaultFs.listDir.mockResolvedValue([
      { name: 'b.md', path: '/vault/plans/b.md', is_dir: false },
      { name: 'a.md', path: '/vault/plans/a.md', is_dir: false },
      { name: 'sub', path: '/vault/plans/sub', is_dir: true },
      { name: 'x.txt', path: '/vault/plans/x.txt', is_dir: false },
      { name: 'broken.md', path: '/vault/plans/broken.md', is_dir: false },
    ])
    vaultFs.readFile.mockImplementation(async (path: string) => {
      if (path.endsWith('a.md')) return serializePlanFile({ ...a, path: '/vault/plans/a.md' })
      if (path.endsWith('b.md')) return serializePlanFile({ ...b, path: '/vault/plans/b.md' })
      throw new Error('文件损坏')
    })

    const store = usePlanStore()
    await store.loadPlans('/vault')

    expect(store.plans.map((plan) => plan.plan)).toEqual(['plan-b', 'plan-a'])
    expect(store.currentVaultPath).toBe('/vault')
  })

  it('plans 目录缺失时置空列表', async () => {
    vaultFs.listDir.mockRejectedValue(new Error('目录不存在'))
    const store = usePlanStore()
    await store.loadPlans('/vault')
    expect(store.plans).toEqual([])
    expect(store.todayGroups).toEqual([])
  })

  it('todayGroups 聚合活跃计划今日任务，paused 与无待办计划被排除', async () => {
    const active = planDoc({ plan: 'active-plan' })
    const paused = planDoc({ plan: 'paused-plan', status: 'paused', created: '2026-09-02' })
    const finished = planDoc({
      plan: 'finished-plan',
      created: '2026-09-01',
      tasks: planDoc().tasks.map((task) => ({ ...task, done: true })),
    })
    const store = usePlanStore()
    store.$patch({ plans: [active, paused, finished] } as never)

    expect(store.todayGroups).toHaveLength(1)
    expect(store.todayGroups[0].plan.plan).toBe('active-plan')
    expect(store.todayGroups[0].tasks.map((task) => task.id)).toEqual(['t1', 't2'])
    expect(store.todayCount).toBe(2)
  })

  it('createPlan 落盘到 plans/<plan-id>.md 并插入列表', async () => {
    const store = usePlanStore()
    const path = await store.createPlan('/vault', planDoc())

    expect(vaultFs.createDir).toHaveBeenCalledWith('/vault/plans')
    expect(vaultFs.writeFile).toHaveBeenCalledWith('/vault/plans/rust-30d.md', expect.stringContaining('kind: plan'))
    expect(path).toBe('/vault/plans/rust-30d.md')
    expect(store.plans).toHaveLength(1)
    expect(store.plans[0].path).toBe('/vault/plans/rust-30d.md')
  })

  it('completeTask 勾选写回仓库并更新内存', async () => {
    const plan = planDoc()
    const store = usePlanStore()
    store.$patch({ plans: [{ ...plan, path: '/vault/plans/rust-30d.md' }] } as never)

    await expect(store.completeTask('rust-30d', 't1', true)).resolves.toBe(true)
    const task = store.plans[0].tasks.find((item) => item.id === 't1')!
    expect(task.done).toBe(true)
    expect(task.done_at).not.toBeNull()
    expect(vaultFs.writeFile).toHaveBeenCalledWith(
      '/vault/plans/rust-30d.md',
      expect.stringContaining('done: true'),
    )
  })

  it('completeTask 写盘失败时回滚内存并返回 false', async () => {
    vaultFs.writeFile.mockRejectedValue(new Error('磁盘只读'))
    const plan = planDoc()
    const store = usePlanStore()
    store.$patch({ plans: [{ ...plan, path: '/vault/plans/rust-30d.md' }] } as never)

    await expect(store.completeTask('rust-30d', 't1', true)).resolves.toBe(false)
    const task = store.plans[0].tasks.find((item) => item.id === 't1')!
    expect(task.done).toBe(false)
    expect(task.done_at).toBeNull()
  })

  it('completeTask 对不存在的计划或任务返回 false', async () => {
    const store = usePlanStore()
    store.$patch({ plans: [planDoc()] } as never)
    await expect(store.completeTask('missing', 't1')).resolves.toBe(false)
    await expect(store.completeTask('rust-30d', 't-none')).resolves.toBe(false)
    expect(vaultFs.writeFile).not.toHaveBeenCalled()
  })

  it('associateSession 回填会话路径并去重', async () => {
    const plan = planDoc()
    const store = usePlanStore()
    store.$patch({ plans: [{ ...plan, path: '/vault/plans/rust-30d.md' }] } as never)

    await expect(store.associateSession('rust-30d', 't1', '/vault/sessions/sess_1.md')).resolves.toBe(true)
    await expect(store.associateSession('rust-30d', 't1', '/vault/sessions/sess_1.md')).resolves.toBe(true)
    const task = store.plans[0].tasks.find((item) => item.id === 't1')!
    expect(task.sessions).toEqual(['/vault/sessions/sess_1.md'])
    // 第二次为重复关联，不再写盘
    expect(vaultFs.writeFile).toHaveBeenCalledTimes(1)
  })

  it('setPlanStatus 切换状态并写回；同状态为成功无写盘', async () => {
    const plan = planDoc()
    const store = usePlanStore()
    store.$patch({ plans: [{ ...plan, path: '/vault/plans/rust-30d.md' }] } as never)

    await expect(store.setPlanStatus('rust-30d', 'paused')).resolves.toBe(true)
    expect(store.plans[0].status).toBe('paused')
    expect(vaultFs.writeFile).toHaveBeenCalledTimes(1)

    await expect(store.setPlanStatus('rust-30d', 'paused')).resolves.toBe(true)
    expect(vaultFs.writeFile).toHaveBeenCalledTimes(1)
  })
})
