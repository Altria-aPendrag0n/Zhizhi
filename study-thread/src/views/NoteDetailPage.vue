<template>
  <div class="note-detail-page">
    <div class="detail-layout">
      <!-- 主体 -->
      <main class="detail-main">
        <NoteDetail
          :note="currentNote"
          :loading="isLoading"
          @update="handleNoteUpdate"
          @open-source="handleOpenSource"
        />
      </main>

      <!-- 侧边栏：反链面板 -->
      <aside class="detail-sidebar">
        <Backlinks
          :backlinks="backlinks"
          :loading="loadingBacklinks"
          @navigate="handleNavigate"
        />
      </aside>
    </div>

    <!-- 关系图 -->
    <div class="detail-graph" v-if="currentNote">
      <LocalGraph :note-id="currentNote.path" :depth="1" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useNoteStore } from '../stores/notes'
import type { Note } from '../types'
import NoteDetail from '../components/notes/NoteDetail.vue'
import Backlinks, { type BacklinkEntry } from '../components/editor/Backlinks.vue'
import LocalGraph from '../components/graph/LocalGraph.vue'

const route = useRoute()
const router = useRouter()
const noteStore = useNoteStore()

const isLoading = ref(false)
const currentNote = ref<Note | null>(null)
const backlinks = ref<BacklinkEntry[]>([])
const loadingBacklinks = ref(false)

const noteId = computed(() => {
  return decodeURIComponent((route.params.id as string) || '')
})

async function loadNote() {
  if (!noteId.value) return
  isLoading.value = true
  try {
    const note = await noteStore.loadNote(noteId.value)
    currentNote.value = note
  } catch (e) {
    console.error('加载笔记失败:', e)
  } finally {
    isLoading.value = false
  }
}

async function loadBacklinks() {
  if (!noteId.value) return
  loadingBacklinks.value = true
  // 后续任务会实现实际的 backlink 扫描
  backlinks.value = []
  loadingBacklinks.value = false
}

function handleNoteUpdate(updated: Note) {
  currentNote.value = updated
  // 防抖保存到 vault（后续任务会完善）
}

function handleOpenSource(source: NonNullable<Note['source']>) {
  // 跳转到来源会话
  console.log('Open source:', source.session)
}

function handleNavigate(path: string) {
  router.push(`/notes/${encodeURIComponent(path)}`)
}

watch(
  () => route.params.id,
  () => {
    loadNote()
    loadBacklinks()
  },
  { immediate: true },
)
</script>

<style scoped>
.note-detail-page {
  height: 100%;
  overflow-y: auto;
  background: var(--surface);
}

.detail-layout {
  display: flex;
  min-height: 100%;
}

.detail-main {
  flex: 1;
  min-width: 0;
  padding: 34px 48px 64px;
}

.detail-sidebar {
  width: 310px;
  flex-shrink: 0;
  background: #f0eee7;
  border-left: 1px solid var(--line);
  overflow-y: auto;
}

.detail-graph {
  padding: 24px 48px 48px;
  border-top: 1px solid var(--line);
  background: var(--surface);
}
</style>