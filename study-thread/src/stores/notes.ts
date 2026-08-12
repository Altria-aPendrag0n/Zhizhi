import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as yaml from 'js-yaml'
import type { Note, NoteMeta, ExtractedNote } from '../types'
import { createDir, listDir, readFile, writeFile, deleteFile } from '../utils/vault-fs'
import { getNoteIndexer } from '../embedding/indexer'
import { parseFrontmatter } from '../parser/frontmatter'
import { extractAllLinks } from '../parser/wikilink'
import {
  serializeNote,
  generateNoteFileName,
  getNoteMetaPath,
  serializeNoteMeta,
  parseNoteMetaFile,
} from '../utils/note-serializer'
import { removeSessionReferences } from '../utils/session-linker'
import { loadStoredValue, saveStoredValue } from '../utils/local-storage'
import { createReviewTask } from '../utils/review-scheduler'
import { invalidateLearnerLinkCache } from '../utils/learner-note-link'
import { useReviewStore } from './review'

const LOCAL_NOTES_KEY = 'study-thread-extracted-notes'

function toString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function toTags(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === 'string') : []
}

function toNoteMeta(path: string, fileName: string, content: string): NoteMeta {
  const { meta } = parseFrontmatter(content)
  const source = meta.source
  const created = toString(meta.created)
  const updated = toString(meta.updated)
  return {
    path,
    title: toString(meta.title) || fileName.replace(/\.md$/, ''),
    description: toString(meta.description) || undefined,
    type: toString(meta.type) || 'concept',
    tags: toTags(meta.tags),
    // 时间字段兜底：缺失的 created/updated 互相回退，确保列表排序与展示始终有可解析值
    created: created || updated,
    updated: updated || created,
    proposition: toString(meta.proposition) || undefined,
    source: source && typeof source === 'object' && !Array.isArray(source)
      ? {
          session: toString((source as Record<string, unknown>).session),
          highlight: toString((source as Record<string, unknown>).highlight),
        }
      : undefined,
  }
}

function sortNotes(notes: NoteMeta[]): NoteMeta[] {
  return [...notes].sort((a, b) => b.updated.localeCompare(a.updated))
}

function normalizePath(path: string): string {
  const parts: string[] = []
  for (const part of path.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      parts.pop()
      continue
    }
    parts.push(part)
  }
  return parts.join('/').toLowerCase()
}

/**
 * 读取笔记元数据：json sidecar 优先（结构化元数据权威源），
 * 缺失或无效时回退 md frontmatter（兼容 json 方案之前的旧笔记）。
 */
async function readNoteMeta(path: string, fileName: string, mdContent: string): Promise<NoteMeta> {
  try {
    const parsed = parseNoteMetaFile(await readFile(getNoteMetaPath(path)))
    if (parsed) return { ...parsed, path }
  } catch {
    // json 缺失/损坏，回退 frontmatter
  }
  return toNoteMeta(path, fileName, mdContent)
}

async function collectNotes(entries: Awaited<ReturnType<typeof listDir>>): Promise<NoteMeta[]> {
  const notes = await Promise.all(entries.map(async (entry) => {
    if (entry.is_dir) return collectNotes(await listDir(entry.path))
    if (!entry.name.toLowerCase().endsWith('.md')) return []
    const content = await readFile(entry.path)
    return [await readNoteMeta(entry.path, entry.name, content)]
  }))
  return notes.flat()
}

