import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useReferenceStore } from './references'
import { useSettingsStore } from './settings'
import type { ReferenceMeta } from '../types'

const vaultFs = vi.hoisted(() => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  createDir: vi.fn().mockResolvedValue(undefined),
  deleteFile: vi.fn().mockResolvedValue(undefined),
  listDir: vi.fn(),
  readFile: vi.fn(),
  writeFileBytes: vi.fn().mockResolvedValue(undefined),
  readFileBytes: vi.fn(),
  extractPdfText: vi.fn(),
}))
const updateNote = vi.hoisted(() => vi.fn())
const updateChunks = vi.hoisted(() => vi.fn())
const removeNote = vi.hoisted(() => vi.fn())
const compressImageFile = vi.hoisted(() => vi.fn())
const imageToMarkdown = vi.hoisted(() => vi.fn())
const createVisionProvider = vi.hoisted(() => vi.fn())

vi.mock('../utils/vault-fs', () => vaultFs)
vi.mock('../embedding/indexer', () => ({
  getNoteIndexer: () => ({ updateNote, updateChunks, removeNote }),
}))
vi.mock('../utils/image-compress', () => ({
  compressImageFile,
}))
vi.mock('../api/skills/image-to-note', () => ({
  imageToMarkdown,
}))
vi.mock('../api/provider-factory', () => ({
  createVisionProvider,
}))

/** 构造一个最小可用的伪 File 对象（不依赖浏览器 File 实现） */
function createMockFile(name: string, content: string): File {
  const bytes = new TextEncoder().encode(content)
  return {
    name,
    arrayBuffer: async () => bytes.buffer as ArrayBuffer,
  } as unknown as File
}

