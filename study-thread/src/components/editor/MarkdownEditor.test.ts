import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createTestingPinia } from '@pinia/testing'
import MarkdownEditor from './MarkdownEditor.vue'

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

afterEach(() => {
  document.body.innerHTML = ''
})

describe('MarkdownEditor', () => {
  it('非光标行以 MarkdownLineWidget 渲染预览，光标行保持源码', async () => {
    const wrapper = mount(MarkdownEditor, {
      attachTo: document.body,
      global: {
        plugins: [createTestingPinia({ createSpy: vi.fn })],
      },
      props: {
        modelValue: '# 标题\n第二行\n第三行',
      },
    })

    await nextTick()

    // 光标初始在第 1 行（# 标题），第 2、3 行以 MarkdownLineWidget 渲染预览
    const previewLines = wrapper.findAll('.cm-live-preview-line')
    expect(previewLines).toHaveLength(2)
    expect(previewLines[0].find('p').text()).toBe('第二行')
    expect(previewLines[1].find('p').text()).toBe('第三行')

    // 光标行保持源码：第 1 行仍是 .cm-line 源码行而不是预览 widget
    const sourceLines = wrapper.findAll('.cm-line')
    expect(sourceLines).toHaveLength(1)
    expect(sourceLines[0].text()).toBe('# 标题')
  })

  it('点击预览行后该行切换为源码、编辑器获得焦点并可继续编辑', async () => {
    const wrapper = mount(MarkdownEditor, {
      attachTo: document.body,
      global: {
        plugins: [createTestingPinia({ createSpy: vi.fn })],
      },
      props: {
        modelValue: '# 标题\n第二行\n第三行',
      },
    })

    await nextTick()

    // 点击第 2 行的预览 widget
    const previewLines = wrapper.findAll('.cm-live-preview-line')
    expect(previewLines).toHaveLength(2)
    await previewLines[0].trigger('mousedown')
    await nextTick()

    // 该行切换为源码：第 2 行成为唯一的 .cm-line 源码行
    const sourceLines = wrapper.findAll('.cm-line')
    expect(sourceLines).toHaveLength(1)
    expect(sourceLines[0].text()).toBe('第二行')

    // 编辑器获得焦点
    const contentElement = wrapper.find('.cm-content').element
    expect(document.activeElement).toBe(contentElement)

    // 在源码行输入，modelValue 被更新
    // 先修改 DOM 文本，再派发 keydown（CodeMirror 的 keydown 处理器会同步读取 DOM 变更）
    sourceLines[0].element.textContent = '！第二行'
    contentElement.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: '！' }))
    contentElement.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      inputType: 'insertText',
      data: '！',
    }))
    await nextTick()

    expect(wrapper.emitted('update:modelValue')).toContainEqual(['# 标题\n！第二行\n第三行'])
  })

  it('为 wikilink 源码添加 mark 样式', async () => {
    const wrapper = mount(MarkdownEditor, {
      attachTo: document.body,
      global: {
        plugins: [createTestingPinia({ createSpy: vi.fn })],
      },
      props: {
        modelValue: '关联 [[不存在的笔记]]',
      },
    })

    await nextTick()

    expect(wrapper.find('.cm-wikilink--unresolved').text()).toBe('[[不存在的笔记]]')
  })
})

