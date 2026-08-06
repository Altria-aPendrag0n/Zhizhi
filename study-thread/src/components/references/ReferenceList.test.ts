import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ReferenceList from './ReferenceList.vue'
import type { ReferenceMeta } from '../../types'

const reference: ReferenceMeta = {
  id: 'ref-1',
  path: '/vault/references/ref-1.json',
  title: '认知科学导论',
  description: '关于认知科学的一篇综述论文',
  tags: ['认知科学'],
  fileType: 'pdf',
  fileName: '认知科学导论.pdf',
  filePath: '/vault/references/ref-1.pdf',
  created: '2026-01-01T00:00:00.000Z',
  updated: '2026-01-01T00:00:00.000Z',
}

const another: ReferenceMeta = {
  ...reference,
  id: 'ref-2',
  path: '/vault/references/ref-2.json',
  title: '工作记忆容量',
  description: '工作记忆容量的研究笔记',
  tags: ['记忆'],
  fileType: 'md',
  fileName: '工作记忆容量.md',
  filePath: '/vault/references/ref-2.md',
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('ReferenceList', () => {
  it('渲染数量与卡片', () => {
    const wrapper = mount(ReferenceList, { props: { references: [reference, another] } })
    expect(wrapper.text()).toContain('2 份参考资料')
    expect(wrapper.findAll('.reference-card')).toHaveLength(2)
  })

  it('搜索按标题过滤', async () => {
    const wrapper = mount(ReferenceList, { props: { references: [reference, another] } })
    await wrapper.find('.search-input').setValue('工作记忆')
    expect(wrapper.findAll('.reference-card')).toHaveLength(1)
    expect(wrapper.text()).toContain('工作记忆容量')
  })

  it('搜索按描述过滤', async () => {
    const wrapper = mount(ReferenceList, { props: { references: [reference, another] } })
    await wrapper.find('.search-input').setValue('综述')
    expect(wrapper.findAll('.reference-card')).toHaveLength(1)
    expect(wrapper.text()).toContain('认知科学导论')
  })

  it('点击上传按钮触发隐藏文件输入并 emit upload(File)', async () => {
    const wrapper = mount(ReferenceList, { props: { references: [reference] } })
    const input = wrapper.find('input[type="file"]')
    const clickSpy = vi.spyOn(input.element as HTMLInputElement, 'click').mockImplementation(() => {})

    await wrapper.find('.upload-btn').trigger('click')
    expect(clickSpy).toHaveBeenCalled()

    const file = new File(['# 内容'], 'test.md', { type: 'text/markdown' })
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')
    expect(wrapper.emitted('upload')).toBeTruthy()
    expect(wrapper.emitted('upload')![0][0]).toBe(file)
  })

  it('无文件时不触发 upload 事件', async () => {
    const wrapper = mount(ReferenceList, { props: { references: [] } })
    const input = wrapper.find('input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: [], configurable: true })
    await input.trigger('change')
    expect(wrapper.emitted('upload')).toBeUndefined()
  })

  it('无参考资料时显示空状态文案', () => {
    const wrapper = mount(ReferenceList, { props: { references: [] } })
    expect(wrapper.find('.empty-state').text()).toContain('还没有参考资料')
  })

  it('搜索无匹配时显示无匹配文案', async () => {
    const wrapper = mount(ReferenceList, { props: { references: [reference] } })
    await wrapper.find('.search-input').setValue('不存在的关键词')
    expect(wrapper.find('.empty-state').text()).toContain('没有匹配的参考资料')
  })

  it('右键菜单触发 delete emit', async () => {
    const wrapper = mount(ReferenceList, {
      props: { references: [reference] },
      attachTo: document.body,
    })

    await wrapper.find('.reference-card').trigger('contextmenu', { clientX: 120, clientY: 120 })
    await nextTick()

    expect(document.querySelector('.ref-context-menu')?.textContent).toContain('删除参考资料')

    await document.querySelector<HTMLButtonElement>('.ref-context-menu button')?.click()
    expect(wrapper.emitted('delete')).toEqual([[reference.path]])
    wrapper.unmount()
  })
})
