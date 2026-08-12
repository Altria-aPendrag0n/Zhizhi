import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ChatView from './ChatView.vue'
import type { Message } from '../../types'

const baseProps = {
  messages: [] as Message[],
  isStreaming: false,
  streamingText: '',
  error: null,
}

function createWrapper(props: Record<string, unknown> = {}) {
  return mount(ChatView, {
    props: { ...baseProps, ...props },
    global: {
      stubs: {
        ChatMessage: {
          name: 'ChatMessage',
          // 模拟真实 ChatMessage 中 assistant 正文的 data-highlightable 容器
          template: '<div data-highlightable="true"><p>可划线内容</p></div>',
        },
        StreamText: true,
        ThinkingBlock: true,
        HighlightMenu: { name: 'HighlightMenu', props: ['visible'], template: '<div />' },
      },
    },
  })
}

/** 在指定元素上建立真实选区，模拟用户拖选文本后的鼠标抬起 */
function selectTextIn(el: Element) {
  const selection = window.getSelection()!
  const range = document.createRange()
  range.selectNodeContents(el)
  selection.removeAllRanges()
  selection.addRange(range)
}

describe('ChatView 文本选区行为', () => {
  it('在不可划线区域（空状态/用户消息/思考过程）选中文本后不清除选区，保持可复制', async () => {
    const wrapper = createWrapper()
    const selection = window.getSelection()!
    const removeAllRangesSpy = vi.spyOn(selection, 'removeAllRanges')

    // 空状态标题属于不可划线区域：选中后仅收起菜单，不调用 removeAllRanges
    const titleEl = wrapper.find('.chat-view__hero-title').element
    selectTextIn(titleEl)
    removeAllRangesSpy.mockClear()
    await wrapper.find('.chat-view').trigger('mouseup')

    expect(removeAllRangesSpy).not.toHaveBeenCalled()
    expect(wrapper.findComponent({ name: 'HighlightMenu' }).props('visible')).toBe(false)
  })

  it('在可划线区域（assistant 回答正文）选中文本时仍正常弹出划线菜单', async () => {
    const wrapper = createWrapper({
      messages: [{ role: 'assistant', content: '回答内容' }],
    })
    const selection = window.getSelection()!
    const removeAllRangesSpy = vi.spyOn(selection, 'removeAllRanges')

    const highlightableEl = wrapper.find('[data-highlightable="true"]').element
    selectTextIn(highlightableEl)
    removeAllRangesSpy.mockClear()
    await wrapper.find('.chat-view').trigger('mouseup')

    // 菜单弹出（划线摘录等既有功能不受影响）
    expect(removeAllRangesSpy).not.toHaveBeenCalled()
    expect(wrapper.findComponent({ name: 'HighlightMenu' }).props('visible')).toBe(true)
  })
})
