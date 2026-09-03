import { describe, expect, it, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ThreadList, { type Thread } from './ThreadList.vue'
import type { SessionTreeNode } from '../../utils/session-tree'

const threads: Thread[] = [
  { id: '1', title: '主会话A', meta: '10:00' },
  { id: '2', title: '主会话B', meta: '09:00' },
]

const branches: Record<string, SessionTreeNode[]> = {
  '1': [
    {
      id: 'branch_1',
      type: 'branch',
      title: '分支一',
      file: 'branch-1.md',
      created: '2026-01-01T00:00:00.000Z',
      fork_from: '1',
      children: [
        {
          id: 'branch_1_1',
          type: 'branch',
          title: '分支一子',
          file: 'branch-1-1.md',
          created: '2026-01-02T00:00:00.000Z',
          fork_from: 'branch_1',
          children: [],
        },
      ],
    },
  ],
}

function mountList(overrides: Record<string, unknown> = {}) {
  return mount(ThreadList, {
    props: {
      projectName: '知枝学习',
      threads,
      activeId: null,
      threadCount: 2,
      noteCount: 0,
      branches,
      ...overrides,
    },
    global: {
      stubs: { teleport: true },
    },
  })
}

describe('ThreadList 分支展开', () => {
  it('有分支的会话显示展开箭头，无分支的不显示', () => {
    const wrapper = mountList()
    const items = wrapper.findAll('.thread-list__item')
    expect(items[0].find('.thread-list__item-toggle').exists()).toBe(true)
    expect(items[1].find('.thread-list__item-toggle').exists()).toBe(false)
    wrapper.unmount()
  })

  it('点击箭头展开分支树，嵌套分支默认收起', async () => {
    const wrapper = mountList()
    await wrapper.findAll('.thread-list__item-toggle')[0].trigger('click')

    expect(wrapper.text()).toContain('分支一')
    // 一级分支有子分支展开箭头
    expect(wrapper.find('.thread-branch__toggle').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('分支一子')
    wrapper.unmount()
  })

  it('点击子分支箭头展开嵌套分支', async () => {
    const wrapper = mountList()
    await wrapper.findAll('.thread-list__item-toggle')[0].trigger('click')
    await wrapper.find('.thread-branch__toggle').trigger('click')

    expect(wrapper.text()).toContain('分支一子')
    wrapper.unmount()
  })

  it('再次点击箭头收起分支树', async () => {
    const wrapper = mountList()
    const toggle = wrapper.findAll('.thread-list__item-toggle')[0]
    await toggle.trigger('click')
    expect(wrapper.text()).toContain('分支一')

    await toggle.trigger('click')
    expect(wrapper.text()).not.toContain('分支一')
    wrapper.unmount()
  })

  it('点击分支发出 open-branch 事件（主会话 id + 分支 id）', async () => {
    const wrapper = mountList()
    await wrapper.findAll('.thread-list__item-toggle')[0].trigger('click')
    await wrapper.findAll('.thread-branch__row')[0].trigger('click')

    expect(wrapper.emitted('open-branch')).toEqual([['1', 'branch_1']])
    wrapper.unmount()
  })

  it('点击分支不会触发选中主会话', async () => {
    const wrapper = mountList()
    await wrapper.findAll('.thread-list__item-toggle')[0].trigger('click')
    await wrapper.findAll('.thread-branch__row')[0].trigger('click')

    expect(wrapper.emitted('select')).toBeUndefined()
    wrapper.unmount()
  })

  it('激活分支高亮显示', async () => {
    const wrapper = mountList({ activeBranchId: 'branch_1' })
    await wrapper.findAll('.thread-list__item-toggle')[0].trigger('click')

    const rows = wrapper.findAll('.thread-branch__row')
    expect(rows[0].classes()).toContain('is-active')
    wrapper.unmount()
  })

  it('右键分支弹出菜单，点击删除分支发出 delete-branch 事件', async () => {
    const wrapper = mountList()
    await wrapper.findAll('.thread-list__item-toggle')[0].trigger('click')
    await wrapper.findAll('.thread-branch__row')[0].trigger('contextmenu')

    const menuButtons = wrapper.findAll('.thread-list__context-menu button')
    expect(menuButtons).toHaveLength(1)
    expect(menuButtons[0].text()).toContain('删除分支')

    await menuButtons[0].trigger('click')
    expect(wrapper.emitted('delete-branch')).toEqual([['1', 'branch_1']])
    wrapper.unmount()
  })
})

describe('ThreadList 分组（学习会话 / 计划会话）', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  const groupedThreads: Thread[] = [
    { id: '1', title: '学习会话A', meta: '10:00' },
    { id: '2', title: '计划向导', meta: '09:00', kind: 'plan' },
    { id: '3', title: '学习会话B', meta: '08:00' },
  ]

  it('按 kind 分为学习/计划两组，计划会话不出现在学习组', () => {
    const wrapper = mount(ThreadList, {
      props: {
        projectName: '知枝学习',
        threads: groupedThreads,
        activeId: null,
        threadCount: 3,
        noteCount: 0,
      },
      global: { stubs: { teleport: true } },
    })

    const heads = wrapper.findAll('.thread-list__group-head')
    expect(heads).toHaveLength(2)
    expect(heads[0].text()).toContain('学习会话')
    expect(heads[0].text()).toContain('2')
    expect(heads[1].text()).toContain('计划会话')
    expect(heads[1].text()).toContain('1')

    const learningGroup = wrapper.findAll('.thread-list__group')[0]
    expect(learningGroup.text()).not.toContain('计划向导')
    const planGroup = wrapper.findAll('.thread-list__group')[1]
    expect(planGroup.text()).toContain('计划向导')
    wrapper.unmount()
  })

  it('无计划会话时不显示计划分组头', () => {
    const wrapper = mountList()
    expect(wrapper.findAll('.thread-list__group-head')).toHaveLength(1)
    expect(wrapper.text()).toContain('学习会话')
    wrapper.unmount()
  })

  it('两类分组可独立折叠，折叠状态持久化到 localStorage', async () => {
    const wrapper = mount(ThreadList, {
      props: {
        projectName: '知枝学习',
        threads: groupedThreads,
        activeId: null,
        threadCount: 3,
        noteCount: 0,
      },
      global: { stubs: { teleport: true } },
    })

    const heads = wrapper.findAll('.thread-list__group-head')
    await heads[0].trigger('click')
    await heads[1].trigger('click')

    // 两组均收起：会话条目不可见，分组头仍在
    expect(wrapper.findAll('.thread-list__item')).toHaveLength(0)
    expect(wrapper.findAll('.thread-list__group-head')).toHaveLength(2)
    expect(JSON.parse(localStorage.getItem('zhizhi.thread-list.group-collapsed') ?? '{}')).toEqual({
      learning: true,
      plan: true,
    })

    // 重新挂载后折叠状态保持
    wrapper.unmount()
    const remounted = mount(ThreadList, {
      props: {
        projectName: '知枝学习',
        threads: groupedThreads,
        activeId: null,
        threadCount: 3,
        noteCount: 0,
      },
      global: { stubs: { teleport: true } },
    })
    expect(remounted.findAll('.thread-list__item')).toHaveLength(0)
    expect(remounted.findAll('.thread-list__group-head')).toHaveLength(2)
    remounted.unmount()
  })
})
