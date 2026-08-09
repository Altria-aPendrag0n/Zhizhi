import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ContributionGraph from './ContributionGraph.vue'

describe('ContributionGraph', () => {
  it('默认渲染 53 周 × 7 天 = 371 个格子', () => {
    const wrapper = mount(ContributionGraph, { props: { daily: {} } })
    const cells = wrapper.findAll('.cg__cell')
    expect(cells).toHaveLength(371)
  })

  it('有学习记录的日期渲染对应层级，无记录为 lvl0', () => {
    const wrapper = mount(ContributionGraph, {
      props: {
        daily: {
          '2026-08-01': { qa: 1, review: 0, note: 0 },
          '2026-08-02': { qa: 3, review: 1, note: 2 },
        },
        weekCount: 53,
      },
    })
    const cells = wrapper.findAll('.cg__cell')
    // 8 月 1 日：总次数 1 → lvl1（单档）
    // 8 月 2 日：总次数 6 → lvl4（最高档）
    const byDate = new Map<string, string>()
    wrapper.findAll('.cg__cell-wrap').forEach((wrap) => {
      const tip = wrap.find('.cg__tip-title').text()
      const lvlClass = wrap.find('.cg__cell').classes().find((c) => c.startsWith('cg__cell--lvl'))
      if (lvlClass) byDate.set(tip, lvlClass)
    })
    expect(byDate.get('8月1日')).toBe('cg__cell--lvl1')
    expect(byDate.get('8月2日')).toBe('cg__cell--lvl4')
    expect(cells.length).toBe(371)
  })

  it('hover 提示包含三类明细', () => {
    const wrapper = mount(ContributionGraph, {
      props: { daily: { '2026-08-02': { qa: 3, review: 1, note: 2 } } },
    })
    const tipRows = wrapper.findAll('.cg__tip-row').map((row) => row.text())
    expect(tipRows).toContain('问答 3')
    expect(tipRows).toContain('复习 1')
    expect(tipRows).toContain('笔记 2')
  })

  it('无学习记录的日子提示「无学习记录」', () => {
    const wrapper = mount(ContributionGraph, { props: { daily: {} } })
    const tips = wrapper.findAll('.cg__tip-row')
    expect(tips.length).toBeGreaterThan(0)
    expect(tips[0].text()).toBe('无学习记录')
  })

  it('自定义周数时按 周数×7 渲染', () => {
    const wrapper = mount(ContributionGraph, { props: { daily: {}, weekCount: 26 } })
    expect(wrapper.findAll('.cg__cell')).toHaveLength(26 * 7)
  })
})
