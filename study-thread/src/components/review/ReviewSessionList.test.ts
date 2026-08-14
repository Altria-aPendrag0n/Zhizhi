import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ReviewSessionList from './ReviewSessionList.vue'
import type { ReviewSessionMeta } from '../../utils/review-session'

function localIso(year: number, month: number, day: number, hour = 12): string {
  return new Date(year, month - 1, day, hour, 0, 0).toISOString()
}

const first: ReviewSessionMeta = {
  id: 'review_1',
  title: '复习：费曼学习法',
  created: localIso(2026, 8, 10),
  reviewedNote: '/vault/notes/费曼学习法.md',
  completed: true,
  questionCount: 3,
}

const second: ReviewSessionMeta = {
  id: 'review_2',
  title: '复习：间隔重复',
  created: localIso(2026, 8, 11),
  reviewedNote: '/vault/notes/间隔重复.md',
  completed: false,
  questionCount: 5,
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('ReviewSessionList', () => {
  it('渲染数量与卡片', () => {
    const wrapper = mount(ReviewSessionList, { props: { sessions: [first, second] } })
    expect(wrapper.text()).toContain('2 个会话')
    expect(wrapper.findAll('.review-session-item')).toHaveLength(2)
  })

  it('搜索按标题过滤', async () => {
    const wrapper = mount(ReviewSessionList, { props: { sessions: [first, second] } })
    await wrapper.find('.review-session-search').setValue('间隔重复')
    expect(wrapper.findAll('.review-session-item')).toHaveLength(1)
    expect(wrapper.text()).toContain('复习：间隔重复')
  })

  it('搜索按笔记路径过滤', async () => {
    const wrapper = mount(ReviewSessionList, { props: { sessions: [first, second] } })
    await wrapper.find('.review-session-search').setValue('费曼学习法')
    expect(wrapper.findAll('.review-session-item')).toHaveLength(1)
    expect(wrapper.text()).toContain('复习：费曼学习法')
  })

  it('按指定日期筛选', async () => {
    const wrapper = mount(ReviewSessionList, { props: { sessions: [first, second] } })
    await wrapper.find('.review-session-date').setValue('2026-08-10')
    expect(wrapper.findAll('.review-session-item')).toHaveLength(1)
    expect(wrapper.text()).toContain('复习：费曼学习法')
  })

  it('清除筛选恢复列表', async () => {
    const wrapper = mount(ReviewSessionList, { props: { sessions: [first, second] } })
    await wrapper.find('.review-session-search').setValue('费曼学习法')
    expect(wrapper.findAll('.review-session-item')).toHaveLength(1)
    await wrapper.find('.review-session-clear').trigger('click')
    expect(wrapper.findAll('.review-session-item')).toHaveLength(2)
  })

  it('无匹配时显示无匹配文案', async () => {
    const wrapper = mount(ReviewSessionList, { props: { sessions: [first] } })
    await wrapper.find('.review-session-search').setValue('不存在的关键词')
    expect(wrapper.find('.review-session-empty').text()).toContain('没有匹配的复习会话')
  })

  it('空会话列表显示空态文案', () => {
    const wrapper = mount(ReviewSessionList, { props: { sessions: [] } })
    expect(wrapper.find('.review-session-empty').text()).toContain('还没有复习会话')
  })
})
