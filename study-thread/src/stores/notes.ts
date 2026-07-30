import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Note, NoteMeta } from '../types'

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
    // 后续任务会实现
    return noteIndex.value.get(path) || null
  }

  async function saveNote(_path: string, _content: string) {
    // 后续任务会实现
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