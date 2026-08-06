import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useReferenceStore } from './references'
import type { ReferenceMeta } from '../types'

const vaultFs = vi.hoisted(() => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  createDir: vi.fn().mockResolvedValue(undefined),
  deleteFile: vi.fn().mockResolvedValue(undefined),
  listDir: vi.fn(),
  readFile: vi.fn(),
  writeFileBytes: vi.fn().mockResolvedValue(undefined),
  readFileBytes: vi.fn(),
}))
const updateNote = vi.hoisted(() => vi.fn())
const removeNote = vi.hoisted(() => vi.fn())

vi.mock('../utils/vault-fs', () => vaultFs)
vi.mock('../embedding/indexer', () => ({
  getNoteIndexer: () => ({ updateNote, removeNote }),
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
    path: '/vault/references/meta-1.json',
    title: '测试参考资料',
    description: '',
    tags: [],
    fileType: 'md',
    fileName: '测试参考资料.md',
    filePath: '/vault/references/meta-1.md',
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

  it('loadAllReferences 解析目录中的 json 并按 updated 降序排序', async () => {
    const store = useReferenceStore()
    vaultFs.listDir.mockResolvedValue([
      { name: 'a.json', path: '/vault/references/a.json', is_dir: false },
      { name: 'b.json', path: '/vault/references/b.json', is_dir: false },
      { name: '图片.png', path: '/vault/references/图片.png', is_dir: false },
      { name: '子目录', path: '/vault/references/子目录', is_dir: true },
    ])
    vaultFs.readFile.mockImplementation(async (path: string) => {
      if (path === '/vault/references/a.json') {
        return JSON.stringify({ ...makeMeta(), id: 'a', path, title: '笔记A', filePath: '/vault/references/a.md', updated: '2026-01-01T00:00:00.000Z', created: '2026-01-01T00:00:00.000Z' })
      }
      return JSON.stringify({ ...makeMeta(), id: 'b', path, title: '笔记B', filePath: '/vault/references/b.md', updated: '2026-01-02T00:00:00.000Z', created: '2026-01-02T00:00:00.000Z' })
    })

    await store.loadAllReferences('/vault')

    expect(store.currentVaultPath).toBe('/vault')
    expect(store.isLoading).toBe(false)
    expect(store.references.map((r) => r.title)).toEqual(['笔记B', '笔记A'])
  })

  it('loadAllReferences 跳过损坏的 json 文件', async () => {
    const store = useReferenceStore()
    vaultFs.listDir.mockResolvedValue([
      { name: 'ok.json', path: '/vault/references/ok.json', is_dir: false },
      { name: 'broken.json', path: '/vault/references/broken.json', is_dir: false },
    ])
    vaultFs.readFile.mockImplementation(async (path: string) => {
      if (path === '/vault/references/broken.json') return 'not-valid-json'
      return JSON.stringify(makeMeta({ id: 'ok', path, filePath: '/vault/references/ok.md' }))
    })

    await store.loadAllReferences('/vault')

    expect(store.references).toHaveLength(1)
    expect(store.references[0].id).toBe('ok')
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
    expect(vaultFs.createDir).toHaveBeenCalledWith('/vault/references')

    const filePath = vaultFs.writeFileBytes.mock.calls[0][0]
    const bytes = vaultFs.writeFileBytes.mock.calls[0][1]
    expect(filePath).toMatch(/^\/vault\/references\/.+\.md$/)
    expect(bytes).toBeInstanceOf(Uint8Array)

    const metaPath = vaultFs.writeFile.mock.calls[0][0]
    const json = vaultFs.writeFile.mock.calls[0][1]
    expect(metaPath).toMatch(/^\/vault\/references\/.+\.json$/)
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

  it('deleteReference 删除元数据与文件、从列表移除并移除索引', async () => {
    const store = useReferenceStore()
    vaultFs.readFile.mockResolvedValue('# 正文内容')
    const uploaded = await store.uploadReference('/vault', createMockFile('待删除.md', '# 正文内容'))
    expect(uploaded).not.toBeNull()

    const ok = await store.deleteReference(uploaded!.path)

    expect(ok).toBe(true)
    expect(vaultFs.deleteFile).toHaveBeenCalledWith(uploaded!.path)
    expect(vaultFs.deleteFile).toHaveBeenCalledWith(uploaded!.filePath)
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
    expect(vaultFs.readFile).toHaveBeenCalledWith('/vault/references/meta-1.md')
  })

  it('loadReferencePreview 对 png 返回 base64 data URL', async () => {
    const store = useReferenceStore()
    vaultFs.readFileBytes.mockResolvedValue(new Uint8Array([80, 78, 71, 65]))

    const preview = await store.loadReferencePreview(makeMeta({ fileType: 'png', filePath: '/vault/references/meta-1.png' }))

    expect(preview).toBe(`data:image/png;base64,${btoa('PNGA')}`)
    expect(vaultFs.readFileBytes).toHaveBeenCalledWith('/vault/references/meta-1.png')
  })

  it('loadReferencePreview 对 pdf 返回空字符串', async () => {
    const store = useReferenceStore()

    const preview = await store.loadReferencePreview(makeMeta({ fileType: 'pdf', filePath: '/vault/references/meta-1.pdf' }))

    expect(preview).toBe('')
    expect(vaultFs.readFile).not.toHaveBeenCalled()
    expect(vaultFs.readFileBytes).not.toHaveBeenCalled()
  })
})
