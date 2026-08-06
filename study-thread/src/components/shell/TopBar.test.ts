import { afterEach, describe, expect, it, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import { nextTick } from 'vue'
import TopBar, { type TopBarMenuItem } from './TopBar.vue'

let router: Router

const menuItems: TopBarMenuItem[] = [
  { id: 'new-thread', label: '新建会话', shortcut: 'Ctrl+N' },
  { id: 'notes', label: '打开资料库' },
  { id: 'sep', separator: true },
  { id: 'chat', label: '返回学习会话' },
]

beforeEach(() => {
  router = createRouter({ history: createMemoryHistory(), routes: [] })
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('TopBar', () => {
  it('齿轮设置按钮发出 settings 事件', async () => {
    const wrapper = mount(TopBar, {
      props: { breadcrumbs: ['学习会话'] },
      global: { plugins: [router] },
      attachTo: document.body,
    })

    await wrapper.find('button[aria-label="设置"]').trigger('click')
    expect(wrapper.emitted('settings')).toBeTruthy()
    wrapper.unmount()
  })

  it('三个点按钮打开下拉菜单并展示菜单项与分隔线', async () => {
    const wrapper = mount(TopBar, {
      props: { breadcrumbs: ['学习会话'], menuItems },
      global: { plugins: [router] },
      attachTo: document.body,
    })

    await wrapper.find('button[aria-label="更多操作"]').trigger('click')
    await nextTick()

    expect(document.querySelector('.top-bar__dropdown')).not.toBeNull()
    const labels = [...document.querySelectorAll('.top-bar__dropdown-item')].map((el) => el?.textContent ?? '')
    expect(labels[0]).toContain('新建会话')
    expect(labels[1]).toContain('打开资料库')
    expect(labels[2]).toContain('返回学习会话')
    expect(document.querySelector('.top-bar__dropdown-sep')).not.toBeNull()
    wrapper.unmount()
  })

  it('点击菜单项发出 menu-action 并关闭菜单', async () => {
    const wrapper = mount(TopBar, {
      props: { breadcrumbs: ['学习会话'], menuItems },
      global: { plugins: [router] },
      attachTo: document.body,
    })

    await wrapper.find('button[aria-label="更多操作"]').trigger('click')
    await nextTick()
    await document.querySelectorAll<HTMLButtonElement>('.top-bar__dropdown-item')[0]?.click()
    await nextTick()

    expect(wrapper.emitted('menu-action')).toEqual([['new-thread']])
    expect(document.querySelector('.top-bar__dropdown')).toBeNull()
    wrapper.unmount()
  })

  it('Escape 键关闭菜单', async () => {
    const wrapper = mount(TopBar, {
      props: { breadcrumbs: ['学习会话'], menuItems },
      global: { plugins: [router] },
      attachTo: document.body,
    })

    await wrapper.find('button[aria-label="更多操作"]').trigger('click')
    await nextTick()
    expect(document.querySelector('.top-bar__dropdown')).not.toBeNull()

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(document.querySelector('.top-bar__dropdown')).toBeNull()
    wrapper.unmount()
  })

  it('点击外部区域关闭菜单', async () => {
    const wrapper = mount(TopBar, {
      props: { breadcrumbs: ['学习会话'], menuItems },
      global: { plugins: [router] },
      attachTo: document.body,
    })

    await wrapper.find('button[aria-label="更多操作"]').trigger('click')
    await nextTick()
    expect(document.querySelector('.top-bar__dropdown')).not.toBeNull()

    document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await nextTick()
    expect(document.querySelector('.top-bar__dropdown')).toBeNull()
    wrapper.unmount()
  })
})
