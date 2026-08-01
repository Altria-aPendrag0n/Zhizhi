import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import NoteCard from './NoteCard.vue'
import type { NoteMeta } from '../../types'

describe('NoteCard', () => {
  const note: NoteMeta = {
    path: '/notes/费曼学习法.md',
    title: '费曼学习法',
    type: 'method',
    tags: ['学习方法', '费曼'],
    created: '2024-01-01T00:00:00Z',
    updated: '2024-06-15T00:00:00Z',
    proposition: '用教别人的方式来检验自己是否真正理解。',
  }

  it('渲染笔记标题', () => {
    const wrapper = mount(NoteCard, { props: { note } })
    expect(wrapper.find('h3').text()).toBe('费曼学习法')
  })

  it('渲染笔记类型标签', () => {
    const wrapper = mount(NoteCard, { props: { note } })
    expect(wrapper.find('.note-kind').text()).toBe('方法卡')
  })

  it('渲染笔记命题', () => {
    const wrapper = mount(NoteCard, { props: { note } })
    expect(wrapper.find('.note-body').text()).toContain('用教别人的方式来检验自己是否真正理解')
  })

  it('渲染标签', () => {
    const wrapper = mount(NoteCard, { props: { note } })
    const tags = wrapper.findAll('.tag')
    expect(tags).toHaveLength(2)
    expect(tags[0].text()).toBe('学习方法')
    expect(tags[1].text()).toBe('费曼')
  })

  it('渲染有效日期的短日期格式', () => {
    const wrapper = mount(NoteCard, { props: { note } })
    const dateText = wrapper.find('.note-created').text()
    expect(dateText).not.toContain('Invalid')
    expect(dateText).toContain('6')
    expect(dateText).toContain('15')
  })

  it('updated 为空时不渲染日期且不显示 Invalid Date', () => {
    const wrapper = mount(NoteCard, { props: { note: { ...note, updated: '' } } })
    expect(wrapper.text()).not.toContain('Invalid')
    expect(wrapper.find('.note-created').exists()).toBe(false)
  })

  it('updated 为非法字符串时兜底为空而非 Invalid Date', () => {
    const wrapper = mount(NoteCard, { props: { note: { ...note, updated: 'not-a-date' } } })
    expect(wrapper.text()).not.toContain('Invalid')
    expect(wrapper.find('.note-created').exists()).toBe(false)
  })

  it('点击触发 select 事件', async () => {
    const wrapper = mount(NoteCard, { props: { note } })
    await wrapper.trigger('click')
    expect(wrapper.emitted('select')).toBeTruthy()
    expect(wrapper.emitted('select')![0]).toEqual(['/notes/费曼学习法.md'])
  })

  it('selected 状态添加类名', () => {
    const wrapper = mount(NoteCard, { props: { note, isSelected: true } })
    expect(wrapper.find('.note-card.selected').exists()).toBe(true)
  })

  it('无 source 时不显示来源链接', () => {
    const wrapper = mount(NoteCard, { props: { note } })
    expect(wrapper.find('.branch-link').exists()).toBe(false)
  })

  it('有 source 时显示来源链接', () => {
    const noteWithSource: NoteMeta = {
      ...note,
      source: { session: 'sessions/test.md', highlight: '划线文本' },
    }
    const wrapper = mount(NoteCard, { props: { note: noteWithSource } })
    expect(wrapper.find('.branch-link').exists()).toBe(true)
  })

  it('点击来源链接触发 openSource 事件', async () => {
    const source = { session: 'sessions/test.md', highlight: '划线文本' }
    const noteWithSource: NoteMeta = { ...note, source }
    const wrapper = mount(NoteCard, { props: { note: noteWithSource } })
    await wrapper.find('.branch-link').trigger('click')
    expect(wrapper.emitted('openSource')).toBeTruthy()
    expect(wrapper.emitted('openSource')![0]).toEqual([source])
  })
})