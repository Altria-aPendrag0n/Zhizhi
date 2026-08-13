import { describe, it, expect, vi, beforeEach } from 'vitest'

const { readFile } = vi.hoisted(() => ({ readFile: vi.fn() }))
vi.mock('../../utils/vault-fs', () => ({ readFile }))

import { executeReadReference, formatRangeResult, formatPageResult, splitPdfPages, READ_REFERENCE_DEFAULT_LIMIT, READ_REFERENCE_MAX_CHARS } from './read-reference'

const VAULT = '/vault'

function metaJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: 'ref-1',
    path: '/vault/references/ref-1/ref-1.json',
    title: '参考资料标题',
    description: '参考资料描述',
    tags: ['标签甲'],
    fileType: 'md',
    fileName: 'ref.md',
    filePath: '/vault/references/ref-1/ref-1.md',
    created: '',
    updated: '',
    ...overrides,
  })
}

describe('read_reference 工具', () => {
  beforeEach(() => {
    readFile.mockReset()
  })

  it('按 reference_id 解析路径并分页读取，返回带边界提示的内容', async () => {
    const lines = Array.from({ length: 30 }, (_, i) => `第 ${i + 1} 行内容`)
    readFile.mockImplementation(async (p: string) => {
      if (p === '/vault/references/ref-1/ref-1.json') return metaJson()
      if (p === '/vault/references/ref-1/ref-1.md') return lines.join('\n')
      return ''
    })

    const result = await executeReadReference({ reference_id: 'ref-1', offset: 10, limit: 5 }, { vaultPath: VAULT })

    expect(result).toContain('Showing lines 11-15 of 30 total lines')
    expect(result).toContain('第 11 行内容')
    expect(result).toContain('第 15 行内容')
    expect(result).not.toContain('第 16 行内容')
  })

  it('默认 limit 为 READ_REFERENCE_DEFAULT_LIMIT，不带 offset 从第 1 行开始', async () => {
    readFile.mockImplementation(async (p: string) => {
      if (p === '/vault/references/ref-1/ref-1.json') return metaJson()
      if (p === '/vault/references/ref-1/ref-1.md') return Array.from({ length: 2000 }, () => '行').join('\n')
      return ''
    })

    const result = await executeReadReference({ reference_id: 'ref-1' }, { vaultPath: VAULT })

    expect(result).toContain(`Showing lines 1-${Math.min(READ_REFERENCE_DEFAULT_LIMIT, 2000)} of 2000 total lines`)
  })

  it('单页超过字符上限时截断并提示可继续读取', async () => {
    readFile.mockImplementation(async (p: string) => {
      if (p === '/vault/references/ref-1/ref-1.json') return metaJson()
      // 每行超长，第一行就超过字符上限
      if (p === '/vault/references/ref-1/ref-1.md') return `长${'字'.repeat(READ_REFERENCE_MAX_CHARS + 100)}`
      return ''
    })

    const result = await executeReadReference({ reference_id: 'ref-1' }, { vaultPath: VAULT })

    expect(result).toContain('已截断，请使用 offset 继续读取')
    expect(result.length).toBeLessThan(READ_REFERENCE_MAX_CHARS + 500)
  })

  it('pdf/png 参考资料返回无法读取文本的说明', async () => {
    readFile.mockImplementation(async (p: string) => {
      if (p === '/vault/references/ref-1/ref-1.json') {
        return metaJson({ fileType: 'png', fileName: 'ref.png', filePath: '/vault/references/ref-1/ref-1.png' })
      }
      return ''
    })

    const result = await executeReadReference({ reference_id: 'ref-1' }, { vaultPath: VAULT })

    expect(result).toContain('png 文件，无法读取文本内容')
  })

  it('未知 reference_id 返回错误说明', async () => {
    readFile.mockRejectedValue(new Error('not found'))
    const result = await executeReadReference({ reference_id: '不存在' }, { vaultPath: VAULT })
    expect(result).toContain('无法找到参考资料')
  })

  it('formatRangeResult 格式化为 Showing lines 提示', () => {
    const text = formatRangeResult(['a', 'b'], 2, 10, 40, false)
    expect(text).toBe('Showing lines 3-4 of 10 total lines (约 40 字).\n\n---\n\na\nb')
  })

  it('splitPdfPages 按页边界标记切分并忽略空白页', () => {
    const markdown = [
      '<!-- page: 1 -->',
      '第一页内容',
      '',
      '<!-- page: 2 -->',
      '第二页内容',
      '<!-- page: 3 -->',
      '',
      '<!-- page: 4 -->',
      '第四页内容',
      '',
    ].join('\n')

    const pages = splitPdfPages(markdown)

    expect(pages).toEqual(['第一页内容', '第二页内容', '第四页内容'])
  })

  it('formatPageResult 输出 Showing pages 提示', () => {
    const text = formatPageResult(['第一页', '第二页'], 0, 5, false)
    expect(text).toBe('Showing pages 1-2 of 5 total pages.\n\n---\n\n第一页\n\n第二页')
  })

  it('pdf 参考资料按页读取提取产物内容', async () => {
    readFile.mockImplementation(async (p: string) => {
      if (p === '/vault/references/ref-1/ref-1.json') {
        return metaJson({
          fileType: 'pdf',
          fileName: 'ref.pdf',
          filePath: '/vault/references/ref-1/ref-1.pdf',
          extractedPath: '/vault/references/ref-1/ref-1.extracted.md',
          parseStatus: 'parsed',
          pageCount: 3,
        })
      }
      if (p === '/vault/references/ref-1/ref-1.extracted.md') {
        return [
          '<!-- page: 1 -->',
          '第一页正文',
          '<!-- page: 2 -->',
          '第二页正文',
          '<!-- page: 3 -->',
          '第三页正文',
        ].join('\n')
      }
      return ''
    })

    const result = await executeReadReference({ reference_id: 'ref-1', offset: 1, limit: 1 }, { vaultPath: VAULT })

    expect(result).toContain('Showing pages 2-2 of 3 total pages.')
    expect(result).toContain('第二页正文')
    expect(result).not.toContain('第一页正文')
  })

  it('pdf 默认读第 1 页', async () => {
    readFile.mockImplementation(async (p: string) => {
      if (p === '/vault/references/ref-1/ref-1.json') {
        return metaJson({
          fileType: 'pdf',
          fileName: 'ref.pdf',
          filePath: '/vault/references/ref-1/ref-1.pdf',
          extractedPath: '/vault/references/ref-1/ref-1.extracted.md',
          parseStatus: 'parsed',
          pageCount: 2,
        })
      }
      if (p === '/vault/references/ref-1/ref-1.extracted.md') {
        return '<!-- page: 1 -->\n第一页正文\n<!-- page: 2 -->\n第二页正文'
      }
      return ''
    })

    const result = await executeReadReference({ reference_id: 'ref-1' }, { vaultPath: VAULT })

    expect(result).toContain('Showing pages 1-1 of 2 total pages.')
    expect(result).toContain('第一页正文')
    expect(result).not.toContain('第二页正文')
  })

  it('pdf 尚未完成解析时返回说明', async () => {
    readFile.mockImplementation(async (p: string) => {
      if (p === '/vault/references/ref-1/ref-1.json') {
        return metaJson({ fileType: 'pdf', fileName: 'ref.pdf', filePath: '/vault/references/ref-1/ref-1.pdf', parseStatus: 'parsing' })
      }
      return ''
    })

    const result = await executeReadReference({ reference_id: 'ref-1' }, { vaultPath: VAULT })

    expect(result).toContain('尚未完成解析')
    expect(result).toContain('parsing')
  })

  it('pdf 解析失败时返回失败原因', async () => {
    readFile.mockImplementation(async (p: string) => {
      if (p === '/vault/references/ref-1/ref-1.json') {
        return metaJson({
          fileType: 'pdf',
          fileName: 'ref.pdf',
          filePath: '/vault/references/ref-1/ref-1.pdf',
          parseStatus: 'failed',
          parseError: '扫描件无文本层',
        })
      }
      return ''
    })

    const result = await executeReadReference({ reference_id: 'ref-1' }, { vaultPath: VAULT })

    expect(result).toContain('解析失败')
    expect(result).toContain('扫描件无文本层')
  })
})