export const useNoteStore = defineStore('notes', () => {
  const localNotes = ref<NoteMeta[]>(loadStoredValue<NoteMeta[]>(LOCAL_NOTES_KEY) ?? [])
  const notes = ref<NoteMeta[]>([...localNotes.value])
  const noteIndex = ref<Map<string, Note>>(new Map())
  const isLoading = ref(false)
  const currentVaultPath = ref<string | null>(null)
  /** 最近一次被删除的笔记路径（聊天页 watch 后刷新会话中的笔记引用，避免残留已删除笔记） */
  const lastDeletedNotePath = ref<string | null>(null)

  const noteCount = computed(() => notes.value.length)
  const notesByType = computed(() => {
    const grouped: Record<string, NoteMeta[]> = { concept: [], method: [], fact: [], question: [] }
    for (const note of notes.value) {
      if (grouped[note.type]) grouped[note.type].push(note)
    }
    return grouped
  })

  function syncLocalNotes() {
    saveStoredValue(LOCAL_NOTES_KEY, localNotes.value)
  }

  function loadLocalNotes() {
    localNotes.value = loadStoredValue<NoteMeta[]>(LOCAL_NOTES_KEY) ?? []
  }

  function upsertLocalNote(note: NoteMeta) {
    const index = localNotes.value.findIndex((item) => item.path === note.path)
    if (index >= 0) localNotes.value[index] = note
    else localNotes.value.unshift(note)
    syncLocalNotes()
  }

  async function loadAllNotes(vaultPath: string) {
    isLoading.value = true
    try {
      currentVaultPath.value = vaultPath
      const vaultNotes = await collectNotes(await listDir(`${vaultPath}/notes`))
      const vaultNotePaths = new Set(vaultNotes.map((note) => note.path))
      localNotes.value = localNotes.value.filter((note) => vaultNotePaths.has(note.path))
      syncLocalNotes()
      notes.value = sortNotes(vaultNotes)
    } catch {
      notes.value = []
    } finally {
      isLoading.value = false
    }
  }

  async function loadNote(path: string): Promise<Note | null> {
    const cached = noteIndex.value.get(path)
    if (cached) return cached
    try {
      const content = await readFile(path)
      const fileName = path.split(/[\\/]/).pop() || ''
      const meta = await readNoteMeta(path, fileName, content)
      const { body } = parseFrontmatter(content)
      // 复习状态从复习队列镜像（权威数据在 review store 的 review-state.json）
      const queued = useReviewStore().queue.find((item) => item.notePath === path)
      const note: Note = {
        ...meta,
        type: meta.type as Note['type'],
        confidence: 0,
        review: queued
          ? { next: queued.dueAt, interval: queued.interval, mastery: queued.mastery }
          : { next: null, interval: 0, mastery: 0 },
        content: body,
      }
      noteIndex.value.set(path, note)
      return note
    } catch {
      return null
    }
  }

  async function updateNote(note: Note): Promise<Note | null> {
    try {
      const originalContent = await readFile(note.path)
      const { meta } = parseFrontmatter(originalContent)
      const updated = new Date().toISOString()
      const content = `---\n${yaml.dump({ ...meta, title: note.title, tags: note.tags, updated }).trimEnd()}\n---\n\n${note.content}`
      await writeFile(note.path, content)
      const noteMeta = toNoteMeta(note.path, note.path.split(/[\\/]/).pop() || '', content)
      // json sidecar 同步更新（元数据权威源，含关联笔记 links）
      await writeFile(getNoteMetaPath(note.path), serializeNoteMeta(noteMeta, extractAllLinks(note.content)))
      const savedNote: Note = { ...note, ...noteMeta, type: noteMeta.type as Note['type'], updated }
      noteIndex.value.set(note.path, savedNote)
      upsertLocalNote(noteMeta)
      notes.value = sortNotes([...notes.value.filter((item) => item.path !== note.path), noteMeta])
      // 笔记变更 → 画像概念映射缓存失效，下次读取时重新计算
      if (currentVaultPath.value) invalidateLearnerLinkCache(currentVaultPath.value)
      return savedNote
    } catch (error) {
      console.error('更新笔记失败:', error)
      return null
    }
  }

  async function saveNote(
    vaultPath: string | null,
    note: ExtractedNote,
    sourceSession: string,
    highlightSource: string,
  ): Promise<string | null> {
    if (!vaultPath) return null
    currentVaultPath.value = vaultPath
    try {
      const notesDir = `${vaultPath}/notes`
      await createDir(notesDir)
      const filePath = `${notesDir}/${generateNoteFileName(note.title)}`
      await writeFile(filePath, serializeNote(note, sourceSession, highlightSource))
      const now = new Date().toISOString()
      const noteMeta: NoteMeta = {
        path: filePath,
        title: note.title,
        type: note.type,
        tags: note.tags,
        created: now,
        updated: now,
        proposition: note.proposition,
        source: { session: sourceSession, highlight: highlightSource },
      }
      // json sidecar：结构化元数据权威源（时间/标签/描述/来源/关联笔记），
      // md 内 frontmatter 保留供 Obsidian 查看，读取时 json 优先
      await writeFile(getNoteMetaPath(filePath), serializeNoteMeta(noteMeta, extractAllLinks(highlightSource)))
      upsertLocalNote(noteMeta)
      notes.value = sortNotes([...notes.value.filter((item) => item.path !== filePath), noteMeta])
      // 笔记变更 → 画像概念映射缓存失效
      if (vaultPath) invalidateLearnerLinkCache(vaultPath)
      // 新笔记进入复习队列（当天到期），失败不影响笔记保存
      try {
        await useReviewStore().enqueue(createReviewTask(filePath, note.title, note.type))
      } catch (error) {
        console.error('加入复习队列失败:', error)
      }
      return filePath
    } catch (e) {
      console.error('保存笔记失败:', e)
      return null
    }
  }

  async function deleteNote(path: string): Promise<boolean> {
    const vaultPath = currentVaultPath.value
    const notesPath = vaultPath ? `${normalizePath(vaultPath)}/notes/` : ''
    const normalizedPath = normalizePath(path)
    if (!notesPath || !normalizedPath.startsWith(notesPath) || !normalizedPath.endsWith('.md')) return false

    try {
      await deleteFile(path)
      try {
        // 级联删除 json sidecar（元数据文件，可能不存在则忽略）
        await deleteFile(getNoteMetaPath(path))
      } catch {
        // json 不存在不影响删除结果
      }
      localNotes.value = localNotes.value.filter((note) => note.path !== path)
      syncLocalNotes()
      notes.value = notes.value.filter((note) => note.path !== path)
      noteIndex.value.delete(path)
      getNoteIndexer().removeNote(path)
      // 笔记删除 → 画像概念映射缓存失效
      if (vaultPath) invalidateLearnerLinkCache(vaultPath)
      // 清理会话文件中对被删笔记的引用行（划线虚线标记）
      if (vaultPath) {
        try {
          await removeSessionReferences(vaultPath, [path], 'note')
        } catch {
          // 引用清理失败不影响删除结果
        }
      }
      // 从复习队列级联移除，失败不影响删除结果
      try {
        await useReviewStore().removeFromQueue(path)
      } catch {
        // 复习队列清理失败不影响删除结果
      }
      // 通知聊天页等已挂载界面刷新引用（组件实例可能因路由 key 相同而复用，不会重新解析）
      lastDeletedNotePath.value = path
      return true
    } catch (error) {
      console.error('删除笔记失败:', error)
      return false
    }
  }

  async function refreshIndex(vaultPath: string) {
    await loadAllNotes(vaultPath)
  }

  return {
    notes,
    noteIndex,
    isLoading,
    currentVaultPath,
    noteCount,
    notesByType,
    lastDeletedNotePath,
    loadLocalNotes,
    loadAllNotes,
    loadNote,
    updateNote,
    saveNote,
    deleteNote,
    refreshIndex,
  }
})
