import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ContributionGraph from './ContributionGraph.vue'
import { toDateKey } from '../../utils/learning-stats'

function dateKeyAt(daysAgo: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return toDateKey(d)
}

function mountGraph(daily: Record<string, { qa: number; review: number; note: number }> = {}, weekCount?: number) {
  return mount(ContributionGraph, {
    props: { daily, ...(weekCount ? { weekCount } : {}) },
  })
}

describe('ContributionGraph', () => {
  it('默认渲染 53 周 × 7 天 = 371 个格子', () => {
    const wrapper = mountGraph({})
    expect(wrapper.findAll('.cg__cell')).toHaveLength(371)
  })

  it('有学习记录的日期渲染对应层级，无记录为 lvl0', () => {
    const wrapper = mountGraph(
      {
        [dateKeyAt(0)]: { qa: 1, review: 0, note: 0 },
        [dateKeyAt(1)]: { qa: 3, review: 1, note: 2 },
      },
      53,
    )

    const labelAt = (daysAgo: number) => {
      const d = new Date()
      d.setDate(d.getDate() - daysAgo)
      return `${d.getMonth() + 1}月${d.getDate()}日`
    }

    const cells = wrapper.findAll('.cg__cell')
    const byDate = new Map<string, string>()
    wrapper.findAll('.cg__cell-wrap').forEach((wrap) => {
      const tip = wrap.find('.cg__tip-title').text()
      const lvlClass = wrap.find('.cg__cell').classes().find((c) => c.startsWith('cg__cell--lvl'))
      if (lvlClass) byDate.set(tip, lvlClass)
    })
    // 今天：总次数 1 → lvl1；昨天：总次数 6 → lvl4（最高档）
    expect(byDate.get(labelAt(0))).toBe('cg__cell--lvl1')
    expect(byDate.get(labelAt(1))).toBe('cg__cell--lvl4')
    expect(cells.length).toBe(371)
  })

  it('hover 提示包含三类明细', () => {
    const wrapper = mountGraph({ [dateKeyAt(1)]: { qa: 3, review: 1, note: 2 } })
    const tipRows = wrapper.findAll('.cg__tip-row').map((row) => row.text())
    expect(tipRows).toContain('问答 3')
    expect(tipRows).toContain('复习 1')
    expect(tipRows).toContain('笔记 2')
  })

  it('无学习记录的日子提示「无学习记录」', () => {
    const wrapper = mountGraph({})
    const tips = wrapper.findAll('.cg__tip-row')
    expect(tips.length).toBeGreaterThan(0)
    expect(tips[0].text()).toBe('无学习记录')
  })

  it('星期标签与格子行严格对齐：周一/周三/周五分别位于第 1/3/5 行', () => {
    const wrapper = mountGraph({})
    const spans = wrapper.findAll('.cg__weekday-col span')
    expect(spans).toHaveLength(3)
    const rows = spans.map((span) => span.attributes('style'))
    // 第 1/3/5 行 = gridRow 1/3/5
    expect(rows[0]).toContain('grid-row: 1')
    expect(rows[1]).toContain('grid-row: 3')
    expect(rows[2]).toContain('grid-row: 5')
  })

  it('自定义周数时按 周数×7 渲染', () => {
    const wrapper = mountGraph({}, 26)
    expect(wrapper.findAll('.cg__cell')).toHaveLength(26 * 7)
  })

  it('格子尺寸按容器宽度自适应：容器变宽时放大以填满（未测量时兜底 10px）', async () => {
    // 模拟容器宽度 800px
    const proto = HTMLElement.prototype
    const original = Object.getOwnPropertyDescriptor(proto, 'clientWidth')
    Object.defineProperty(proto, 'clientWidth', {
      configurable: true,
      get: () => 800,
    })

    const wrapper = mount(ContributionGraph, { props: { daily: {} } })
    await nextTick()

    Object.defineProperty(proto, 'clientWidth', original ?? { configurable: true, value: 0 })

    const style = (wrapper.element as HTMLElement).style
    const size = parseInt(style.getPropertyValue('--cg-cell'), 10)
    expect(size).toBeGreaterThan(10)
  })

  afterEach(() => {
    // 恢复 clientWidth 原型，避免影响其他用例
    const proto = HTMLElement.prototype
    if (proto.clientWidth === 800) {
      Object.defineProperty(proto, 'clientWidth', { configurable: true, value: 0 })
    }
  })
})
