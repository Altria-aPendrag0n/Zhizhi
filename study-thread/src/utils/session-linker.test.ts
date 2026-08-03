import { describe, expect, it, vi, beforeEach } from 'vitest'
import { extractNoteRefsFromSession, removeSessionReferences } from './session-linker'

vi.mock('./vault-fs', () => ({
  readFile: vi.fn(),
  listDir: vi.fn(),
  writeFile: vi.fn(),
}))

import { listDir, readFile, writeFile } from './vault-fs'

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

describe('removeSessionReferences', () => {
  beforeEach(() => {
    vi.mocked(listDir).mockReset()
    vi.mocked(readFile).mockReset()
    vi.mocked(writeFile).mockReset()
  })

  it('删除笔记后从会话文件中移除对应引用行', async () => {
    vi.mocked(listDir).mockResolvedValue([
      { name: 'sess.md', path: '/vault/sessions/sess.md', is_dir: false },
      { name: 'branch-b1.md', path: '/vault/sessions/branch-b1.md', is_dir: false },
    ])
    vi.mocked(readFile)
      .mockResolvedValueOnce('## 知枝\n回答\n> 已生成笔记: [[/vault/notes/a.md|笔记A]] 划线「x」\n')
      .mockResolvedValueOnce('## 知枝\n回答\n> 已生成分支: [[branch_1|追问]] 划线「y」\n')
    await removeSessionReferences('/vault', ['/vault/notes/a.md'], 'note')
    expect(writeFile).toHaveBeenCalledTimes(1)
    expect(writeFile).toHaveBeenCalledWith('/vault/sessions/sess.md', '## 知枝\n回答\n')
  })

  it('删除分支后从会话文件中移除分支引用行', async () => {
    vi.mocked(listDir).mockResolvedValue([
      { name: 'sess.md', path: '/vault/sessions/sess.md', is_dir: false },
    ])
    vi.mocked(readFile).mockResolvedValue('## 知枝\n回答\n> 已生成分支: [[branch_1|追问]] 划线「y」\n')
    await removeSessionReferences('/vault', ['branch_1'], 'branch')
    expect(writeFile).toHaveBeenCalledWith('/vault/sessions/sess.md', '## 知枝\n回答\n')
  })

  it('目标列表为空时不做任何处理', async () => {
    await removeSessionReferences('/vault', [], 'branch')
    expect(listDir).not.toHaveBeenCalled()
  })

  it('会话文件不存在引用时不重写文件', async () => {
    vi.mocked(listDir).mockResolvedValue([
      { name: 'sess.md', path: '/vault/sessions/sess.md', is_dir: false },
    ])
    vi.mocked(readFile).mockResolvedValue('## 知枝\n回答\n')
    await removeSessionReferences('/vault', ['branch_1'], 'branch')
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('sessions 目录不存在时静默跳过', async () => {
    vi.mocked(listDir).mockRejectedValue(new Error('not found'))
    await expect(removeSessionReferences('/vault', ['branch_1'], 'branch')).resolves.toBeUndefined()
  })
})
