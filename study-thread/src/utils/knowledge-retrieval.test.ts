import { describe, it, expect, vi, beforeEach } from 'vitest'

const { engine, indexer, readFile } = vi.hoisted(() => ({
  engine: { isReady: vi.fn(), embed: vi.fn() },
  indexer: { getAllEntries: vi.fn() },
  readFile: vi.fn(),
}))

vi.mock('../embedding/engine', () => ({
  getEmbeddingEngine: () => engine,
}))

vi.mock('../embedding/indexer', () => ({
  getNoteIndexer: () => indexer,
}))

vi.mock('../utils/vault-fs', () => ({ readFile }))

import {
  retrieveKnowledge,
  buildKnowledgeContext,
  retrieveKnowledgeContext,
  MAX_FULL_TEXT_LENGTH,
  MAX_TOTAL_TEXT_LENGTH,
  MAX_PREVIEW_LENGTH,
} from './knowledge-retrieval'

/** 构造带 frontmatter 的笔记内容 */
function noteContent(title: string, body: string): string {
  return `---\ntitle: ${title}\ntags: [a, b]\n---\n${body}`
}

/** 构造参考资料元数据 JSON */
function referenceMetaJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: 'ref-1',
    path: '/vault/references/ref-1.json',
    title: '参考资料标题',
    description: '参考资料描述',
    tags: ['标签甲', '标签乙'],
    fileType: 'md',
    fileName: 'ref.md',
    filePath: '/vault/references/ref-1.md',
    created: '',
    updated: '',
    ...overrides,
  })
}

