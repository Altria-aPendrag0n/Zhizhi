<template>
  <div class="note-list-container">
    <div class="notes-toolbar">
      <div class="toolbar-left">
        <div class="new-note-wrap">
          <button class="new-note-btn" type="button" @click.stop="toggleCreateMenu">
            <Plus :size="14" />
            <span>新建笔记</span>
          </button>
          <Teleport to="body">
            <div
              v-if="createMenuVisible"
              ref="createMenuElement"
              class="new-note-menu"
              role="menu"
              @click.stop
            >
              <button type="button" role="menuitem" @click="requestCreateFromImage">
                从图片导入
              </button>
            </div>
          </Teleport>
        </div>
        <span>{{ filteredNotes.length }} 张笔记</span>
      </div>
      <div class="toolbar-actions">
        <select v-model="sortBy" class="filter-select">
          <option value="updated">按最近更新</option>
          <option value="created">按创建时间</option>
          <option value="title">按标题</option>
        </select>
        <input
          v-model="filterTag"
          type="text"
          class="filter-select tag-filter-input"
          list="note-tags"
          placeholder="按标签筛选..."
          title="输入标签筛选笔记，多个标签用逗号或空格分隔（需同时包含）；支持单字/子串匹配（如'虾'命中'淡水虾'）与拼音匹配（如'xia'、'dsx'）"
        />
        <datalist id="note-tags">
          <option v-for="tag in allTags" :key="tag" :value="tag" />
        </datalist>
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

    <!-- 仅当没有任何可展示笔记时才显示加载占位：已有缓存笔记时立即渲染，
         避免每次进入资料库都闪现“正在加载笔记…”的中间态 -->
    <div v-if="loading && notes.length === 0" class="notes-loading">
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
import { Plus } from '@lucide/vue'
import type { NoteMeta } from '../../types'
import NoteCard from './NoteCard.vue'
import { tagMatchesQuery } from '../../utils/pinyin-match'

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
  'create-from-image': []
}>()

const sortBy = ref<'updated' | 'created' | 'title'>('updated')
const filterTag = ref('')
const searchQuery = ref('')
const contextMenu = ref<{ path: string; x: number; y: number } | null>(null)
const contextMenuElement = ref<HTMLElement>()
const createMenuVisible = ref(false)
const createMenuElement = ref<HTMLElement>()

// 汇总所有笔记标签（去重排序），用于筛选输入框的提示
const allTags = computed(() => {
  const set = new Set<string>()
  for (const note of props.notes) note.tags.forEach((t) => set.add(t))
  return [...set].sort((a, b) => a.localeCompare(b, 'zh'))
})

const filteredNotes = computed(() => {
  let result = [...props.notes]

  // 标签筛选：逗号/空格分隔多个条件，笔记需同时满足全部（AND）；
  // 每个条件支持单字/子串匹配（如 '虾' 命中 '淡水虾'）与拼音匹配（全拼/首字母）
  const tagQuery = filterTag.value.trim()
  if (tagQuery) {
    const queries = tagQuery
      .split(/[,，\s]+/)
      .map((t) => t.trim())
      .filter(Boolean)
    if (queries.length > 0) {
      result = result.filter((note) =>
        queries.every((q) => note.tags.some((tag) => tagMatchesQuery(tag, q))),
      )
    }
  }

  if (searchQuery.value.trim()) {
    const q = searchQuery.value.trim()
    result = result.filter(
      (n) => tagMatchesQuery(n.title, q) || n.tags.some((tag) => tagMatchesQuery(tag, q)),
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

function toggleCreateMenu() {
  createMenuVisible.value = !createMenuVisible.value
}

function closeCreateMenu() {
  createMenuVisible.value = false
}

function requestCreateFromImage() {
  closeCreateMenu()
  emit('create-from-image')
}

function handleDocumentPointerDown(event: PointerEvent) {
  const target = event.target
  if (target instanceof Node && !contextMenuElement.value?.contains(target) && !createMenuElement.value?.contains(target)) {
    closeContextMenu()
    closeCreateMenu()
  }
}

function handleDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    closeContextMenu()
    closeCreateMenu()
  }
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
  width: 100%;
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

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.new-note-wrap {
  position: relative;
}

.new-note-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  border: 1px solid var(--brand);
  border-radius: 7px;
  background: var(--brand);
  color: #fff;
  font: inherit;
  font-size: 12px;
  font-weight: 590;
  cursor: pointer;
  transition: background 0.15s;
}

.new-note-btn:hover {
  background: var(--brand-strong);
}

.new-note-menu {
  position: fixed;
  z-index: 1000;
  min-width: 128px;
  padding: 4px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface, #fffefa);
  box-shadow: 0 8px 24px rgba(20, 39, 33, 0.14);
}

.new-note-menu button {
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

.new-note-menu button:hover {
  background: var(--surface-2, #f0eee7);
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

.tag-filter-input {
  width: 148px;
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
