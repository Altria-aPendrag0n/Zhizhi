import { describe, it, expect } from 'vitest'
import * as yaml from 'js-yaml'
import {
  serializeNote,
  generateNoteFileName,
  getNoteMetaPath,
  serializeNoteMeta,
  parseNoteMetaFile,
} from './note-serializer'
import { parseFrontmatter } from '../parser/frontmatter'
import type { ExtractedNote, NoteMeta } from '../types'

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
    // 所有字符串字段经 JSON.stringify 序列化（带引号），多行文本转义为 \n
    expect(result).toContain('title: "费曼学习法"')
    expect(result).toContain('description: "用教别人来检验自己是否真正理解"')
    expect(result).toContain('type: method')
    expect(result).toContain('  - "学习方法"')
    expect(result).toContain('  - "费曼"')
    expect(result).toContain('confidence: 0.9')
  })

  it('标签用 JSON 字符串序列化，含 YAML 特殊字符（冒号/井号）仍可 round-trip 解析', () => {
    const specialNote: ExtractedNote = { ...note, tags: ['算法: 基础', '#重点', '记忆#1'] }
    const result = serializeNote(specialNote, 'sessions/test/main.md', '')

    // 特殊字符标签以 JSON 字符串形式写入，避免被解析成对象/注释
    expect(result).toContain('  - "算法: 基础"')

    // frontmatter 经 YAML 解析后标签完整保留
    const frontmatter = result.split('---')[1]
    const parsed = yaml.load(frontmatter) as Record<string, unknown>
    expect(parsed.tags).toEqual(['算法: 基础', '#重点', '记忆#1'])
  })

  it('处理描述中的引号', () => {
    const quotedNote: ExtractedNote = { ...note, description: '他说"保持好奇"' }
    const result = serializeNote(quotedNote, 'sessions/test/main.md', '')
    expect(result).toContain('description: "他说\\"保持好奇\\""')
  })

  it('序列化笔记包含来源信息', () => {
    const result = serializeNote(note, 'sessions/test/main.md', '划线文本')
    expect(result).toContain('source:')
    expect(result).toContain('session: "sessions/test/main.md"')
  })

  it('多行划线文本（表格摘录）换行被转义，round-trip 后 tags 完整保留', () => {
    const multiLineNote: ExtractedNote = { ...note, tags: ['表格', '知识'] }
    const highlight = '| 种类 | 特点 |\n| 草虾 | 口感弹牙 |\n| 明虾 | 肉质紧实 |'
    const result = serializeNote(multiLineNote, 'sessions/test/main.md', highlight)

    // 换行被转义为 \n，不破坏 YAML frontmatter
    expect(result).toContain('highlight: "| 种类 | 特点 |\\n| 草虾 | 口感弹牙 |\\n| 明虾 | 肉质紧实 |"')

    // 完整 round-trip：写出的 md 重新解析，tags 等关键字段不丢失
    const { meta, body } = parseFrontmatter(result)
    expect(meta.tags).toEqual(['表格', '知识'])
    expect(meta.title).toBe('费曼学习法')
    expect(meta.source).toMatchObject({
      session: 'sessions/test/main.md',
      highlight,
    })
    expect(body).toContain('| 草虾 | 口感弹牙 |')
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

  it('传入 body 时正文使用 body，frontmatter 的 source.highlight 仍写划线原文（图片转笔记场景）', () => {
    const body = '## 主要观点\n\n- 观点一\n\n| 列A | 列B |\n| --- | --- |\n| 1 | 2 |'
    const result = serializeNote(note, 'sessions/test/main.md', '划线原文', body)

    // frontmatter 溯源保留划线原文
    expect(result).toContain('highlight: "划线原文"')
    // 正文使用 body（含表格）
    expect(result).toContain('## 主要观点')
    expect(result).toContain('| 1 | 2 |')
    // round-trip：正文与元信息完整保留
    const { meta, body: parsedBody } = parseFrontmatter(result)
    expect(meta.title).toBe('费曼学习法')
    expect(meta.source).toMatchObject({ session: 'sessions/test/main.md', highlight: '划线原文' })
    expect(parsedBody).toContain('| 1 | 2 |')
  })

  it('缺省 body 时正文仍为划线原文（行为不变）', () => {
    const result = serializeNote(note, 'sessions/test/main.md', '划线原文')
    expect(result).toContain('# 费曼学习法')
    expect(result).toContain('划线原文')
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

describe('json sidecar', () => {
  const meta: NoteMeta = {
    path: '/vault/notes/费曼学习法.md',
    title: '费曼学习法',
    description: '用教别人来检验自己是否真正理解',
    type: 'method',
    tags: ['学习方法', '费曼'],
    created: '2026-08-01T10:00:00.000Z',
    updated: '2026-08-01T10:00:00.000Z',
    proposition: '用教别人的方式来检验自己是否真正理解',
    source: {
      session: 'sessions/test/main.md',
      highlight: '| 种类 | 特点 |\n| 草虾 | 口感弹牙 |',
    },
  }

  it('getNoteMetaPath 将 .md 替换为 .json', () => {
    expect(getNoteMetaPath('/vault/notes/费曼学习法.md')).toBe('/vault/notes/费曼学习法.json')
    expect(getNoteMetaPath('/vault/notes/abc.MD')).toBe('/vault/notes/abc.json')
  })

  it('serializeNoteMeta / parseNoteMetaFile round-trip 完整保留结构化信息', () => {
    const links = ['/vault/notes/虾类大全.md', '/vault/notes/烹饪技巧.md']
    const content = serializeNoteMeta(meta, links)
    const parsed = parseNoteMetaFile(content)

    expect(parsed).not.toBeNull()
    expect(parsed).toMatchObject({
      title: '费曼学习法',
      type: 'method',
      tags: ['学习方法', '费曼'],
      links,
    })
    expect(parsed!.source).toEqual(meta.source)
    expect(parsed!.created).toBe('2026-08-01T10:00:00.000Z')
  })

  it('多行 highlight 在 json sidecar 中保留原样（换行不丢失）', () => {
    const parsed = parseNoteMetaFile(serializeNoteMeta(meta))
    expect(parsed!.source!.highlight).toBe('| 种类 | 特点 |\n| 草虾 | 口感弹牙 |')
  })

  it('parseNoteMetaFile 对无效 json 返回 null', () => {
    expect(parseNoteMetaFile('not-json{{{')).toBeNull()
    expect(parseNoteMetaFile('{"tags": "not-array"}')).toBeNull()
  })
})