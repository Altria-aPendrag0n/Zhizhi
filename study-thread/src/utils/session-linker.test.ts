import { describe, expect, it } from 'vitest'
import { extractNoteRefsFromSession } from './session-linker'

describe('extractNoteRefsFromSession', () => {
  it('解析笔记/分支引用及划线文本', () => {
    const content = `## 知枝
回答内容
> 已生成笔记: [[notes/a.md|笔记A]] 划线「划线文本A」
> 已生成分支: [[branch_1|分支追问]] 划线「划线文本B」

## 用户
问题`
    const refs = extractNoteRefsFromSession(content)
    expect(refs).toEqual([
      { path: 'notes/a.md', title: '笔记A', messageIndex: 0, kind: 'note', highlight: '划线文本A' },
      { path: 'branch_1', title: '分支追问', messageIndex: 0, kind: 'branch', highlight: '划线文本B' },
    ])
  })

  it('向后兼容无划线文本的旧引用', () => {
    const content = `## 知枝
回答
> 已生成笔记: [[notes/a.md|笔记A]]`
    const refs = extractNoteRefsFromSession(content)
    expect(refs[0]).toEqual({ path: 'notes/a.md', title: '笔记A', messageIndex: 0, kind: 'note' })
  })

  it('引用归属正确的消息索引', () => {
    const content = `## 用户
Q1

## 知枝
A1
> 已生成笔记: [[notes/a.md|A]]

## 用户
Q2`
    const refs = extractNoteRefsFromSession(content)
    expect(refs).toHaveLength(1)
    expect(refs[0].messageIndex).toBe(1)
  })
})
