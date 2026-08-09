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
  it('brandTitle 时当前标题应用品牌样式类', () => {
    const wrapper = mount(TopBar, {
      props: { breadcrumbs: ['知枝'], brandTitle: true },
      global: { plugins: [router] },
    })

    const current = wrapper.find('.top-bar__crumb--current')
    expect(current.classes()).toContain('top-bar__crumb--brand')
    wrapper.unmount()
  })

  it('非 brandTitle 时当前标题不应用品牌样式类', () => {
    const wrapper = mount(TopBar, {
      props: { breadcrumbs: ['学习会话'], brandTitle: false },
      global: { plugins: [router] },
    })

    const current = wrapper.find('.top-bar__crumb--current')
    expect(current.classes()).not.toContain('top-bar__crumb--brand')
    wrapper.unmount()
  })

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

  it('默认（editable=false）不渲染标题编辑按钮（静态界面名不可编辑）', () => {
    const wrapper = mount(TopBar, {
      props: { breadcrumbs: ['资料库'] },
      global: { plugins: [router] },
    })

    expect(wrapper.find('button[aria-label="编辑会话标题"]').exists()).toBe(false)
    expect(wrapper.find('input[aria-label="会话标题"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('资料库')
    wrapper.unmount()
  })

  it('editable=true 时渲染编辑按钮，保存后发出 update-title', async () => {
    const wrapper = mount(TopBar, {
      props: { breadcrumbs: ['学习会话', '工作记忆的边界'], editable: true },
      global: { plugins: [router] },
      attachTo: document.body,
    })

    await wrapper.find('button[aria-label="编辑会话标题"]').trigger('click')
    await nextTick()
    const input = wrapper.find('input[aria-label="会话标题"]')
    expect(input.exists()).toBe(true)
    expect((input.element as HTMLInputElement).value).toBe('工作记忆的边界')

    await input.setValue('记忆工作区新标题')
    await input.trigger('blur')
    await nextTick()

    expect(wrapper.emitted('update-title')).toEqual([['记忆工作区新标题']])
    wrapper.unmount()
  })

  it('editable=false 时点击不会出现编辑输入框', async () => {
    const wrapper = mount(TopBar, {
      props: { breadcrumbs: ['学习地图'] },
      global: { plugins: [router] },
      attachTo: document.body,
    })

    expect(wrapper.find('button[aria-label="编辑会话标题"]').exists()).toBe(false)
    expect(wrapper.find('input[aria-label="会话标题"]').exists()).toBe(false)
    wrapper.unmount()
  })
})
