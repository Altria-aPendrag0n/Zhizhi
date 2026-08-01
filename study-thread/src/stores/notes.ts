import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as yaml from 'js-yaml'
import type { Note, NoteMeta, ExtractedNote } from '../types'
import { createDir, listDir, readFile, writeFile, deleteFile } from '../utils/vault-fs'
import { getNoteIndexer } from '../embedding/indexer'
import { parseFrontmatter } from '../parser/frontmatter'
import { serializeNote, generateNoteFileName } from '../utils/note-serializer'
import { loadStoredValue, saveStoredValue } from '../utils/local-storage'

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

async function collectNotes(entries: Awaited<ReturnType<typeof listDir>>): Promise<NoteMeta[]> {
  const notes = await Promise.all(entries.map(async (entry) => {
    if (entry.is_dir) return collectNotes(await listDir(entry.path))
    if (!entry.name.toLowerCase().endsWith('.md')) return []
    return [toNoteMeta(entry.path, entry.name, await readFile(entry.path))]
  }))
  return notes.flat()
}

export const useNoteStore = defineStore('notes', () => {
  const localNotes = ref<NoteMeta[]>(loadStoredValue<NoteMeta[]>(LOCAL_NOTES_KEY) ?? [])
  const notes = ref<NoteMeta[]>([...localNotes.value])
  const noteIndex = ref<Map<string, Note>>(new Map())
  const isLoading = ref(false)
  const currentVaultPath = ref<string | null>(null)

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
      const meta = toNoteMeta(path, path.split(/[\\/]/).pop() || '', content)
      const { body } = parseFrontmatter(content)
      const note: Note = {
        ...meta,
        type: meta.type as Note['type'],
        confidence: 0,
        review: { next: null, interval: 0, mastery: 0 },
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
      const savedNote: Note = { ...note, ...noteMeta, type: noteMeta.type as Note['type'], updated }
      noteIndex.value.set(note.path, savedNote)
      upsertLocalNote(noteMeta)
      notes.value = sortNotes([...notes.value.filter((item) => item.path !== note.path), noteMeta])
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
      upsertLocalNote(noteMeta)
      notes.value = sortNotes([...notes.value.filter((item) => item.path !== filePath), noteMeta])
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
      localNotes.value = localNotes.value.filter((note) => note.path !== path)
      syncLocalNotes()
      notes.value = notes.value.filter((note) => note.path !== path)
      noteIndex.value.delete(path)
      getNoteIndexer().removeNote(path)
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
    noteCount,
    notesByType,
    loadLocalNotes,
    loadAllNotes,
    loadNote,
    updateNote,
    saveNote,
    deleteNote,
    refreshIndex,
  }
})
