import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PlanPreview from './PlanPreview.vue'
import type { PlanDoc } from '../../types'

function draft(partial: Partial<PlanDoc> = {}): PlanDoc {
  return {
    path: '',
    kind: 'plan',
    plan: 'rust-30d',
    title: '30 天入门 Rust',
    goal: '能独立写出 CLI 工具',
    status: 'active',
    created: '2026-09-03',
    daily_minutes: 90,
    phases: [{ id: 'p1', title: '基础语法', objective: '掌握所有权与借用' }],
    tasks: [
      { id: 't1', phase: 'p1', title: '安装工具链', detail: '安装 rustup', estimate: 60, done: false, done_at: null, sessions: [] },
      { id: 't2', phase: 'p1', title: 'Hello World', estimate: 30, done: false, done_at: null, sessions: [] },
    ],
    body: '# 30 天入门 Rust',
    ...partial,
  }
}

describe('PlanPreview', () => {
  it('渲染标题、目标、每日容量与阶段任务', () => {
    const wrapper = mount(PlanPreview, { props: { draft: draft() } })
    expect(wrapper.text()).toContain('30 天入门 Rust')
    expect(wrapper.text()).toContain('能独立写出 CLI 工具')
    expect(wrapper.text()).toContain('每日约 90 分钟')
    expect(wrapper.text()).toContain('共 2 个任务')
    expect(wrapper.text()).toContain('基础语法')
    expect(wrapper.text()).toContain('掌握所有权与借用')
    expect(wrapper.text()).toContain('安装工具链')
    expect(wrapper.text()).toContain('约 60 分钟')
    expect(wrapper.text()).toContain('安装 rustup')
  })

  it('无 detail 的任务不渲染细节行', () => {
    const noDetail = draft({
      tasks: [{ ...draft().tasks[0], detail: undefined }, draft().tasks[1]],
    })
    const wrapper = mount(PlanPreview, { props: { draft: noDetail } })
    expect(wrapper.text()).not.toContain('安装 rustup')
    expect(wrapper.text()).toContain('Hello World')
  })

  it('任务指向未知阶段时归入「其他任务」组', () => {
    const orphan = draft({
      tasks: [draft().tasks[0], { ...draft().tasks[1], id: 't9', phase: 'p-none', title: '游离任务' }],
    })
    const wrapper = mount(PlanPreview, { props: { draft: orphan } })
    expect(wrapper.text()).toContain('其他任务')
    expect(wrapper.text()).toContain('游离任务')
  })

  it('空阶段不渲染分组', () => {
    const wrapper = mount(
      PlanPreview,
      {
        props: {
          draft: draft({
            phases: [
              { id: 'p1', title: '基础语法' },
              { id: 'p2', title: '空阶段' },
            ],
          }),
        },
      },
    )
    expect(wrapper.text()).toContain('基础语法')
    expect(wrapper.text()).not.toContain('空阶段')
  })
})
