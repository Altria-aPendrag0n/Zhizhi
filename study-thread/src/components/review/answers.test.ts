import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import ChoiceAnswer from './ChoiceAnswer.vue'
import TrueFalseAnswer from './TrueFalseAnswer.vue'
import FillBlankAnswer from './FillBlankAnswer.vue'
import OrderingAnswer from './OrderingAnswer.vue'

describe('ChoiceAnswer', () => {
  it('渲染选项并带字母前缀（题干不含字母，字母由组件生成）', () => {
    const wrapper = mount(ChoiceAnswer, { props: { options: ['向他人解释', '死记硬背', '题海战术', '闭卷考试'] } })
    const buttons = wrapper.findAll('.review-answer__choice')
    expect(buttons).toHaveLength(4)
    expect(buttons[0].text()).toContain('A')
    expect(buttons[0].text()).toContain('向他人解释')
    expect(buttons[3].text()).toContain('D')
  })

  it('点击选项发出 { index, text }', () => {
    const wrapper = mount(ChoiceAnswer, { props: { options: ['A项', 'B项'] } })
    wrapper.findAll('.review-answer__choice')[1].trigger('click')
    expect(wrapper.emitted('submit')?.[0]).toEqual([{ index: 1, text: 'B项' }])
  })

  it('disabled 时选项禁用', () => {
    const wrapper = mount(ChoiceAnswer, { props: { options: ['A项', 'B项'], disabled: true } })
    expect(wrapper.findAll('.review-answer__choice')[0].attributes('disabled')).toBeDefined()
  })
})

describe('TrueFalseAnswer', () => {
  it('点击「正确」发出 true，点击「错误」发出 false', () => {
    const wrapper = mount(TrueFalseAnswer)
    wrapper.find('.review-answer__tf--correct').trigger('click')
    expect(wrapper.emitted('submit')?.[0]).toEqual([true])

    const wrapper2 = mount(TrueFalseAnswer)
    wrapper2.find('.review-answer__tf--wrong').trigger('click')
    expect(wrapper2.emitted('submit')?.[0]).toEqual([false])
  })
})

describe('FillBlankAnswer', () => {
  it('输入后提交发出字符串，提交后清空', async () => {
    const wrapper = mount(FillBlankAnswer, { props: { blanks: 2 } })
    const input = wrapper.find('.review-answer__input')
    await input.setValue('向他人解释；复习补缺')
    expect(input.attributes('placeholder')).toContain('2个空位')
    wrapper.find('.review-answer__submit').trigger('click')
    expect(wrapper.emitted('submit')?.[0]).toEqual(['向他人解释；复习补缺'])
    await nextTick()
    expect((input.element as HTMLInputElement).value).toBe('')
  })

  it('空输入时提交按钮禁用', () => {
    const wrapper = mount(FillBlankAnswer)
    expect(wrapper.find('.review-answer__submit').attributes('disabled')).toBeDefined()
  })
})

describe('OrderingAnswer', () => {
  const steps = ['向他人解释', '找出缺口', '复习补缺', '简化表达']

  it('渲染乱序步骤列表', () => {
    const wrapper = mount(OrderingAnswer, { props: { steps } })
    expect(wrapper.findAll('.review-answer__step')).toHaveLength(4)
    expect(wrapper.text()).toContain('向他人解释')
  })

  it('上移/下移调整顺序，提交发出重排后的步骤文本', async () => {
    const wrapper = mount(OrderingAnswer, { props: { steps } })
    // 第 2 项上移 → 顺序变为 [找出缺口, 向他人解释, 复习补缺, 简化表达]
    await wrapper.findAll('.review-answer__step')[1].find('.review-answer__move').trigger('click')
    wrapper.find('.review-answer__submit').trigger('click')
    const payload = wrapper.emitted('submit')?.[0] as [string[]]
    expect(payload[0]).toEqual(['找出缺口', '向他人解释', '复习补缺', '简化表达'])
  })

  it('首项的上移按钮禁用（已到顶）', () => {
    const wrapper = mount(OrderingAnswer, { props: { steps } })
    const firstUp = wrapper.findAll('.review-answer__step')[0].findAll('.review-answer__move')[0]
    expect(firstUp.attributes('disabled')).toBeDefined()
  })
})
