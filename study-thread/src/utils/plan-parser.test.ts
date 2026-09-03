import { describe, it, expect } from 'vitest'
import type { PlanDoc } from '../types'
import {
  parsePlanFile,
  serializePlanFile,
  computeTodayTasks,
  estimatePhaseCompletion,
  DEFAULT_DAILY_MINUTES,
  DEFAULT_TASK_ESTIMATE,
} from './plan-parser'

const NOW = new Date('2026-09-03T12:00:00.000Z')

function doc(partial: Partial<PlanDoc> = {}): PlanDoc {
  return {
    path: 'plans/rust-30d.md',
    kind: 'plan',
    plan: 'rust-30d',
    title: '30 天入门 Rust',
    goal: '能独立写出中小型 CLI 工具',
    status: 'active',
    created: '2026-09-03',
    daily_minutes: 60,
    phases: [{ id: 'p1', title: '基础语法', objective: '掌握所有权与借用' }],
    tasks: [
      { id: 't1', phase: 'p1', title: '安装工具链', detail: '安装 rustup 与 cargo', estimate: 30, done: false, done_at: null, sessions: [] },
      { id: 't2', phase: 'p1', title: 'Hello World', estimate: 20, done: false, done_at: null, sessions: [] },
      { id: 't3', phase: 'p1', title: '所有权练习', estimate: 60, done: false, done_at: null, sessions: [] },
      { id: 't4', phase: 'p1', title: '结构体与枚举', estimate: 30, done: false, done_at: null, sessions: [] },
    ],
    body: '# 30 天入门 Rust\n\n学习路径说明。',
    ...partial,
  }
}

describe('parsePlanFile', () => {
  it('正常解析 frontmatter 与正文', () => {
    const raw = [
      '---',
      'kind: plan',
      'plan: rust-30d',
      'title: 30 天入门 Rust',
      'goal: 能独立写出中小型 CLI 工具',
      'status: active',
      'created: "2026-09-03"',
      'daily_minutes: 90',
      'phases:',
      '  - id: p1',
      '    title: 基础语法',
      '    objective: 掌握所有权与借用',
      'tasks:',
      '  - id: t1',
      '    phase: p1',
      '    title: 安装工具链',
      '    detail: 安装 rustup 与 cargo',
      '    estimate: 45',
      '    done: false',
      '    done_at: null',
      '    sessions: []',
      '---',
      '',
      '# 30 天入门 Rust',
      '',
      '路径说明。',
    ].join('\n')

    const parsed = parsePlanFile(raw, 'plans/rust-30d.md')
    expect(parsed.kind).toBe('plan')
    expect(parsed.plan).toBe('rust-30d')
    expect(parsed.title).toBe('30 天入门 Rust')
    expect(parsed.goal).toBe('能独立写出中小型 CLI 工具')
    expect(parsed.status).toBe('active')
    expect(parsed.created).toBe('2026-09-03')
    expect(parsed.daily_minutes).toBe(90)
    expect(parsed.phases).toEqual([{ id: 'p1', title: '基础语法', objective: '掌握所有权与借用' }])
    expect(parsed.tasks).toHaveLength(1)
    expect(parsed.tasks[0]).toEqual({
      id: 't1',
      phase: 'p1',
      title: '安装工具链',
      detail: '安装 rustup 与 cargo',
      estimate: 45,
      done: false,
      done_at: null,
      sessions: [],
    })
    expect(parsed.body).toBe('# 30 天入门 Rust\n\n路径说明。')
  })

  it('缺字段按容错默认值补齐', () => {
    const raw = ['---', 'title: 极简计划', '---', ''].join('\n')
    const parsed = parsePlanFile(raw, 'plans/min.md')
    expect(parsed.plan).toBe('min') // 从路径回退
    expect(parsed.status).toBe('active')
    expect(parsed.daily_minutes).toBe(DEFAULT_DAILY_MINUTES)
    expect(parsed.phases).toEqual([])
    expect(parsed.tasks).toEqual([])
    expect(parsed.goal).toBe('')
    expect(parsed.body).toBe('')
  })

  it('任务缺 estimate/id 等字段时补默认值', () => {
    const raw = [
      '---',
      'plan: p',
      'tasks:',
      '  - title: 只有标题的任务',
      '  - title: 已完成任务',
      '    done: true',
      '    done_at: "2026-09-01T10:00:00.000Z"',
      '---',
      '',
    ].join('\n')

    const parsed = parsePlanFile(raw)
    expect(parsed.tasks[0].id).toBe('t1')
    expect(parsed.tasks[0].estimate).toBe(DEFAULT_TASK_ESTIMATE)
    expect(parsed.tasks[0].done).toBe(false)
    expect(parsed.tasks[0].done_at).toBeNull()
    expect(parsed.tasks[0].sessions).toEqual([])
    expect(parsed.tasks[1].done).toBe(true)
    expect(parsed.tasks[1].done_at).toBe('2026-09-01T10:00:00.000Z')
  })

  it('未知 frontmatter 字段保留到 extra', () => {
    const raw = ['---', 'plan: p', 'title: 计划', 'my_custom_field: 保留我', '---', ''].join('\n')
    const parsed = parsePlanFile(raw)
    expect(parsed.extra).toEqual({ my_custom_field: '保留我' })
  })

  it('缺 frontmatter 抛错', () => {
    expect(() => parsePlanFile('# 纯正文，无 frontmatter')).toThrow('缺少 frontmatter')
  })

  it('frontmatter YAML 非法抛错', () => {
    expect(() => parsePlanFile('---\n: : : [[[\n---\n')).toThrow('frontmatter 解析失败')
  })
})

