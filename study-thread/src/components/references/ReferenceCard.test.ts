import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ReferenceCard from './ReferenceCard.vue'
import type { ReferenceMeta } from '../../types'

const reference: ReferenceMeta = {
  id: 'ref-1',
  path: '/vault/references/ref-1.json',
  title: '认知科学导论',
  description: '关于认知科学的一篇综述论文',
  tags: ['认知科学', '论文'],
  fileType: 'pdf',
  fileName: '认知科学导论.pdf',
  filePath: '/vault/references/ref-1.pdf',
  created: '2024-01-01T00:00:00Z',
  updated: '2024-06-15T00:00:00Z',
}

describe('ReferenceCard', () => {
  it('渲染标题', () => {
    const wrapper = mount(ReferenceCard, { props: { reference } })
    expect(wrapper.find('h3').text()).toBe('认知科学导论')
  })

  it('渲染描述', () => {
    const wrapper = mount(ReferenceCard, { props: { reference } })
    expect(wrapper.find('.ref-desc').text()).toContain('认知科学')
  })

  it('渲染标签', () => {
    const wrapper = mount(ReferenceCard, { props: { reference } })
    const tags = wrapper.findAll('.tag')
    expect(tags).toHaveLength(2)
    expect(tags[0].text()).toBe('认知科学')
    expect(tags[1].text()).toBe('论文')
  })

  it('渲染类型标识', () => {
    const wrapper = mount(ReferenceCard, { props: { reference } })
    expect(wrapper.find('.ref-type').text()).toBe('PDF')
  })

  it('点击触发 select 事件', async () => {
    const wrapper = mount(ReferenceCard, { props: { reference } })
    await wrapper.trigger('click')
    expect(wrapper.emitted('select')).toBeTruthy()
    expect(wrapper.emitted('select')![0]).toEqual([reference.path])
  })

  it('selected 状态添加类名', () => {
    const wrapper = mount(ReferenceCard, { props: { reference, isSelected: true } })
    expect(wrapper.find('.reference-card.selected').exists()).toBe(true)
  })

  it('无描述时隐藏描述行', () => {
    const wrapper = mount(ReferenceCard, {
      props: { reference: { ...reference, description: undefined } },
    })
    expect(wrapper.find('.ref-desc').exists()).toBe(false)
  })
})
