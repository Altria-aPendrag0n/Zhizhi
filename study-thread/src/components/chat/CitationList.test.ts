import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CitationList from './CitationList.vue'
import CitationPopover from './CitationPopover.vue'
import type { CitationSource } from '../../types'

const sources: CitationSource[] = [
  { index: 1, kind: 'note', path: '/vault/notes/a.md', title: '笔记A', snippet: '笔记A片段' },
  {
    index: 2,
    kind: 'reference',
    path: '/vault/references/b.json',
    title: '参考B',
    snippet: '参考B片段',
    sectionTitle: '第二章',
    pageFrom: 2,
    pageTo: 3,
  },
]

describe('CitationList', () => {
  it('渲染编号、标题与页码区间', () => {
    const wrapper = mount(CitationList, { props: { sources } })
    expect(wrapper.text()).toContain('参考来源')
    expect(wrapper.text()).toContain('[1]')
    expect(wrapper.text()).toContain('笔记A')
    expect(wrapper.text()).toContain('[2]')
    expect(wrapper.text()).toContain('参考B')
    expect(wrapper.text()).toContain('第 3-4 页')
  })

  it('sources 为空时不渲染', () => {
    const wrapper = mount(CitationList, { props: { sources: [] } })
    expect(wrapper.find('.citation-list').exists()).toBe(false)
  })

  it('点击条目 emit open 事件并携带来源与鼠标事件', async () => {
    const wrapper = mount(CitationList, { props: { sources } })
    await wrapper.findAll('.citation-list__item')[1].trigger('click')
    const emitted = wrapper.emitted('open')
    expect(emitted).toHaveLength(1)
    expect(emitted![0][0]).toEqual(sources[1])
    expect(emitted![0][1]).toBeInstanceOf(MouseEvent)
  })
})

describe('CitationPopover', () => {
  it('渲染类型徽章、标题、位置与摘要', () => {
    const wrapper = mount(CitationPopover, {
      props: { source: sources[1], position: { x: 10, y: 20 } },
    })
    expect(wrapper.text()).toContain('参考资料')
    expect(wrapper.text()).toContain('参考B')
    expect(wrapper.text()).toContain('「第二章」第 3-4 页')
    expect(wrapper.text()).toContain('参考B片段')
  })

  it('note 来源显示笔记徽章，无位置时不显示位置行', () => {
    const wrapper = mount(CitationPopover, {
      props: { source: sources[0], position: { x: 0, y: 0 } },
    })
    expect(wrapper.text()).toContain('笔记')
    expect(wrapper.find('.citation-popover__location').exists()).toBe(false)
  })

  it('点击「打开原文」emit open-source，点击关闭 emit close', async () => {
    const wrapper = mount(CitationPopover, {
      props: { source: sources[0], position: { x: 0, y: 0 } },
    })
    await wrapper.find('.citation-popover__open').trigger('click')
    expect(wrapper.emitted('open-source')![0][0]).toEqual(sources[0])
    await wrapper.find('.citation-popover__close').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})