function makeMeta(overrides: Partial<ReferenceMeta> = {}): ReferenceMeta {
  return {
    id: 'meta-1',
    path: '/vault/references/meta-1/meta-1.json',
    title: '测试参考资料',
    description: '',
    tags: [],
    fileType: 'md',
    fileName: '测试参考资料.md',
    filePath: '/vault/references/meta-1/meta-1.md',
    created: '2026-01-01T00:00:00.000Z',
    updated: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('references store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('初始状态不包含参考资料', () => {
    const store = useReferenceStore()
    expect(store.references).toHaveLength(0)
    expect(store.referenceCount).toBe(0)
    expect(store.isLoading).toBe(false)
    expect(store.currentVaultPath).toBeNull()
  })

  it('loadAllReferences 解析目录中的文件夹并按 updated 降序排序', async () => {
    const store = useReferenceStore()
    vaultFs.listDir.mockResolvedValue([
      { name: 'a', path: '/vault/references/a', is_dir: true },
      { name: 'b', path: '/vault/references/b', is_dir: true },
    ])
    vaultFs.readFile.mockImplementation(async (path: string) => {
      if (path === '/vault/references/a/a.json') {
        return JSON.stringify({ ...makeMeta(), id: 'a', path, title: '笔记A', filePath: '/vault/references/a/a.md', updated: '2026-01-01T00:00:00.000Z', created: '2026-01-01T00:00:00.000Z' })
      }
      return JSON.stringify({ ...makeMeta(), id: 'b', path, title: '笔记B', filePath: '/vault/references/b/b.md', updated: '2026-01-02T00:00:00.000Z', created: '2026-01-02T00:00:00.000Z' })
    })

    await store.loadAllReferences('/vault')

    expect(store.currentVaultPath).toBe('/vault')
    expect(store.isLoading).toBe(false)
    expect(store.references.map((r) => r.title)).toEqual(['笔记B', '笔记A'])
  })

  it('loadAllReferences 跳过损坏的文件夹内 json 文件', async () => {
    const store = useReferenceStore()
    vaultFs.listDir.mockResolvedValue([
      { name: 'ok', path: '/vault/references/ok', is_dir: true },
      { name: 'broken', path: '/vault/references/broken', is_dir: true },
    ])
    vaultFs.readFile.mockImplementation(async (path: string) => {
      if (path === '/vault/references/broken/broken.json') return 'not-valid-json'
      return JSON.stringify(makeMeta({ id: 'ok', path, filePath: '/vault/references/ok/ok.md' }))
    })

    await store.loadAllReferences('/vault')

    expect(store.references).toHaveLength(1)
    expect(store.references[0].id).toBe('ok')
  })

  it('loadAllReferences 兼容旧扁平格式并懒迁移到文件夹', async () => {
    const store = useReferenceStore()
    const legacyMeta = makeMeta({ id: 'legacy', path: '/vault/references/legacy.json', filePath: '/vault/references/legacy.pdf', fileType: 'pdf', fileName: 'legacy.pdf' })
    vaultFs.listDir.mockResolvedValue([
      { name: 'legacy.json', path: '/vault/references/legacy.json', is_dir: false },
    ])
    vaultFs.readFile.mockImplementation(async (path: string) => {
      if (path === '/vault/references/legacy.json') return JSON.stringify(legacyMeta)
      return ''
    })
    vaultFs.readFileBytes.mockResolvedValue(new Uint8Array([1, 2, 3]))

    await store.loadAllReferences('/vault')

    // 迁移：写新元数据到文件夹 + 删除旧元数据 + 移动原始文件
    expect(vaultFs.writeFileBytes).toHaveBeenCalledWith('/vault/references/legacy/legacy.pdf', expect.any(Uint8Array))
    expect(vaultFs.deleteFile).toHaveBeenCalledWith('/vault/references/legacy.pdf')
    expect(vaultFs.deleteFile).toHaveBeenCalledWith('/vault/references/legacy.json')
    expect(store.references).toHaveLength(1)
    expect(store.references[0].path).toBe('/vault/references/legacy/legacy.json')
    expect(store.references[0].filePath).toBe('/vault/references/legacy/legacy.pdf')
  })

  it('loadAllReferences 目录不存在时列表为空且不抛错', async () => {
    const store = useReferenceStore()
    vaultFs.listDir.mockRejectedValue(new Error('directory not found'))

    await expect(store.loadAllReferences('/vault')).resolves.toBeUndefined()

    expect(store.references).toHaveLength(0)
    expect(store.isLoading).toBe(false)
  })

  it('uploadReference 写入二进制文件与元数据 json、加入列表并对 md 更新索引', async () => {
    const store = useReferenceStore()
    vaultFs.readFile.mockResolvedValue('# 正文内容')

    const meta = await store.uploadReference('/vault', createMockFile('费曼学习法.md', '# 正文内容'))

    expect(meta).not.toBeNull()
    expect(vaultFs.createDir).toHaveBeenCalledWith(expect.stringMatching(/^\/vault\/references\/.+$/))

    const filePath = vaultFs.writeFileBytes.mock.calls[0][0]
    const bytes = vaultFs.writeFileBytes.mock.calls[0][1]
    expect(filePath).toMatch(/^\/vault\/references\/.+\/.+\.md$/)
    expect(bytes).toBeInstanceOf(Uint8Array)

    const metaPath = vaultFs.writeFile.mock.calls[0][0]
    const json = vaultFs.writeFile.mock.calls[0][1]
    expect(metaPath).toMatch(/^\/vault\/references\/.+\/.+\.json$/)
    expect(JSON.parse(json)).toMatchObject({
      id: meta!.id,
      title: '费曼学习法',
      description: '',
      tags: [],
      fileType: 'md',
      fileName: '费曼学习法.md',
      path: metaPath,
      filePath,
    })

    expect(store.references).toHaveLength(1)
    expect(store.referenceCount).toBe(1)
    expect(store.references[0]).toMatchObject({ title: '费曼学习法', fileType: 'md' })
    expect(updateNote).toHaveBeenCalledWith(metaPath, expect.stringContaining('费曼学习法'))
    expect(updateNote).toHaveBeenCalledWith(metaPath, expect.stringContaining('# 正文内容'))
  })

  it('uploadReference 非法类型返回 null 且不写任何文件', async () => {
    const store = useReferenceStore()

    const meta = await store.uploadReference('/vault', createMockFile('说明.txt', '文本'))

    expect(meta).toBeNull()
    expect(vaultFs.createDir).not.toHaveBeenCalled()
    expect(vaultFs.writeFileBytes).not.toHaveBeenCalled()
    expect(vaultFs.writeFile).not.toHaveBeenCalled()
    expect(store.references).toHaveLength(0)
  })

  it('updateReference 重写 json、更新时间并触发重新索引', async () => {
    const store = useReferenceStore()
    vaultFs.readFile.mockResolvedValue('# 正文内容')
    const uploaded = await store.uploadReference('/vault', createMockFile('费曼学习法.md', '# 正文内容'))
    expect(uploaded).not.toBeNull()
    expect(updateNote).toHaveBeenCalledTimes(1)

    const result = await store.updateReference({
      ...uploaded!,
      title: '新标题',
      description: '新描述',
      tags: ['标签A', '标签B'],
    })

    expect(result).not.toBeNull()
    expect(result!.title).toBe('新标题')
    expect(result!.updated).toBeTruthy()
    expect(Date.parse(result!.updated!)).not.toBeNaN()

    const [metaPath, json] = vaultFs.writeFile.mock.calls[1]
    expect(metaPath).toBe(uploaded!.path)
    expect(JSON.parse(json)).toMatchObject({ title: '新标题', tags: ['标签A', '标签B'], updated: result!.updated })

    expect(store.references).toHaveLength(1)
    expect(store.references[0].title).toBe('新标题')
    expect(updateNote).toHaveBeenCalledTimes(2)
    expect(updateNote).toHaveBeenLastCalledWith(uploaded!.path, expect.stringContaining('新描述'))
    expect(updateNote).toHaveBeenLastCalledWith(uploaded!.path, expect.stringContaining('标签A'))
  })

  it('deleteReference 递归删除整个自包含文件夹、从列表移除并移除索引', async () => {
    const store = useReferenceStore()
    vaultFs.readFile.mockResolvedValue('# 正文内容')
    const uploaded = await store.uploadReference('/vault', createMockFile('待删除.md', '# 正文内容'))
    expect(uploaded).not.toBeNull()

    const ok = await store.deleteReference(uploaded!.path)

    expect(ok).toBe(true)
    // 删除的是整个文件夹（含元数据/原始文件/提取产物）
    expect(vaultFs.deleteFile).toHaveBeenCalledWith(expect.stringMatching(/^\/vault\/references\/[^/]+$/))
    expect(store.references).toHaveLength(0)
    expect(removeNote).toHaveBeenCalledWith(uploaded!.path)
  })

  it('deleteReference 对不存在的元数据返回 false', async () => {
    const store = useReferenceStore()

    expect(await store.deleteReference('/vault/references/nope.json')).toBe(false)
    expect(vaultFs.deleteFile).not.toHaveBeenCalled()
  })

  it('deleteReference 删除文件失败时仍从列表移除并返回 false', async () => {
    const store = useReferenceStore()
    vaultFs.readFile.mockResolvedValue('# 正文内容')
    const uploaded = await store.uploadReference('/vault', createMockFile('部分失败.md', '# 正文内容'))
    expect(uploaded).not.toBeNull()
    vaultFs.deleteFile.mockRejectedValueOnce(new Error('delete failed'))

    expect(await store.deleteReference(uploaded!.path)).toBe(false)
    expect(store.references).toHaveLength(0)
    expect(removeNote).toHaveBeenCalledWith(uploaded!.path)
  })

  it('loadReferencePreview 对 md 返回纯文本', async () => {
    const store = useReferenceStore()
    vaultFs.readFile.mockResolvedValue('# 标题\n正文内容')

    const preview = await store.loadReferencePreview(makeMeta())

    expect(preview).toBe('# 标题\n正文内容')
    expect(vaultFs.readFile).toHaveBeenCalledWith('/vault/references/meta-1/meta-1.md')
  })

  it('loadReferencePreview 对 png 返回 base64 data URL', async () => {
    const store = useReferenceStore()
    vaultFs.readFileBytes.mockResolvedValue(new Uint8Array([80, 78, 71, 65]))

    const preview = await store.loadReferencePreview(makeMeta({ fileType: 'png', filePath: '/vault/references/meta-1/meta-1.png' }))

    expect(preview).toBe(`data:image/png;base64,${btoa('PNGA')}`)
    expect(vaultFs.readFileBytes).toHaveBeenCalledWith('/vault/references/meta-1/meta-1.png')
  })

  it('loadReferencePreview 对 pdf 返回空字符串', async () => {
    const store = useReferenceStore()

    const preview = await store.loadReferencePreview(makeMeta({ fileType: 'pdf', filePath: '/vault/references/meta-1/meta-1.pdf' }))

    expect(preview).toBe('')
    expect(vaultFs.readFile).not.toHaveBeenCalled()
    expect(vaultFs.readFileBytes).not.toHaveBeenCalled()
  })

  it('上传 pdf 后台解析为 parsed，写入提取产物与页数/字符数', async () => {
    const store = useReferenceStore()
    vaultFs.extractPdfText.mockResolvedValue({
      page_count: 3,
      markdown: '<!-- page: 1 -->\n正文一\n\n<!-- page: 2 -->\n正文二',
      chars: 18,
    })

    const meta = await store.uploadReference('/vault', createMockFile('文档.pdf', '%PDF-1.4 dummy'))
    expect(meta).not.toBeNull()
    // 等待后台解析完成
    await new Promise((r) => setTimeout(r, 0))

    expect(vaultFs.extractPdfText).toHaveBeenCalled()
    const latest = store.references.find((r) => r.id === meta!.id)!
    expect(latest.parseStatus).toBe('parsed')
    expect(latest.pageCount).toBe(3)
    expect(latest.extractedChars).toBe(18)
    expect(latest.extractedPath).toBe(`/vault/references/${meta!.id}/${meta!.id}.extracted.md`)
    // 提取产物已写入，含页边界标记
    expect(vaultFs.writeFile).toHaveBeenCalledWith(
      `/vault/references/${meta!.id}/${meta!.id}.extracted.md`,
      expect.stringContaining('<!-- page: 1 -->'),
    )
  })

  it('pdf 解析失败时置为 failed 并记录 parseError', async () => {
    const store = useReferenceStore()
    vaultFs.extractPdfText.mockRejectedValue(new Error('该 PDF 无可提取的文本内容（可能是扫描件，暂不支持 OCR）'))

    const meta = await store.uploadReference('/vault', createMockFile('扫描件.pdf', '%PDF dummy'))
    await new Promise((r) => setTimeout(r, 0))

    const latest = store.references.find((r) => r.id === meta!.id)!
    expect(latest.parseStatus).toBe('failed')
    expect(latest.parseError).toContain('扫描件')
  })

  it('retryParseReference 重新解析失败的 pdf 为 parsed', async () => {
    const store = useReferenceStore()
    vaultFs.extractPdfText.mockRejectedValueOnce(new Error('第一次失败'))

    const meta = await store.uploadReference('/vault', createMockFile('文档.pdf', '%PDF dummy'))
    await new Promise((r) => setTimeout(r, 0))
    let latest = store.references.find((r) => r.id === meta!.id)!
    expect(latest.parseStatus).toBe('failed')

    vaultFs.extractPdfText.mockResolvedValueOnce({ page_count: 1, markdown: '<!-- page: 1 -->\n正文', chars: 4 })
    await store.retryParseReference(latest.path)
    await new Promise((r) => setTimeout(r, 0))

    latest = store.references.find((r) => r.id === meta!.id)!
    expect(latest.parseStatus).toBe('parsed')
    expect(latest.pageCount).toBe(1)
  })

  it('大 pdf 解析后按章节分块建立多向量索引', async () => {
    const store = useReferenceStore()
    const markdown = [
      '<!-- page: 1 -->',
      '# 第一章',
      '甲'.repeat(3000),
      '<!-- page: 2 -->',
      '## 第二章',
      '乙'.repeat(3000),
    ].join('\n')
    vaultFs.extractPdfText.mockResolvedValue({ page_count: 2, markdown, chars: markdown.length })
    vaultFs.readFile.mockImplementation(async (path: string) => {
      if (path.endsWith('.extracted.md')) return markdown
      return ''
    })

    const meta = await store.uploadReference('/vault', createMockFile('大文档.pdf', '%PDF dummy'))
    await new Promise((r) => setTimeout(r, 0))

    expect(updateChunks).toHaveBeenCalledTimes(1)
    const [metaPath, chunks] = updateChunks.mock.calls[0] as [string, Array<Record<string, unknown>>]
    expect(metaPath).toBe(meta!.path)
    expect(chunks).toHaveLength(2)
    expect(chunks[0].chunkTitle).toBe('第一章')
    expect(chunks[0].pageFrom).toBe(0)
    expect(chunks[0].pageTo).toBe(0)
    expect(chunks[1].chunkTitle).toBe('第二章')
    expect(chunks[1].pageFrom).toBe(1)
    expect(chunks[1].pageTo).toBe(1)
  })

  it('超大 md 上传后按章节分块建立多向量索引', async () => {
    const store = useReferenceStore()
    const markdown = ['# 第一章', '甲'.repeat(3000), '# 第二章', '乙'.repeat(3000)].join('\n')
    vaultFs.readFile.mockImplementation(async (path: string) => {
      if (path.endsWith('.md')) return markdown
      return ''
    })

    const meta = await store.uploadReference('/vault', createMockFile('大文档.md', markdown))

    expect(updateChunks).toHaveBeenCalledTimes(1)
    const [metaPath, chunks] = updateChunks.mock.calls[0] as [string, Array<Record<string, unknown>>]
    expect(metaPath).toBe(meta!.path)
    expect(chunks).toHaveLength(2)
    expect(chunks[0].chunkTitle).toBe('第一章')
    expect(chunks[0].pageFrom).toBeUndefined()
    expect(chunks[0].pageTo).toBeUndefined()
    expect(chunks[1].chunkTitle).toBe('第二章')
    expect(chunks[1].pageFrom).toBeUndefined()
    expect(chunks[1].pageTo).toBeUndefined()
  })

  describe('PNG 识别（recognizePngReference）', () => {
    const pngMeta = (): ReferenceMeta => makeMeta({
      id: 'png-1',
      path: '/vault/references/png-1/png-1.json',
      fileType: 'png',
      fileName: '示意图.png',
      filePath: '/vault/references/png-1/png-1.png',
    })

    /** 取对元数据路径的最近一次写入（前序 parsing 状态写入会被后续状态覆盖） */
    function lastMetaWrite(path: string): [string, string] {
      const calls = vaultFs.writeFile.mock.calls.filter((c: [string, string]) => c[0] === path) as Array<[string, string]>
      expect(calls.length).toBeGreaterThan(0)
      return calls[calls.length - 1]
    }

    beforeEach(() => {
      compressImageFile.mockResolvedValue({ mimeType: 'image/jpeg', base64: 'QUJD' })
      imageToMarkdown.mockResolvedValue({
        title: '示意图',
        description: '一张示意图',
        tags: ['图'],
        markdown: '## 说明\n\n| A | B |\n| --- | --- |\n| 1 | 2 |',
      })
      createVisionProvider.mockReturnValue({ chat: vi.fn() } as never)
      const settings = useSettingsStore()
      settings.visionEnabled = true
      settings.visionApiKey = 'sk-vision'
      vaultFs.readFileBytes.mockResolvedValue(new Uint8Array([1, 2, 3]))
      vaultFs.readFile.mockResolvedValue('')
    })

    it('完整流程：读取→压缩→识别→写提取产物并回填元数据', async () => {
      const store = useReferenceStore()
      const meta = pngMeta()

      const ok = await store.recognizePngReference(meta, '/vault')

      expect(ok).toBe(true)
      expect(vaultFs.readFileBytes).toHaveBeenCalledWith(meta.filePath)
      expect(compressImageFile).toHaveBeenCalled()
      expect(imageToMarkdown).toHaveBeenCalledWith(
        { mimeType: 'image/jpeg', base64: 'QUJD' },
        expect.anything(),
        'reference',
      )

      // 写入 {id}.extracted.md
      const extractCall = vaultFs.writeFile.mock.calls.find(
        (c: [string, string]) => c[0] === '/vault/references/png-1/png-1.extracted.md',
      )
      expect(extractCall).toBeTruthy()
      expect(extractCall![1]).toContain('| 1 | 2 |')

      // 元数据最终回填 parsed
      const saved = JSON.parse(lastMetaWrite(meta.path)[1])
      expect(saved.parseStatus).toBe('parsed')
      expect(saved.extractedPath).toBe('/vault/references/png-1/png-1.extracted.md')
      expect(saved.extractedChars).toBeGreaterThan(0)
      expect(saved.extractedAt).toBeTruthy()
      expect(updateNote).toHaveBeenCalled()
    })

    it('传入 result 时仅落盘（不重复识别）', async () => {
      const store = useReferenceStore()
      const meta = pngMeta()
      const result = { title: 't', description: 'd', tags: ['a'], markdown: '正文' }

      const ok = await store.recognizePngReference(meta, '/vault', result)

      expect(ok).toBe(true)
      expect(imageToMarkdown).not.toHaveBeenCalled()
      expect(vaultFs.readFileBytes).not.toHaveBeenCalled()
      expect(JSON.parse(lastMetaWrite(meta.path)[1]).parseStatus).toBe('parsed')
    })

    it('未配置转笔记模型时标记 failed 并返回 false', async () => {
      useSettingsStore().visionEnabled = false
      const store = useReferenceStore()
      const meta = pngMeta()

      const ok = await store.recognizePngReference(meta, '/vault')

      expect(ok).toBe(false)
      const saved = JSON.parse(lastMetaWrite(meta.path)[1])
      expect(saved.parseStatus).toBe('failed')
      expect(saved.parseError).toContain('尚未配置图片转笔记模型')
    })

    it('识别失败时标记 failed 并保留错误信息', async () => {
      imageToMarkdown.mockRejectedValue(new Error('LLM 调用失败: API 错误 (401)'))
      const store = useReferenceStore()
      const meta = pngMeta()

      const ok = await store.recognizePngReference(meta, '/vault')

      expect(ok).toBe(false)
      const saved = JSON.parse(lastMetaWrite(meta.path)[1])
      expect(saved.parseStatus).toBe('failed')
      expect(saved.parseError).toContain('API 错误 (401)')
    })

    it('非 png 类型直接返回 false 不做任何写入', async () => {
      const store = useReferenceStore()
      const meta = makeMeta({ fileType: 'md' })

      const ok = await store.recognizePngReference(meta, '/vault')

      expect(ok).toBe(false)
      expect(vaultFs.writeFile).not.toHaveBeenCalled()
    })

    it('retryRecognizePng 对失败 PNG 重新识别', async () => {
      useSettingsStore().visionEnabled = false
      const store = useReferenceStore()
      const meta = pngMeta()
      store.references.push(meta)
      store.currentVaultPath = '/vault'

      await store.retryRecognizePng(meta.path)

      expect(JSON.parse(lastMetaWrite(meta.path)[1]).parseStatus).toBe('failed')
    })

    it('已识别的 png 在 refreshIndex 中按提取产物索引', async () => {
      const store = useReferenceStore()
      const meta: ReferenceMeta = {
        ...pngMeta(),
        parseStatus: 'parsed',
        extractedPath: '/vault/references/png-1/png-1.extracted.md',
        extractedChars: 10,
      }
      vaultFs.readFile.mockResolvedValue('## 章节\n\n内容')

      await store.updateReference(meta)

      expect(updateNote).toHaveBeenCalledWith(meta.path, expect.stringContaining('## 章节'))
    })
  })
})
