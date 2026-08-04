<template>
  <div class="note-list-container">
    <div class="notes-toolbar">
      <span>{{ filteredNotes.length }} 张笔记</span>
      <div class="toolbar-actions">
        <select v-model="sortBy" class="filter-select">
          <option value="updated">按最近更新</option>
          <option value="created">按创建时间</option>
          <option value="title">按标题</option>
        </select>
        <select v-model="filterType" class="filter-select">
          <option value="">全部类型</option>
          <option value="concept">概念卡</option>
          <option value="method">方法卡</option>
          <option value="fact">事实卡</option>
          <option value="question">问题卡</option>
        </select>
      </div>
    </div>

    <div class="search-bar">
      <input
        v-model="searchQuery"
        type="text"
        class="search-input"
        placeholder="搜索笔记标题或标签..."
      />
    </div>

    <div v-if="loading" class="notes-loading">
      <span class="notes-loading__dot" />
      <p>正在加载笔记…</p>
    </div>

    <div v-else-if="filteredNotes.length > 0" class="note-stack">
      <NoteCard
        v-for="note in filteredNotes"
        :key="note.path"
        :note="note"
        :is-selected="selectedPath === note.path"
        @select="$emit('select', $event)"
        @open-source="$emit('openSource', $event)"
        @contextmenu="openContextMenu($event, note.path)"
      />
    </div>

    <div v-else class="empty-state">
      <p v-if="notes.length === 0">还没有笔记，从学习对话中摘录你的第一条笔记吧</p>
      <p v-else>没有匹配的笔记，试试调整搜索条件</p>
    </div>

    <Teleport to="body">
      <div
        v-if="contextMenu"
        ref="contextMenuElement"
        class="note-context-menu"
        :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
        role="menu"
        @click.stop
      >
        <button class="is-danger" type="button" role="menuitem" @click="requestDelete">
          删除笔记
        </button>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { NoteMeta } from '../../types'
import NoteCard from './NoteCard.vue'

const props = defineProps<{
  notes: NoteMeta[]
  selectedPath?: string
  /** 笔记异步加载中：显示加载占位，避免"还没有笔记"空状态闪现 */
  loading?: boolean
}>()

const emit = defineEmits<{
  select: [path: string]
  openSource: [source: NonNullable<NoteMeta['source']>]
  delete: [path: string]
}>()

const sortBy = ref<'updated' | 'created' | 'title'>('updated')
const filterType = ref('')
const searchQuery = ref('')
const contextMenu = ref<{ path: string; x: number; y: number } | null>(null)
const contextMenuElement = ref<HTMLElement>()

const filteredNotes = computed(() => {
  let result = [...props.notes]

  if (filterType.value) {
    result = result.filter((n) => n.type === filterType.value)
  }

  if (searchQuery.value.trim()) {
    const q = searchQuery.value.trim().toLowerCase()
    result = result.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.tags.some((t) => t.toLowerCase().includes(q)),
    )
  }

  result.sort((a, b) => {
    switch (sortBy.value) {
      case 'created':
        return a.created.localeCompare(b.created)
      case 'title':
        return a.title.localeCompare(b.title)
      case 'updated':
      default:
        return b.updated.localeCompare(a.updated)
    }
  })

  return result
})

function openContextMenu(event: MouseEvent, path: string) {
  const menuWidth = 128
  const menuHeight = 44
  contextMenu.value = {
    path,
    x: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
    y: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8)),
  }
}

function closeContextMenu() {
  contextMenu.value = null
}

function requestDelete() {
  if (contextMenu.value) emit('delete', contextMenu.value.path)
  closeContextMenu()
}

function handleDocumentPointerDown(event: PointerEvent) {
  const target = event.target
  if (target instanceof Node && !contextMenuElement.value?.contains(target)) {
    closeContextMenu()
  }
}

function handleDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') closeContextMenu()
}

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown)
  document.addEventListener('keydown', handleDocumentKeydown)
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
  document.removeEventListener('keydown', handleDocumentKeydown)
})
</script>

<style scoped>
.note-list-container {
  max-width: 830px;
  margin: 0 auto;
}

.notes-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  color: var(--ink-2, #52635d);
  font-size: 12px;
}

.toolbar-actions {
  display: flex;
  gap: 8px;
}

.filter-select,
.search-input {
  border: 1px solid var(--line);
  border-radius: 7px;
  background: #fffefa;
  color: var(--ink);
  font: inherit;
}

.filter-select {
  padding: 6px 8px;
  font-size: 11px;
}

.search-bar {
  margin-bottom: 16px;
}

.search-input {
  box-sizing: border-box;
  width: 100%;
  padding: 10px 12px;
  outline: none;
}

.search-input:focus,
.filter-select:focus {
  border-color: var(--brand);
}

.note-stack {
  display: grid;
  gap: 12px;
}

.notes-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 64px 24px;
  color: var(--ink-2, #52635d);
  font-size: 13px;
}

.notes-loading__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--brand);
  animation: notes-loading-pulse 1s ease-in-out infinite;
}

@keyframes notes-loading-pulse {
  0%,
  100% {
    opacity: 0.35;
    transform: scale(0.85);
  }
  50% {
    opacity: 1;
    transform: scale(1.1);
  }
}

.empty-state {
  padding: 64px 24px;
  border: 1px dashed var(--line);
  border-radius: 12px;
  color: var(--ink-2, #52635d);
  text-align: center;
  font-size: 13px;
}

.note-context-menu {
  position: fixed;
  z-index: 1000;
  min-width: 128px;
  padding: 4px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface, #fffefa);
  box-shadow: 0 8px 24px rgba(20, 39, 33, 0.14);
}

.note-context-menu button {
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  text-align: left;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.note-context-menu button:hover {
  background: var(--surface-2, #f0eee7);
}

.note-context-menu .is-danger {
  color: #c2413b;
}
</style>
