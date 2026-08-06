import { describe, it, expect } from 'vitest'
import {
  generateReferenceId,
  getReferencesDir,
  getReferenceMetaPath,
  getReferenceFilePath,
  detectReferenceType,
  sanitizeFileName,
  serializeReferenceMeta,
  parseReferenceMeta,
} from './reference-serializer'
import type { ReferenceMeta } from '../types'

const baseMeta: ReferenceMeta = {
  id: 'ref-1',
  path: '/vault/references/ref-1.json',
  title: '费曼学习法',
  description: '一种学习方法',
  tags: ['学习方法'],
  fileType: 'md',
  fileName: 'feynman.md',
  filePath: '/vault/references/ref-1.md',
  created: '2026-01-01T00:00:00.000Z',
  updated: '2026-01-01T00:00:00.000Z',
}

/** 构造一个仅含必需字段、不含可选/兜底字段的元数据 */
function minimalMeta(): Partial<ReferenceMeta> {
  return {
    id: 'ref-1',
    path: '/vault/references/ref-1.json',
    fileName: 'feynman.md',
    filePath: '/vault/references/ref-1.md',
    created: '2026-01-01T00:00:00.000Z',
    updated: '2026-01-01T00:00:00.000Z',
  }
}

describe('generateReferenceId', () => {
  it('多次调用不重复', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => generateReferenceId()))
    expect(ids.size).toBe(1000)
  })

  it('返回非空字符串', () => {
    expect(generateReferenceId()).toBeTruthy()
  })
})

describe('detectReferenceType', () => {
  it('识别 md/pdf/png 扩展名', () => {
    expect(detectReferenceType('note.md')).toBe('md')
    expect(detectReferenceType('paper.pdf')).toBe('pdf')
    expect(detectReferenceType('image.png')).toBe('png')
  })

  it('识别大写扩展名（大小写不敏感）', () => {
    expect(detectReferenceType('NOTE.MD')).toBe('md')
    expect(detectReferenceType('Paper.PDF')).toBe('pdf')
    expect(detectReferenceType('Image.PNG')).toBe('png')
  })

  it('非法类型返回 null', () => {
    expect(detectReferenceType('file.txt')).toBeNull()
    expect(detectReferenceType('noext')).toBeNull()
    expect(detectReferenceType('archive.zip')).toBeNull()
  })
})

describe('serializeReferenceMeta / parseReferenceMeta', () => {
  it('序列化与解析往返一致', () => {
    const json = serializeReferenceMeta(baseMeta)
    const parsed = parseReferenceMeta(json)
    expect(parsed).toEqual(baseMeta)
  })

  it('序列化输出为带缩进的 JSON', () => {
    const json = serializeReferenceMeta(baseMeta)
    expect(json).toContain('\n  "title": "费曼学习法"')
    expect(() => JSON.parse(json)).not.toThrow()
  })

  it('缺失 title 时兜底为默认值', () => {
    const parsed = parseReferenceMeta(JSON.stringify({ ...minimalMeta(), fileType: 'md', tags: [] }))
    expect(parsed.title).toBe('未命名参考资料')
  })

  it('空白 title 兜底为默认值', () => {
    const parsed = parseReferenceMeta(JSON.stringify({ ...baseMeta, title: '   ' }))
    expect(parsed.title).toBe('未命名参考资料')
  })

  it('缺失 tags 时兜底为空数组', () => {
    const parsed = parseReferenceMeta(JSON.stringify({ ...minimalMeta(), fileType: 'md', title: 'x' }))
    expect(parsed.tags).toEqual([])
  })

  it('tags 中的非字符串元素被过滤', () => {
    const parsed = parseReferenceMeta(JSON.stringify({ ...baseMeta, tags: ['a', 1, null] }))
    expect(parsed.tags).toEqual(['a'])
  })

  it('非法 fileType 抛错', () => {
    expect(() => parseReferenceMeta(JSON.stringify({ ...baseMeta, fileType: 'exe' }))).toThrow(/fileType/)
  })

  it('缺失 fileType 抛错', () => {
    expect(() => parseReferenceMeta(JSON.stringify({ ...minimalMeta(), title: 'x', tags: [] }))).toThrow(/fileType/)
  })
})

describe('sanitizeFileName', () => {
  it('移除 Windows 不允许的字符并保留扩展名', () => {
    expect(sanitizeFileName('test:file?.md')).toBe('testfile.md')
    expect(sanitizeFileName('a*b?c"d<e>f|g.pdf')).toBe('abcdefg.pdf')
    expect(sanitizeFileName('path\\file/name.png')).toBe('pathfilename.png')
  })

  it('空格替换为下划线并保留扩展名', () => {
    expect(sanitizeFileName('my note title.pdf')).toBe('my_note_title.pdf')
  })

  it('清理后为空时兜底为 untitled 并保留扩展名', () => {
    expect(sanitizeFileName(':::?.md')).toBe('untitled.md')
  })

  it('保留正常字符', () => {
    expect(sanitizeFileName('费曼学习法.pdf')).toBe('费曼学习法.pdf')
  })
})

describe('路径拼接', () => {
  const vaultPath = '/data/vault'

  it('getReferencesDir 正确拼接', () => {
    expect(getReferencesDir(vaultPath)).toBe('/data/vault/references')
  })

  it('getReferenceMetaPath 正确拼接', () => {
    expect(getReferenceMetaPath(vaultPath, 'ref-abc')).toBe('/data/vault/references/ref-abc.json')
  })

  it('getReferenceFilePath 正确拼接', () => {
    expect(getReferenceFilePath(vaultPath, 'ref-abc', 'pdf')).toBe('/data/vault/references/ref-abc.pdf')
  })
})
