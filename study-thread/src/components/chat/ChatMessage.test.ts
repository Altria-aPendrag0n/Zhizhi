import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import mermaid from 'mermaid'
import ChatMessage from './ChatMessage.vue'
import type { Message } from '../../types'

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(),
  },
}))

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

  it('加粗文本含引号且后接中文时仍正确渲染为加粗（如 **"濑尿虾"**是…）', async () => {
    const message: Message = { role: 'assistant', content: '皮皮虾俗称**"濑尿虾"**是口虾蛄。' }
    const wrapper = mount(ChatMessage, { props: { message } })
    await nextTick()
    expect(wrapper.html()).toContain('<strong>濑尿虾</strong>')
    expect(wrapper.text()).not.toContain('**')
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

  it('渲染 mermaid 代码块为 SVG 流程图', async () => {
    vi.mocked(mermaid.render).mockResolvedValue({ svg: '<svg class="mermaid-svg"></svg>', diagramType: 'flowchart' })
    const message: Message = { role: 'assistant', content: '```mermaid\ngraph TD\nA-->B\n```' }
    const wrapper = mount(ChatMessage, { props: { message } })
    await flushPromises()
    expect(wrapper.find('.zhizhi-mermaid').exists()).toBe(true)
    expect(wrapper.find('.zhizhi-mermaid svg').exists()).toBe(true)
    expect(wrapper.find('pre code.language-mermaid').exists()).toBe(false)
  })

  it('用户消息显示头像', () => {
    const message: Message = { role: 'user', content: 'hello' }
    const wrapper = mount(ChatMessage, { props: { message } })
    expect(wrapper.find('.chat-message__avatar--user').exists()).toBe(true)
  })

  it('AI 消息显示品牌标签', () => {
    const message: Message = { role: 'assistant', content: 'hello' }
    const wrapper = mount(ChatMessage, { props: { message } })
    expect(wrapper.find('.chat-message__label').exists()).toBe(true)
    expect(wrapper.find('.chat-message__label').text()).toBe('知枝 · 学习伴读')
  })

  it('AI 消息带 thinking 时渲染思考块（默认折叠）', () => {
    const message: Message = { role: 'assistant', content: '回答内容', thinking: '思考过程内容' }
    const wrapper = mount(ChatMessage, { props: { message } })

    expect(wrapper.find('.thinking-block').exists()).toBe(true)
    expect(wrapper.find('.thinking-block__label').text()).toBe('思考过程')
    expect(wrapper.text()).toContain('思考过程内容')
    expect((wrapper.find('.thinking-block__content').element as HTMLElement).style.display).toBe('none')
  })

  it('AI 消息无 thinking 时不渲染思考块', () => {
    const message: Message = { role: 'assistant', content: '回答内容' }
    const wrapper = mount(ChatMessage, { props: { message } })
    expect(wrapper.find('.thinking-block').exists()).toBe(false)
  })

  it('划线标记（笔记）在原消息中渲染为虚线跳转链接', async () => {
    const message: Message = { role: 'assistant', content: '这里有一个划线词需要关注' }
    const wrapper = mount(ChatMessage, {
      props: {
        message,
        marks: [{ path: 'notes/测试.md', title: '测试笔记', messageIndex: 0, kind: 'note', highlight: '划线词' }],
      },
    })
    await nextTick()
    const mark = wrapper.find('a.zhizhi-mark[data-zhizhi-kind="note"]')
    expect(mark.exists()).toBe(true)
    expect(mark.attributes('data-zhizhi-id')).toBe(encodeURIComponent('notes/测试.md'))
    expect(mark.text()).toBe('划线词')
  })

  it('划线标记（分支）在原消息中渲染为分支跳转链接', async () => {
    const message: Message = { role: 'assistant', content: '深入讨论一下这个机制' }
    const wrapper = mount(ChatMessage, {
      props: {
        message,
        marks: [{ path: 'branch_123', title: '分支追问', messageIndex: 0, kind: 'branch', highlight: '这个机制' }],
      },
    })
    await nextTick()
    const mark = wrapper.find('a.zhizhi-mark[data-zhizhi-kind="branch"][data-zhizhi-id="branch_123"]')
    expect(mark.exists()).toBe(true)
    expect(mark.text()).toBe('这个机制')
  })

  it('划线文本含 markdown 特殊字符时标记仍渲染不消失', async () => {
    const message: Message = { role: 'assistant', content: '计算 a*b 与 [x] 的结果' }
    const wrapper = mount(ChatMessage, {
      props: {
        message,
        marks: [{ path: 'notes/a.md', title: '笔记A', messageIndex: 0, kind: 'note', highlight: 'a*b' }],
      },
    })
    await nextTick()
    const mark = wrapper.find('a.zhizhi-mark')
    expect(mark.exists()).toBe(true)
    expect(mark.text()).toBe('a*b')
  })

  it('划线文本位于加粗内时仍正确包裹且保留加粗', async () => {
    const message: Message = { role: 'assistant', content: '重点在于 **虾蛄并不是真正的虾** 这句话' }
    const wrapper = mount(ChatMessage, {
      props: {
        message,
        marks: [{ path: 'branch_1', title: '分支', messageIndex: 0, kind: 'branch', highlight: '虾蛄并不是真正的虾' }],
      },
    })
    await nextTick()
    const mark = wrapper.find('a.zhizhi-mark')
    expect(mark.exists()).toBe(true)
    expect(mark.text()).toBe('虾蛄并不是真正的虾')
    // 加粗结构保留：mark 应位于 <strong> 内部
    expect(mark.element.parentElement?.tagName).toBe('STRONG')
    // 不出现字面 ** 残留
    expect(wrapper.text()).not.toContain('**')
  })

  it('划线文本位于斜体内时仍正确包裹', async () => {
    const message: Message = { role: 'assistant', content: '这里是 *斜体划线文本* 示例' }
    const wrapper = mount(ChatMessage, {
      props: {
        message,
        marks: [{ path: 'notes/a.md', title: '笔记A', messageIndex: 0, kind: 'note', highlight: '斜体划线文本' }],
      },
    })
    await nextTick()
    const mark = wrapper.find('a.zhizhi-mark')
    expect(mark.exists()).toBe(true)
    expect(mark.text()).toBe('斜体划线文本')
    expect(mark.element.parentElement?.tagName).toBe('EM')
    expect(wrapper.text()).not.toContain('*')
  })

  it('划线文本跨加粗边界时仍正确包裹（如划选 ——**"富贵虾"** 的视觉范围）', async () => {
    const message: Message = { role: 'assistant', content: '取了个讨喜的名字——**"富贵虾"**，听起来不错' }
    const wrapper = mount(ChatMessage, {
      props: {
        message,
        marks: [{ path: 'branch_2', title: '分支追问', messageIndex: 0, kind: 'branch', highlight: '——"富贵虾"' }],
      },
    })
    await nextTick()
    const mark = wrapper.find('a.zhizhi-mark')
    expect(mark.exists()).toBe(true)
    expect(mark.text()).toBe('——"富贵虾"')
  })

  it('划线文本跨标记（如加粗边界）时也能匹配并包裹', async () => {
    const message: Message = { role: 'assistant', content: '包含 **加粗标记** 的句子' }
    const wrapper = mount(ChatMessage, {
      props: {
        message,
        marks: [{ path: 'notes/a.md', title: '笔记A', messageIndex: 0, kind: 'note', highlight: '标记 的句子' }],
      },
    })
    await nextTick()
    const mark = wrapper.find('a.zhizhi-mark')
    expect(mark.exists()).toBe(true)
    expect(mark.text()).toBe('标记 的句子')
  })

  it('同一文本出现多次时按 occurrence 定位到用户实际划的位置（第 2 处）', async () => {
    const message: Message = { role: 'assistant', content: '根据爱因斯坦的 **E = mc²**，它变成能量。\n\n还有 **E = mc² 具体怎么算** 这个方向。' }
    const wrapper = mount(ChatMessage, {
      props: {
        message,
        marks: [{ path: 'notes/a.md', title: '质能方程', messageIndex: 0, kind: 'note', highlight: 'E = mc²', occurrence: 2 }],
      },
    })
    await nextTick()
    const mark = wrapper.find('a.zhizhi-mark[data-zhizhi-kind="note"]')
    expect(mark.exists()).toBe(true)
    // 第 2 处位于「具体怎么算」之前（第二次出现的段落内）
    const markParent = mark.element.parentElement
    expect(markParent?.textContent).toContain('E = mc² 具体怎么算')
  })

  it('无划线文本的旧引用不注入链接', async () => {
    const message: Message = { role: 'assistant', content: '普通内容' }
    const wrapper = mount(ChatMessage, {
      props: {
        message,
        marks: [{ path: 'notes/a.md', title: '笔记A', messageIndex: 0, kind: 'note' }],
      },
    })
    await nextTick()
    expect(wrapper.html()).not.toContain('zhizhi-mark')
  })

  it('点击划线链接时发出 navigate-link 事件（笔记）', async () => {
    const message: Message = { role: 'assistant', content: '点击笔记划线处' }
    const wrapper = mount(ChatMessage, {
      props: {
        message,
        marks: [{ path: 'notes/a.md', title: '笔记A', messageIndex: 0, kind: 'note', highlight: '笔记划线处' }],
      },
    })
    await nextTick()
    await wrapper.find('a.zhizhi-mark[data-zhizhi-kind="note"]').trigger('click')
    expect(wrapper.emitted('navigate-link')?.[0]).toEqual([{ kind: 'note', id: 'notes/a.md' }])
  })

  it('点击划线链接时发出 navigate-link 事件（分支）', async () => {
    const message: Message = { role: 'assistant', content: '点击分支划线处' }
    const wrapper = mount(ChatMessage, {
      props: {
        message,
        marks: [{ path: 'branch_9', title: '分支', messageIndex: 0, kind: 'branch', highlight: '分支划线处' }],
      },
    })
    await nextTick()
    await wrapper.find('a.zhizhi-mark[data-zhizhi-kind="branch"]').trigger('click')
    expect(wrapper.emitted('navigate-link')?.[0]).toEqual([{ kind: 'branch', id: 'branch_9' }])
  })
})