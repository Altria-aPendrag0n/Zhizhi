import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ReviewTimeline from './ReviewTimeline.vue'
import { buildReviewTimeline } from '../../utils/review-scheduler'
import type { ReviewTask } from '../../types'

// 全部用本地时间构造，保证在任何时区下行为一致
const NOW = new Date(2026, 7, 8, 12, 0) // 本地 2026-08-08 12:00

function tlTask(partial: Partial<ReviewTask> & { notePath: string; title: string; dueAt: string }): ReviewTask {
  return {
    type: 'concept',
    interval: 1,
    mastery: 0.2,
    history: [],
    ...partial,
  }
}

function localDay(offset: number, hour = 9): string {
  const d = new Date(NOW)
  d.setDate(d.getDate() + offset)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}

/** 样例：今天 1 条 + 逾期 2 条；明天 2 条；第 4 天 6 条（触发折叠）；其余天为空 */
function buildSampleDays() {
  const tasks: ReviewTask[] = [
    tlTask({ notePath: 'notes/stale1.md', title: '逾期一', dueAt: localDay(-1, 20) }),
    tlTask({ notePath: 'notes/stale2.md', title: '逾期二', dueAt: localDay(-2, 10) }),
    tlTask({ notePath: 'notes/today.md', title: '今天任务', dueAt: localDay(0) }),
    tlTask({ notePath: 'notes/tomorrow1.md', title: '明天任务一', dueAt: localDay(1) }),
    tlTask({ notePath: 'notes/tomorrow2.md', title: '明天任务二', dueAt: localDay(1, 18) }),
  ]
  for (let i = 1; i <= 6; i++) {
    tasks.push(tlTask({ notePath: `notes/day3-${i}.md`, title: `第四天任务${i}`, dueAt: localDay(3, 8 + i) }))
  }
  return buildReviewTimeline(tasks, NOW)
}

function mountTimeline(days = buildSampleDays()) {
  return mount(ReviewTimeline, { props: { days } })
}

describe('ReviewTimeline 复习时间轴', () => {
  it('渲染 7 张日卡：日期、星期与数量徽章', () => {
    const wrapper = mountTimeline()
    const cards = wrapper.findAll('.review-timeline__day')
    expect(cards).toHaveLength(7)
    expect(cards[0].text()).toContain('08-08')
    expect(cards[0].text()).toContain('周六')
    expect(cards[1].text()).toContain('08-09')
  })

  it('今天卡高亮并带「今天」标，逾期标注数量', () => {
    const wrapper = mountTimeline()
    const today = wrapper.findAll('.review-timeline__day')[0]
    expect(today.classes()).toContain('is-today')
    expect(today.find('.review-timeline__today-tag').exists()).toBe(true)
    expect(today.text()).toContain('含 2 项逾期')
    expect(today.text()).toContain('3') // 逾期 2 + 今天 1
  })

  it('空卡显示「无」', () => {
    const wrapper = mountTimeline()
    const empty = wrapper.findAll('.review-timeline__day')[2] // 第 3 天无任务
    expect(empty.text()).toContain('无')
    expect(empty.find('.review-timeline__tasks').exists()).toBe(false)
  })

  it('超过 4 条的任务默认折叠为「+N」，点击展开、再点收起', async () => {
    const wrapper = mountTimeline()
    const heavy = wrapper.findAll('.review-timeline__day')[3]

    const items = () => heavy.findAll('.review-timeline__task-item').length
    expect(items()).toBe(4)
    const more = heavy.find('.review-timeline__more')
    expect(more.text()).toBe('+2')

    await more.trigger('click')
    expect(items()).toBe(6)
    expect(heavy.find('.review-timeline__more').text()).toBe('收起')

    await heavy.find('.review-timeline__more').trigger('click')
    expect(items()).toBe(4)
  })

  it('点击任务条目 emit open 并携带笔记路径', async () => {
    const wrapper = mountTimeline()
    const today = wrapper.findAll('.review-timeline__day')[0]
    // 逾期按 dueAt 升序排最前，第一条是「逾期二」（-2 天）
    await today.findAll('.review-timeline__task')[0].trigger('click')
    expect(wrapper.emitted('open')).toEqual([['notes/stale2.md']])
  })
})
