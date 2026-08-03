import { describe, expect, it } from 'vitest'
import { resolveMessageIndex } from './message-locator'
import type { Message } from '../types'

// 第 2 条消息渲染后视觉文本为「工作记忆的容量通常认为 4±1 个组块。分块策略：将信息组织成有意义的组块。」
// 与 markdown 源文本（加粗、列表标记、换行）不一致，文本匹配会失败。
const messages: Message[] = [
  { role: 'user', content: '什么是工作记忆？' },
  {
    role: 'assistant',
    content: '工作记忆的容量通常认为 **4±1 个组块**。\n1. **分块策略**：将信息组织成有意义的组块。',
  },
  { role: 'user', content: '那学习策略呢？' },
  { role: 'assistant', content: '最终回答' },
]

describe('resolveMessageIndex', () => {
  it('优先使用 DOM 消息索引', () => {
    expect(resolveMessageIndex('任意文本', messages, 3)).toBe(3)
  })

  it('DOM 索引为 null 时回退到文本匹配', () => {
    expect(resolveMessageIndex('最终回答', messages, null)).toBe(3)
  })

  it('DOM 索引非法（负数/非整数/越界）时回退到文本匹配', () => {
    expect(resolveMessageIndex('最终回答', messages, -1)).toBe(3)
    expect(resolveMessageIndex('最终回答', messages, 1.5)).toBe(3)
    expect(resolveMessageIndex('最终回答', messages, 99)).toBe(3)
  })

  it('DOM 索引为 0（第一条消息）时视为合法索引', () => {
    expect(resolveMessageIndex('任意文本', messages, 0)).toBe(0)
  })

  it('渲染后视觉文本与 markdown 源不一致时，仅 DOM 索引能定位（bug 根因场景）', () => {
    const visibleText = '分块策略：将信息组织成有意义的组块'
    // 源文本是「1. **分块策略**：…」，视觉文本不是源文本子串 → 文本匹配失败
    expect(resolveMessageIndex(visibleText, messages, null)).toBe(-1)
    // DOM 索引直接命中
    expect(resolveMessageIndex(visibleText, messages, 1)).toBe(1)
  })

  it('文本回退从后往前匹配，命中最后一条包含划线文本的消息', () => {
    expect(resolveMessageIndex('学习策略', messages, null)).toBe(2)
  })

  it('role 过滤只作用于文本回退，不影响 DOM 索引', () => {
    expect(resolveMessageIndex('组块', messages, null, 'assistant')).toBe(1)
    expect(resolveMessageIndex('组块', messages, null, 'user')).toBe(-1)
    expect(resolveMessageIndex('最终回答', messages, 1, 'assistant')).toBe(1)
  })

  it('全部失败时返回 -1', () => {
    expect(resolveMessageIndex('不存在的文本', messages, null)).toBe(-1)
    expect(resolveMessageIndex('不存在的文本', messages, 42)).toBe(-1)
  })
})
