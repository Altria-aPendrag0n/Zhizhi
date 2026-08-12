import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useVaultStore } from './vault'
import type { IndexEntry } from '../embedding/indexer'

const { listDirMock, readFileMock, isReadyMock, indexerMock } = vi.hoisted(() => ({
  listDirMock: vi.fn(),
  readFileMock: vi.fn(),
  isReadyMock: vi.fn(),
  indexerMock: {
    loadFromStorage: vi.fn(),
    buildIndex: vi.fn().mockResolvedValue(undefined),
    getAllEntries: vi.fn<() => IndexEntry[]>(() => []),
    updateNote: vi.fn().mockResolvedValue(undefined),
    removeNote: vi.fn(),
    size: 0,
  },
}))

vi.mock('../utils/vault-fs', () => ({
  listDir: listDirMock,
  readFile: readFileMock,
  startWatching: vi.fn().mockResolvedValue(undefined),
  stopWatching: vi.fn().mockResolvedValue(undefined),
  deleteFile: vi.fn().mockResolvedValue(undefined),
  fileExists: vi.fn().mockResolvedValue(false),
}))

vi.mock('../embedding/engine', () => ({
  getEmbeddingEngine: () => ({ isReady: isReadyMock }),
}))

vi.mock('../embedding/indexer', () => ({
  getNoteIndexer: () => indexerMock,
}))

vi.mock('../utils/reference-serializer', () => ({
  getReferencesDir: (vaultPath: string) => `${vaultPath}/references`,
  parseReferenceMeta: (json: string) => JSON.parse(json),
}))

/** 一个 md 参考资料元数据（与 reference-serializer 的字段一致） */
const refMeta = {
  id: 'r1',
  path: '/vault/references/r1.json',
  title: '参考资料标题',
  description: '参考资料描述',
  tags: ['AI'],
  fileType: 'md',
  fileName: 'doc.md',
  filePath: '/vault/references/r1.md',
  created: '2026-01-01T00:00:00.000Z',
  updated: '2026-07-01T00:00:00.000Z',
}

function setupReferenceDir() {
  listDirMock.mockResolvedValue([
    { name: 'r1.json', path: '/vault/references/r1.json', is_dir: false },
  ])
  readFileMock.mockResolvedValue(JSON.stringify(refMeta))
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('vault store openVault 路径校验', () => {
  it('路径不存在/不可读时抛错，且不设置 vaultPath（避免幽灵 Vault 导致统计全 0）', async () => {
    listDirMock.mockRejectedValue(new Error('读取目录失败: 目录不存在'))
    const store = useVaultStore()

    await expect(store.openVault('/nonexistent/vault')).rejects.toThrow('目录不存在或无法读取')
    expect(store.vaultPath).toBeNull()
    expect(store.isOpen).toBe(false)
  })

  it('有效目录正常打开', async () => {
    listDirMock.mockResolvedValue([])
    const store = useVaultStore()

    await store.openVault('/valid/vault')

    expect(store.vaultPath).toBe('/valid/vault')
    expect(store.isOpen).toBe(true)
  })
})

describe('vault store initIndex', () => {
  it('引擎未就绪时跳过索引构建（等待引擎就绪后由 App 重试）', async () => {
    isReadyMock.mockReturnValue(false)
    const store = useVaultStore()
    store.vaultPath = '/vault'

    await store.initIndex()

    expect(indexerMock.loadFromStorage).not.toHaveBeenCalled()
    expect(indexerMock.buildIndex).not.toHaveBeenCalled()
    expect(indexerMock.updateNote).not.toHaveBeenCalled()
  })

  it('命中缓存时跳过笔记重建，但仍增量同步参考资料', async () => {
    isReadyMock.mockReturnValue(true)
    indexerMock.loadFromStorage.mockReturnValue(true)
    setupReferenceDir()

    const store = useVaultStore()
    store.vaultPath = '/vault'
    store.fileTree = [
      { name: 'notes', path: '/vault/notes', is_dir: true, children: [{ name: 'a.md', path: '/vault/notes/a.md', is_dir: false }] },
    ]

    await store.initIndex()

    expect(indexerMock.buildIndex).not.toHaveBeenCalled()
    expect(indexerMock.updateNote).toHaveBeenCalledTimes(1)
    expect(indexerMock.updateNote).toHaveBeenCalledWith(
      '/vault/references/r1.json',
      expect.stringContaining('参考资料标题'),
    )
  })

  it('无缓存时构建笔记索引，并同步参考资料', async () => {
    isReadyMock.mockReturnValue(true)
    indexerMock.loadFromStorage.mockReturnValue(false)
    setupReferenceDir()

    const store = useVaultStore()
    store.vaultPath = '/vault'
    store.fileTree = [
      { name: 'notes', path: '/vault/notes', is_dir: true, children: [{ name: 'a.md', path: '/vault/notes/a.md', is_dir: false }] },
    ]

    await store.initIndex()

    expect(indexerMock.buildIndex).toHaveBeenCalledTimes(1)
    expect(indexerMock.updateNote).toHaveBeenCalledTimes(1)
  })

  it('没有笔记但有参考资料时，参考资料仍会被索引', async () => {
    isReadyMock.mockReturnValue(true)
    indexerMock.loadFromStorage.mockReturnValue(false)
    setupReferenceDir()

    const store = useVaultStore()
    store.vaultPath = '/vault'
    store.fileTree = [] // 无 notes 目录

    await store.initIndex()

    expect(indexerMock.buildIndex).not.toHaveBeenCalled()
    expect(indexerMock.updateNote).toHaveBeenCalledTimes(1)
  })

  it('已索引且 updated 未变更的参考资料跳过，变更后重新索引', async () => {
    isReadyMock.mockReturnValue(true)
    indexerMock.loadFromStorage.mockReturnValue(true)
    setupReferenceDir()
    const updatedTime = new Date('2026-07-01T00:00:00.000Z').getTime()

    const store = useVaultStore()
    store.vaultPath = '/vault'

    // 已索引（indexedAt 晚于 updated）→ 跳过
    indexerMock.getAllEntries.mockReturnValue([
      { path: '/vault/references/r1.json', vector: [], indexedAt: updatedTime + 1000 },
    ])
    await store.initIndex()
    expect(indexerMock.updateNote).not.toHaveBeenCalled()

    // 参考资料被编辑（updated 晚于 indexedAt）→ 重新索引
    indexerMock.getAllEntries.mockReturnValue([
      { path: '/vault/references/r1.json', vector: [], indexedAt: updatedTime - 1000 },
    ])
    await store.initIndex()
    expect(indexerMock.updateNote).toHaveBeenCalledTimes(1)
  })
})
