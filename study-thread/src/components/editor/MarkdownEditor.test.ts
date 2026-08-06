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

  it('表格块渲染为 <table> 而非字面 | 段落', async () => {
    const wrapper = mount(MarkdownEditor, {
      attachTo: document.body,
      global: {
        plugins: [createTestingPinia({ createSpy: vi.fn })],
      },
      props: {
        modelValue: '# 标题\n| 名称 | 说明 |\n| --- | --- |\n| 皮皮虾 | 口虾蛄 |',
      },
    })

    await nextTick()

    const tableWidget = wrapper.find('.cm-live-preview-table')
    expect(tableWidget.exists()).toBe(true)
    expect(tableWidget.findAll('table thead th')).toHaveLength(2)
    expect(tableWidget.find('table thead th').text()).toBe('名称')
    expect(tableWidget.findAll('table tbody td')).toHaveLength(2)
    expect(tableWidget.find('table tbody td').text()).toBe('皮皮虾')
    // 不出现字面 | 段落
    expect(wrapper.findAll('.cm-live-preview-line p')).toHaveLength(0)
  })

  it('表格单元格内的加粗与行内代码正常渲染', async () => {
    const wrapper = mount(MarkdownEditor, {
      attachTo: document.body,
      global: {
        plugins: [createTestingPinia({ createSpy: vi.fn })],
      },
      props: {
        modelValue: '开头\n| 俗名 | 学名 |\n| --- | --- |\n| **"濑尿虾"** | `O. oratoria` |',
      },
    })

    await nextTick()

    const tableWidget = wrapper.find('.cm-live-preview-table')
    const cells = tableWidget.findAll('table tbody td')
    expect(cells[0].find('strong').text()).toBe('"濑尿虾"')
    expect(cells[1].find('code').text()).toBe('O. oratoria')
  })

  it('光标落在表格内时整块保持源码可编辑（不渲染预览）', async () => {
    const wrapper = mount(MarkdownEditor, {
      attachTo: document.body,
      global: {
        plugins: [createTestingPinia({ createSpy: vi.fn })],
      },
      props: {
        modelValue: '| a | b |\n| --- | --- |\n| 1 | 2 |',
      },
    })

    await nextTick()

    // 初始光标在第 1 行（表头行，属于表格块）→ 整块不渲染预览
    expect(wrapper.find('.cm-live-preview-table').exists()).toBe(false)
    const sourceLines = wrapper.findAll('.cm-line')
    expect(sourceLines.map((line) => line.text())).toEqual(['| a | b |', '| --- | --- |', '| 1 | 2 |'])
  })
})