describe('knowledge-retrieval', () => {
  beforeEach(() => {
    engine.isReady.mockReset().mockReturnValue(true)
    engine.embed.mockReset().mockResolvedValue([1, 0])
    indexer.getAllEntries.mockReset().mockReturnValue([])
    readFile.mockReset()
  })

  it('引擎未就绪时返回空数组，不发起嵌入', async () => {
    engine.isReady.mockReturnValue(false)
    indexer.getAllEntries.mockReturnValue([
      { path: '/vault/notes/a.md', vector: [0.9, 0.1], indexedAt: 0 },
    ])

    const result = await retrieveKnowledge('测试')

    expect(result).toEqual([])
    expect(engine.embed).not.toHaveBeenCalled()
  })

  it('无索引条目时返回空数组', async () => {
    const result = await retrieveKnowledge('测试')

    expect(result).toEqual([])
    expect(engine.embed).not.toHaveBeenCalled()
  })

  it('命中按相似度降序排序并截取 topK', async () => {
    indexer.getAllEntries.mockReturnValue([
      { path: '/vault/notes/low.md', vector: [0.1, 0.9], indexedAt: 0 },
      { path: '/vault/notes/high.md', vector: [0.9, 0.1], indexedAt: 0 },
      { path: '/vault/notes/mid.md', vector: [0.5, 0.5], indexedAt: 0 },
    ])
    readFile.mockImplementation(async (p: string) => {
      const name = p.split('/').pop()?.replace('.md', '') || 'unknown'
      return noteContent(name, '正文内容')
    })

    const result = await retrieveKnowledge('测试', 2)

    expect(result.map((h) => h.path)).toEqual(['/vault/notes/high.md', '/vault/notes/mid.md'])
  })

  it('reference(.json) 与 note 路径分类并组装 snippet 与 fullText', async () => {
    indexer.getAllEntries.mockReturnValue([
      { path: '/vault/references/ref-1.json', vector: [0.9, 0.1], indexedAt: 0 },
      { path: '/vault/notes/note-1.md', vector: [0.8, 0.2], indexedAt: 0 },
    ])
    readFile.mockImplementation(async (p: string) => {
      if (p === '/vault/references/ref-1.json') return referenceMetaJson()
      if (p === '/vault/references/ref-1.md') return '参考资料正文内容，用于检索的全文。'
      if (p === '/vault/notes/note-1.md') return noteContent('笔记标题', '笔记正文内容，用于测试。')
      return ''
    })

    const result = await retrieveKnowledge('测试', 4, { includeFullText: true })

    expect(result).toHaveLength(2)
    const ref = result.find((h) => h.kind === 'reference')
    const note = result.find((h) => h.kind === 'note')

    expect(ref?.path).toBe('/vault/references/ref-1.json')
    expect(ref?.title).toBe('参考资料标题')
    expect(ref?.snippet).toContain('参考资料标题')
    expect(ref?.snippet).toContain('参考资料描述')
    expect(ref?.snippet).toContain('标签甲 标签乙')
    expect(ref?.fullText).toBe('参考资料正文内容，用于检索的全文。')

    expect(note?.path).toBe('/vault/notes/note-1.md')
    expect(note?.title).toBe('笔记标题')
    expect(note?.snippet).toContain('笔记标题')
    expect(note?.snippet).toContain('笔记正文内容')
    expect(note?.snippet).not.toContain('---')
    expect(note?.fullText).toBe('笔记正文内容，用于测试。')
  })

  it('默认摘要模式：不注入全文，参考资料不读取正文', async () => {
    indexer.getAllEntries.mockReturnValue([
      { path: '/vault/references/ref-1.json', vector: [0.9, 0.1], indexedAt: 0 },
      { path: '/vault/notes/note-1.md', vector: [0.8, 0.2], indexedAt: 0 },
    ])
    readFile.mockImplementation(async (p: string) => {
      if (p === '/vault/references/ref-1.json') return referenceMetaJson()
      if (p === '/vault/references/ref-1.md') return '参考资料正文内容，用于检索的全文。'
      if (p === '/vault/notes/note-1.md') return noteContent('笔记标题', '笔记正文内容，用于测试。')
      return ''
    })

    const result = await retrieveKnowledge('测试')

    expect(result).toHaveLength(2)
    const ref = result.find((h) => h.kind === 'reference')
    const note = result.find((h) => h.kind === 'note')
    expect(ref?.fullText).toBeUndefined()
    expect(note?.fullText).toBeUndefined()
    expect(ref?.snippet).toContain('参考资料标题')
    expect(note?.snippet).toContain('笔记标题')
    // 摘要模式：注入正文预览（而非全文），供模型基于实际内容作答
    expect(ref?.preview).toContain('参考资料正文内容')
    expect(note?.preview).toContain('笔记正文内容')
    expect(readFile).toHaveBeenCalledWith('/vault/references/ref-1.md')
  })

  it('摘要模式：正文预览超过 MAX_PREVIEW_LENGTH 时被截断', async () => {
    indexer.getAllEntries.mockReturnValue([
      { path: '/vault/references/ref-1.json', vector: [0.9, 0.1], indexedAt: 0 },
    ])
    readFile.mockImplementation(async (p: string) => {
      if (p === '/vault/references/ref-1.json') return referenceMetaJson()
      if (p === '/vault/references/ref-1.md') return '前'.repeat(MAX_PREVIEW_LENGTH + 100)
      return ''
    })

    const result = await retrieveKnowledge('测试')

    expect(result[0].preview?.length).toBe(MAX_PREVIEW_LENGTH)
    expect(result[0].fullText).toBeUndefined()
  })

  it('摘要模式：多命中预览合计超过总预算时，低相似度命中降级为纯摘要', async () => {
    indexer.getAllEntries.mockReturnValue(
      Array.from({ length: 6 }, (_, i) => ({
        path: `/vault/references/ref-${i + 1}.json`,
        vector: [0.9 - i * 0.05, 0.1],
        indexedAt: 0,
      })),
    )
    readFile.mockImplementation(async (p: string) => {
      const id = p.match(/ref-(\d+)/)?.[1]
      if (p.endsWith('.json')) {
        return referenceMetaJson({ id: `ref-${id}`, title: `参考${id}`, filePath: `/vault/references/ref-${id}.md` })
      }
      return '甲'.repeat(MAX_PREVIEW_LENGTH + 100)
    })

    const result = await retrieveKnowledge('测试', 6)

    // 前 5 条各 4000 字，总预算 20000 耗尽；第 6 条降级为纯摘要
    expect(result[0].preview?.length).toBe(MAX_PREVIEW_LENGTH)
    expect(result[4].preview?.length).toBe(MAX_PREVIEW_LENGTH)
    expect(result[5].preview).toBeUndefined()
    expect(result[5].snippet).toContain('参考6')
  })

  it('md 正文超过上限时 fullText 被截断到 MAX_FULL_TEXT_LENGTH 并标记', async () => {
    indexer.getAllEntries.mockReturnValue([
      { path: '/vault/references/ref-1.json', vector: [0.9, 0.1], indexedAt: 0 },
    ])
    readFile.mockImplementation(async (p: string) => {
      if (p === '/vault/references/ref-1.json') return referenceMetaJson()
      if (p === '/vault/references/ref-1.md') return '长'.repeat(MAX_FULL_TEXT_LENGTH + 5000)
      return ''
    })

    const result = await retrieveKnowledge('测试', 4, { includeFullText: true })

    expect(result[0].fullText?.length).toBe(MAX_FULL_TEXT_LENGTH)
    expect(result[0].truncated).toBe(true)
  })

  it('多命中合计超过总预算时，低相似度命中全文被截断，高相似度优先', async () => {
    indexer.getAllEntries.mockReturnValue([
      { path: '/vault/references/ref-1.json', vector: [0.9, 0.1], indexedAt: 0 },
      { path: '/vault/references/ref-2.json', vector: [0.8, 0.2], indexedAt: 0 },
    ])
    readFile.mockImplementation(async (p: string) => {
      if (p === '/vault/references/ref-1.json') {
        return referenceMetaJson({ id: 'ref-1', title: '参考一', filePath: '/vault/references/ref-1.md' })
      }
      if (p === '/vault/references/ref-1.md') return '甲'.repeat(25000)
      if (p === '/vault/references/ref-2.json') {
        return referenceMetaJson({ id: 'ref-2', title: '参考二', filePath: '/vault/references/ref-2.md' })
      }
      if (p === '/vault/references/ref-2.md') return '乙'.repeat(MAX_FULL_TEXT_LENGTH)
      return ''
    })

    const result = await retrieveKnowledge('测试', 4, { includeFullText: true })

    expect(result).toHaveLength(2)
    // 高相似度第一条全文完整注入
    expect(result[0].fullText?.length).toBe(25000)
    expect(result[0].truncated).toBeUndefined()
    // 第二条只剩 50000 - 25000 预算
    const secondBudget = MAX_TOTAL_TEXT_LENGTH - 25000
    expect(result[1].fullText?.length).toBe(secondBudget)
    expect(result[1].truncated).toBe(true)
  })

  it('总预算耗尽时，剩余命中全文降级为摘要', async () => {
    indexer.getAllEntries.mockReturnValue([
      { path: '/vault/references/ref-1.json', vector: [0.9, 0.1], indexedAt: 0 },
      { path: '/vault/references/ref-2.json', vector: [0.8, 0.2], indexedAt: 0 },
      { path: '/vault/references/ref-3.json', vector: [0.7, 0.3], indexedAt: 0 },
    ])
    readFile.mockImplementation(async (p: string) => {
      if (p === '/vault/references/ref-1.json') {
        return referenceMetaJson({ id: 'ref-1', title: '参考一', filePath: '/vault/references/ref-1.md' })
      }
      if (p === '/vault/references/ref-1.md') return '甲'.repeat(MAX_FULL_TEXT_LENGTH)
      if (p === '/vault/references/ref-2.json') {
        return referenceMetaJson({ id: 'ref-2', title: '参考二', filePath: '/vault/references/ref-2.md' })
      }
      if (p === '/vault/references/ref-2.md') return '乙'.repeat(MAX_FULL_TEXT_LENGTH)
      if (p === '/vault/references/ref-3.json') {
        return referenceMetaJson({ id: 'ref-3', title: '参考三', filePath: '/vault/references/ref-3.md' })
      }
      if (p === '/vault/references/ref-3.md') return '丙'.repeat(1000)
      return ''
    })

    const result = await retrieveKnowledge('测试', 4, { includeFullText: true })

    // 第一条 30000（单条上限），第二条被总量预算截到 20000
    expect(result[0].fullText?.length).toBe(MAX_FULL_TEXT_LENGTH)
    expect(result[1].fullText?.length).toBe(MAX_TOTAL_TEXT_LENGTH - MAX_FULL_TEXT_LENGTH)
    expect(result[1].truncated).toBe(true)
    // 预算耗尽，第三条只有摘要
    expect(result[2].fullText).toBeUndefined()
    expect(result[2].snippet).toContain('参考三')
  })

  it('pdf/png 参考资料无正文，fullText 为 undefined', async () => {
    indexer.getAllEntries.mockReturnValue([
      { path: '/vault/references/ref-img.json', vector: [0.9, 0.1], indexedAt: 0 },
    ])
    readFile.mockImplementation(async (p: string) => {
      if (p === '/vault/references/ref-img.json') {
        return referenceMetaJson({ fileType: 'png', fileName: 'ref.png', filePath: '/vault/references/ref-img.png' })
      }
      return ''
    })

    const result = await retrieveKnowledge('测试', 4, { includeFullText: true })

    expect(result[0].fullText).toBeUndefined()
    expect(result[0].snippet).toContain('参考资料标题')
  })

  it('pdf 命中已解析时附带页数并注入提取产物预览', async () => {
    indexer.getAllEntries.mockReturnValue([
      { path: '/vault/references/ref-1.json', vector: [0.9, 0.1], indexedAt: 0 },
    ])
    readFile.mockImplementation(async (p: string) => {
      if (p === '/vault/references/ref-1.json') {
        return referenceMetaJson({
          fileType: 'pdf',
          fileName: 'ref.pdf',
          filePath: '/vault/references/ref-1.pdf',
          extractedPath: '/vault/references/ref-1.extracted.md',
          parseStatus: 'parsed',
          pageCount: 42,
        })
      }
      if (p === '/vault/references/ref-1.extracted.md') return 'PDF 提取产物正文内容'
      return ''
    })

    const result = await retrieveKnowledge('测试')

    expect(result[0].pageCount).toBe(42)
    expect(result[0].preview).toContain('PDF 提取产物正文内容')
  })

  it('buildKnowledgeContext pdf 命中带 pageCount 时提示按页读取', () => {
    const hits = [
      { kind: 'reference' as const, path: '/vault/references/ref-1.json', title: '参考B', snippet: '摘要', pageCount: 42 },
    ]

    const text = buildKnowledgeContext(hits)

    expect(text).toContain('该 PDF 共 42 页')
    expect(text).toContain('offset: 0, limit: 1')
  })

  it('分块命中时回填章节标题与页码区间，预览为该块页区间正文', async () => {
    indexer.getAllEntries.mockReturnValue([
      { path: '/vault/references/ref-1.json', vector: [0.9, 0.1], indexedAt: 0, chunkIndex: 1, chunkTitle: '第二章', pageFrom: 2, pageTo: 3 },
    ])
    readFile.mockImplementation(async (p: string) => {
      if (p === '/vault/references/ref-1.json') {
        return referenceMetaJson({
          fileType: 'pdf',
          fileName: 'ref.pdf',
          filePath: '/vault/references/ref-1.pdf',
          extractedPath: '/vault/references/ref-1.extracted.md',
          parseStatus: 'parsed',
          pageCount: 5,
        })
      }
      if (p === '/vault/references/ref-1.extracted.md') {
        return [
          '<!-- page: 1 -->', '第一页',
          '<!-- page: 2 -->', '第二页',
          '<!-- page: 3 -->', '第三页',
          '<!-- page: 4 -->', '第四页',
          '<!-- page: 5 -->', '第五页',
        ].join('\n')
      }
      return ''
    })

    const result = await retrieveKnowledge('测试')

    expect(result[0].sectionTitle).toBe('第二章')
    expect(result[0].pageFrom).toBe(2)
    expect(result[0].pageTo).toBe(3)
    expect(result[0].pageCount).toBe(5)
    // 预览只含物理第 3-4 页（pageFrom=2 起）
    expect(result[0].preview).toContain('第三页')
    expect(result[0].preview).toContain('第四页')
    expect(result[0].preview).not.toContain('第一页')
  })

  it('buildKnowledgeContext 分块命中时提示章节与页码区间', () => {
    const hits = [
      { kind: 'reference' as const, path: '/vault/references/ref-1.json', title: '参考B', snippet: '摘要', pageCount: 5, sectionTitle: '第二章', pageFrom: 2, pageTo: 3 },
    ]

    const text = buildKnowledgeContext(hits)

    expect(text).toContain('该内容来自「第二章」第 3-4 页')
    expect(text).toContain('offset: 2, limit: 2')
  })

  it('任一命中读取失败时跳过该命中', async () => {
    indexer.getAllEntries.mockReturnValue([
      { path: '/vault/notes/ok.md', vector: [0.9, 0.1], indexedAt: 0 },
      { path: '/vault/notes/bad.md', vector: [0.8, 0.2], indexedAt: 0 },
    ])
    readFile.mockImplementation(async (p: string) => {
      if (p === '/vault/notes/bad.md') throw new Error('读取失败')
      return noteContent('正常笔记', '正文')
    })

    const result = await retrieveKnowledge('测试')

    expect(result).toHaveLength(1)
    expect(result[0].path).toBe('/vault/notes/ok.md')
  })

  it('buildKnowledgeContext 格式化为 markdown，含 [笔记]/[参考资料] 标注', () => {
    const hits = [
      { kind: 'note' as const, path: '/vault/notes/a.md', title: '笔记A', snippet: '笔记A的片段' },
      { kind: 'reference' as const, path: '/vault/references/b.json', title: '参考B', snippet: '参考B的片段' },
    ]

    const text = buildKnowledgeContext(hits)

    expect(text).toContain('以下是从你的知识库（笔记与参考资料）中检索到的与用户问题相关的内容，已附正文预览')
    expect(text).toContain('请调用 read_reference 工具读取全文')
    expect(text).toContain('### [笔记] 笔记A')
    expect(text).toContain('### [参考资料] 参考B')
    expect(text).toContain('笔记A的片段')
    expect(text).toContain('参考B的片段')
  })

  it('buildKnowledgeContext 参考资料条目标注 read_reference 工具指引', () => {
    const hits = [
      { kind: 'reference' as const, path: '/vault/references/abc.json', title: '参考B', snippet: '摘要' },
    ]

    const text = buildKnowledgeContext(hits)

    expect(text).toContain('reference_id: "/vault/references/abc.json"')
  })

  it('buildKnowledgeContext 有 preview 时优先注入正文预览', () => {
    const hits = [
      { kind: 'reference' as const, path: '/vault/references/b.json', title: '参考B', snippet: '参考B的摘要', preview: '参考B的正文预览内容' },
    ]

    const text = buildKnowledgeContext(hits)

    expect(text).toContain('（正文预览）')
    expect(text).toContain('参考B的正文预览内容')
    expect(text).not.toContain('参考B的摘要')
  })

  it('buildKnowledgeContext 命中含 fullText 时优先注入全文', () => {
    const hits = [
      { kind: 'reference' as const, path: '/vault/references/b.json', title: '参考B', snippet: '参考B的摘要', fullText: '参考B的完整正文内容' },
    ]

    const text = buildKnowledgeContext(hits)

    expect(text).toContain('参考B的完整正文内容')
    expect(text).not.toContain('参考B的摘要')
  })

  it('buildKnowledgeContext 对截断条目追加信息缺失提示', () => {
    const hits = [
      { kind: 'reference' as const, path: '/vault/references/b.json', title: '参考B', snippet: '摘要', fullText: '正文', truncated: true },
    ]

    const text = buildKnowledgeContext(hits)

    expect(text).toContain('（注：该内容过长，已截断展示，可能存在信息缺失）')
  })

  it('retrieveKnowledgeContext 无命中时返回空字符串', async () => {
    indexer.getAllEntries.mockReturnValue([])
    expect(await retrieveKnowledgeContext('测试')).toBe('')
  })
})
