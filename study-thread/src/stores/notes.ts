import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Note, NoteMeta, ExtractedNote } from '../types'
import { writeFile, createDir } from '../utils/vault-fs'
import { serializeNote, generateNoteFileName } from '../utils/note-serializer'

export const useNoteStore = defineStore('notes', () => {
  const notes = ref<NoteMeta[]>([])
  const noteIndex = ref<Map<string, Note>>(new Map())
  const isLoading = ref(false)

  const noteCount = computed(() => notes.value.length)

  const notesByType = computed(() => {
    const grouped: Record<string, NoteMeta[]> = {
      concept: [],
      method: [],
      fact: [],
      question: [],
    }
    for (const note of notes.value) {
      if (grouped[note.type]) {
        grouped[note.type].push(note)
      }
    }
    return grouped
  })

  async function loadAllNotes() {
    isLoading.value = true
    // 后续任务会实现从 vault 读取
    isLoading.value = false
  }

  async function loadNote(path: string): Promise<Note | null> {
    return noteIndex.value.get(path) || null
  }

  /**
   * 保存笔记到 vault
   *
   * @param vaultPath - vault 根路径
   * @param note - 提取的笔记数据
   * @param sourceSession - 来源会话路径
   * @param highlightSource - 来源划线文本
   * @returns 笔记文件路径
   */
  async function saveNote(
    vaultPath: string,
    note: ExtractedNote,
    sourceSession: string,
    highlightSource: string,
  ): Promise<string | null> {
    try {
      const notesDir = `${vaultPath}/notes`
      await createDir(notesDir)

      const content = serializeNote(note, sourceSession, highlightSource)
      const fileName = generateNoteFileName(note.title)
      const filePath = `${notesDir}/${fileName}`

      await writeFile(filePath, content)

      // 更新本地列表
      const noteMeta: NoteMeta = {
        path: filePath,
        title: note.title,
        type: note.type,
        tags: note.tags,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      }

      const existingIndex = notes.value.findIndex((n) => n.path === filePath)
      if (existingIndex >= 0) {
        notes.value[existingIndex] = noteMeta
      } else {
        notes.value.push(noteMeta)
      }

      return filePath
    } catch (e) {
      console.error('保存笔记失败:', e)
      return null
    }
  }

  async function refreshIndex() {
    // 后续任务会实现
  }

  return {
    notes,
    noteIndex,
    isLoading,
    noteCount,
    notesByType,
    loadAllNotes,
    loadNote,
    saveNote,
    refreshIndex,
  }
})