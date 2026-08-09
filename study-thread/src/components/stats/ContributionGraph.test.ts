import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
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
  it('默认「当月」视图：只渲染当月天数个格子', () => {
    const wrapper = mountGraph({})
    const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
    expect(wrapper.findAll('.cg__cell')).toHaveLength(daysInMonth)
  })

  it('切换到「全年」视图渲染 53 周 × 7 天 = 371 个格子', async () => {
    const wrapper = mountGraph({})
    await wrapper.findAll('.cg__view-btn')[1].trigger('click')
    expect(wrapper.findAll('.cg__cell')).toHaveLength(371)
  })

  it('有学习记录的日期渲染对应层级，无记录为 lvl0（全年视图）', async () => {
    const wrapper = mountGraph(
      {
        [dateKeyAt(0)]: { qa: 1, review: 0, note: 0 },
        [dateKeyAt(1)]: { qa: 3, review: 1, note: 2 },
      },
      53,
    )
    await wrapper.findAll('.cg__view-btn')[1].trigger('click')

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

  it('hover 提示包含三类明细（当月视图）', () => {
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

  it('全年视图自定义周数时按 周数×7 渲染', async () => {
    const wrapper = mountGraph({}, 26)
    await wrapper.findAll('.cg__view-btn')[1].trigger('click')
    expect(wrapper.findAll('.cg__cell')).toHaveLength(26 * 7)
  })
})
