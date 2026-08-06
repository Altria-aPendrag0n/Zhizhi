import { describe, it, expect } from 'vitest'
import { serializeNote, generateNoteFileName } from './note-serializer'
import type { ExtractedNote } from '../types'

describe('serializeNote', () => {
  const note: ExtractedNote = {
    title: '费曼学习法',
    description: '用教别人来检验自己是否真正理解',
    proposition: '用教别人的方式来检验自己是否真正理解',
    explanation: '费曼学习法是一种通过向他人解释概念来加深理解的学习方法。',
    type: 'method',
    tags: ['学习方法', '费曼'],
    confidence: 0.9,
  }

  it('序列化笔记包含 frontmatter', () => {
    const result = serializeNote(note, 'sessions/test/main.md', '划线文本')
    expect(result).toContain('---')
    expect(result).toContain('title: 费曼学习法')
    expect(result).toContain('description: "用教别人来检验自己是否真正理解"')
    expect(result).toContain('type: method')
    expect(result).toContain('  - 学习方法')
    expect(result).toContain('  - 费曼')
    expect(result).toContain('confidence: 0.9')
  })

  it('处理描述中的引号', () => {
    const quotedNote: ExtractedNote = { ...note, description: '他说"保持好奇"' }
    const result = serializeNote(quotedNote, 'sessions/test/main.md', '')
    expect(result).toContain('description: "他说\\"保持好奇\\""')
  })

  it('序列化笔记包含来源信息', () => {
    const result = serializeNote(note, 'sessions/test/main.md', '划线文本')
    expect(result).toContain('source:')
    expect(result).toContain('session: sessions/test/main.md')
  })

  it('序列化笔记正文保存划线原文，不生成加工段落', () => {
    const result = serializeNote(note, 'sessions/test/main.md', '费曼学习法是一种通过向他人解释概念来加深理解的学习方法。')
    expect(result).toContain('# 费曼学习法')
    // 原文原样保存为正文
    expect(result).toContain('费曼学习法是一种通过向他人解释概念来加深理解的学习方法。')
    // 不再生成核心命题/解释等加工内容
    expect(result).not.toContain('## 核心命题')
    expect(result).not.toContain('## 解释')
    expect(result).not.toContain('## 关联笔记')
  })

  it('处理包含引号的划线文本', () => {
    const result = serializeNote(note, 'sessions/test/main.md', '他说"你好"')
    expect(result).toContain('highlight: "他说\\"你好\\""')
  })

  it('处理多种笔记类型', () => {
    const conceptNote: ExtractedNote = { ...note, type: 'concept' }
    const result = serializeNote(conceptNote, 'sessions/test/main.md', '')
    expect(result).toContain('type: concept')
  })
})

describe('generateNoteFileName', () => {
  it('生成正确的文件名', () => {
    expect(generateNoteFileName('费曼学习法')).toBe('费曼学习法.md')
  })

  it('移除 Windows 不允许的字符', () => {
    const name = generateNoteFileName('test:file?name')
    expect(name).not.toContain(':')
    expect(name).not.toContain('?')
    expect(name).toContain('.md')
  })

  it('空格替换为下划线', () => {
    const name = generateNoteFileName('my note title')
    expect(name).toBe('my_note_title.md')
  })
})