import { describe, it, expect, vi, beforeEach } from 'vitest'

const { readFile } = vi.hoisted(() => ({ readFile: vi.fn() }))
vi.mock('../../utils/vault-fs', () => ({ readFile }))

import { executeReadReference, formatRangeResult, READ_REFERENCE_DEFAULT_LIMIT, READ_REFERENCE_MAX_CHARS } from './read-reference'

const VAULT = '/vault'

function metaJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: 'ref-1',
    path: '/vault/references/ref-1.json',
    title: '参考资料标题',
    description: '参考资料描述',
    tags: ['标签甲'],
    fileType: 'md',
    fileName: 'ref.md',
    filePath: '/vault/references/ref-1.md',
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
      if (p === '/vault/references/ref-1.json') return metaJson()
      if (p === '/vault/references/ref-1.md') return lines.join('\n')
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
      if (p === '/vault/references/ref-1.json') return metaJson()
      if (p === '/vault/references/ref-1.md') return Array.from({ length: 2000 }, () => '行').join('\n')
      return ''
    })

    const result = await executeReadReference({ reference_id: 'ref-1' }, { vaultPath: VAULT })

    expect(result).toContain(`Showing lines 1-${Math.min(READ_REFERENCE_DEFAULT_LIMIT, 2000)} of 2000 total lines`)
  })

  it('单页超过字符上限时截断并提示可继续读取', async () => {
    readFile.mockImplementation(async (p: string) => {
      if (p === '/vault/references/ref-1.json') return metaJson()
      // 每行超长，第一行就超过字符上限
      if (p === '/vault/references/ref-1.md') return `长${'字'.repeat(READ_REFERENCE_MAX_CHARS + 100)}`
      return ''
    })

    const result = await executeReadReference({ reference_id: 'ref-1' }, { vaultPath: VAULT })

    expect(result).toContain('已截断，请使用 offset 继续读取')
    expect(result.length).toBeLessThan(READ_REFERENCE_MAX_CHARS + 500)
  })

  it('pdf/png 参考资料返回无法读取文本的说明', async () => {
    readFile.mockImplementation(async (p: string) => {
      if (p === '/vault/references/ref-1.json') {
        return metaJson({ fileType: 'png', fileName: 'ref.png', filePath: '/vault/references/ref-1.png' })
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
})
