import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ChatMessage from './ChatMessage.vue'
import type { Message } from '../../types'

describe('ChatMessage', () => {
  it('渲染用户消息', () => {
    const message: Message = { role: 'user', content: '你好，世界' }
    const wrapper = mount(ChatMessage, { props: { message } })
    expect(wrapper.find('.chat-message--user').exists()).toBe(true)
    expect(wrapper.text()).toContain('你好，世界')
  })

  it('渲染 AI 消息（Markdown）', () => {
    const message: Message = { role: 'assistant', content: '**你好**，这是AI回复' }
    const wrapper = mount(ChatMessage, { props: { message } })
    expect(wrapper.find('.chat-message--assistant').exists()).toBe(true)
    expect(wrapper.find('.chat-message__label').text()).toBe('知枝 · 学习伴读')
    expect(wrapper.html()).toContain('<strong>你好</strong>')
  })

  it('渲染系统消息', () => {
    const message: Message = { role: 'system', content: '系统通知' }
    const wrapper = mount(ChatMessage, { props: { message } })
    expect(wrapper.find('.chat-message--system').exists()).toBe(true)
    expect(wrapper.text()).toContain('系统通知')
  })

  it('显示笔记生成数量', () => {
    const message: Message = { role: 'assistant', content: '内容' }
    const wrapper = mount(ChatMessage, { props: { message, noteCount: 3 } })
    expect(wrapper.find('.chat-message__source').text()).toContain('3')
  })

  it('不显示笔记数量当 noteCount 为 0', () => {
    const message: Message = { role: 'assistant', content: '内容' }
    const wrapper = mount(ChatMessage, { props: { message, noteCount: 0 } })
    expect(wrapper.find('.chat-message__source').exists()).toBe(false)
  })

  it('不显示笔记数量当未传递', () => {
    const message: Message = { role: 'assistant', content: '内容' }
    const wrapper = mount(ChatMessage, { props: { message } })
    expect(wrapper.find('.chat-message__source').exists()).toBe(false)
  })

  it('渲染 Markdown 代码块', () => {
    const message: Message = { role: 'assistant', content: '```js\nconsole.log("hello")\n```' }
    const wrapper = mount(ChatMessage, { props: { message } })
    expect(wrapper.html()).toContain('language-js')
    expect(wrapper.html()).toContain('console.log')
  })

  it('用户消息显示头像', () => {
    const message: Message = { role: 'user', content: 'hello' }
    const wrapper = mount(ChatMessage, { props: { message } })
    expect(wrapper.find('.chat-message__avatar--user').exists()).toBe(true)
  })

  it('AI 消息显示品牌标签', () => {
    const message: Message = { role: 'assistant', content: 'hello' }
    const wrapper = mount(ChatMessage, { props: { message } })
    expect(wrapper.find('.chat-message__avatar--ai').exists()).toBe(true)
  })
})