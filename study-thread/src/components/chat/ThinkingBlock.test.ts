import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ThinkingBlock from './ThinkingBlock.vue'

function displayOf(wrapper: ReturnType<typeof mount>, selector: string): string {
  return (wrapper.find(selector).element as HTMLElement).style.display
}

describe('ThinkingBlock', () => {
  it('默认折叠，点击标题可展开再折叠', async () => {
    const wrapper = mount(ThinkingBlock, { props: { text: '思考内容' } })

    expect(displayOf(wrapper, '.thinking-block__content')).toBe('none')

    await wrapper.find('.thinking-block__toggle').trigger('click')
    expect(displayOf(wrapper, '.thinking-block__content')).not.toBe('none')

    await wrapper.find('.thinking-block__toggle').trigger('click')
    expect(displayOf(wrapper, '.thinking-block__content')).toBe('none')
  })

  it('startExpanded 时初始展开（用于流式阶段实时查看）', () => {
    const wrapper = mount(ThinkingBlock, { props: { text: '思考内容', startExpanded: true } })
    expect(displayOf(wrapper, '.thinking-block__content')).not.toBe('none')
  })

  it('展示思考文本与标题', () => {
    const wrapper = mount(ThinkingBlock, { props: { text: '深度思考过程' } })
    expect(wrapper.find('.thinking-block__label').text()).toBe('思考过程')
    expect(wrapper.text()).toContain('深度思考过程')
  })
})