describe('serializePlanFile', () => {
  it('序列化后可无损回读（含未知字段与正文）', () => {
    const original = doc({
      extra: { my_custom_field: '手改内容' },
    })
    const raw = serializePlanFile(original)
    const parsed = parsePlanFile(raw, original.path)
    expect(parsed).toEqual(original)
  })

  it('path 与 body 不写入 frontmatter，正文原样保留', () => {
    const raw = serializePlanFile(doc())
    const frontmatter = raw.split('---')[1]
    expect(frontmatter).not.toContain('path')
    expect(raw).toContain('# 30 天入门 Rust')
  })
})

describe('computeTodayTasks', () => {
  it('按每日容量从队首填充', () => {
    // 容量 60：t1(30) + t2(20) = 50 入选；t3(60) 放不下截止
    const today = computeTodayTasks(doc())
    expect(today.map((t) => t.id)).toEqual(['t1', 't2'])
  })

  it('勾选完成后释放容量、队列自动补位（动态顺延）', () => {
    const advanced = doc({
      tasks: doc().tasks.map((t) =>
        t.id === 't1' || t.id === 't2' ? { ...t, done: true, done_at: '2026-09-03T00:00:00.000Z' } : t,
      ),
    })
    expect(computeTodayTasks(advanced).map((t) => t.id)).toEqual(['t3'])
  })

  it('全部任务完成后返回空数组', () => {
    const allDone = doc({ tasks: doc().tasks.map((t) => ({ ...t, done: true })) })
    expect(computeTodayTasks(allDone)).toEqual([])
  })

  it('队首任务超过容量时仍保留，避免今日任务为空', () => {
    const heavyFirst = doc({ daily_minutes: 30 })
    expect(computeTodayTasks(heavyFirst).map((t) => t.id)).toEqual(['t1'])
  })

  it('paused / archived 计划返回空数组', () => {
    expect(computeTodayTasks(doc({ status: 'paused' }))).toEqual([])
    expect(computeTodayTasks(doc({ status: 'archived' }))).toEqual([])
  })
})

describe('estimatePhaseCompletion', () => {
  it('按剩余时长 ÷ 每日容量顺推预计完成日', () => {
    // p1 剩余 30+20+60+30 = 140 分钟，容量 60 → ceil(140/60) = 3 天
    const estimated = estimatePhaseCompletion(doc(), 'p1', NOW)
    expect(estimated).toEqual(new Date('2026-09-06T12:00:00.000Z'))
  })

  it('勾选推进后预计完成日提前', () => {
    const advanced = doc({
      tasks: doc().tasks.map((t) =>
        t.id === 't1' || t.id === 't2' ? { ...t, done: true, done_at: '2026-09-03T00:00:00.000Z' } : t,
      ),
    })
    // 剩余 90 分钟 → ceil(90/60) = 2 天
    expect(estimatePhaseCompletion(advanced, 'p1', NOW)).toEqual(new Date('2026-09-05T12:00:00.000Z'))
  })

  it('阶段全部完成返回 null', () => {
    const allDone = doc({ tasks: doc().tasks.map((t) => ({ ...t, done: true })) })
    expect(estimatePhaseCompletion(allDone, 'p1', NOW)).toBeNull()
  })

  it('未知阶段 id 返回 null', () => {
    expect(estimatePhaseCompletion(doc(), 'p-none', NOW)).toBeNull()
  })

  it('daily_minutes 非法时返回 null（无法推算）', () => {
    expect(estimatePhaseCompletion(doc({ daily_minutes: 0 }), 'p1', NOW)).toBeNull()
  })
})
