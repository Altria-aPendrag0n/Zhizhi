<template>
  <div class="reference-list-container">
    <div class="refs-toolbar">
      <span>{{ filteredReferences.length }} 份参考资料</span>
      <div class="toolbar-actions">
        <select v-model="sortBy" class="filter-select" aria-label="参考资料排序">
          <option value="updated">按最近更新</option>
          <option value="title">按标题</option>
        </select>
        <button class="upload-btn" type="button" @click="fileInput?.click()">上传</button>
        <input
          ref="fileInput"
          type="file"
          accept=".md,.pdf,.png"
          multiple
          hidden
          @change="handleFileChange"
        />
      </div>
    </div>

    <div class="search-bar">
      <input
        v-model="searchQuery"
        type="text"
        class="search-input"
        placeholder="搜索标题、描述或标签..."
      />
    </div>

    <div v-if="filteredReferences.length > 0" class="ref-stack">
      <ReferenceCard
        v-for="reference in filteredReferences"
        :key="reference.path"
        :reference="reference"
        :is-selected="selectedPath === reference.path"
        @select="$emit('select', $event)"
        @contextmenu="openContextMenu($event, reference.path)"
        @retry-parse="$emit('retry-parse', $event)"
      />
    </div>

    <div v-else class="empty-state">
      <p v-if="references.length === 0">还没有参考资料，点击上方上传 md/pdf/png 文件</p>
      <p v-else>没有匹配的参考资料</p>
    </div>

    <Teleport to="body">
      <div
        v-if="contextMenu"
        ref="contextMenuElement"
        class="ref-context-menu"
        :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
        role="menu"
        @click.stop
      >
        <button class="is-danger" type="button" role="menuitem" @click="requestDelete">
          删除参考资料
        </button>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { ReferenceMeta } from '../../types'
import ReferenceCard from './ReferenceCard.vue'

const props = defineProps<{
  references: ReferenceMeta[]
  selectedPath?: string
}>()

const emit = defineEmits<{
  select: [path: string]
  upload: [files: File[]]
  delete: [path: string]
  'retry-parse': [path: string]
}>()

const sortBy = ref<'updated' | 'title'>('updated')
const searchQuery = ref('')
const contextMenu = ref<{ path: string; x: number; y: number } | null>(null)
const contextMenuElement = ref<HTMLElement>()
const fileInput = ref<HTMLInputElement>()

const filteredReferences = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  const result = props.references.filter((reference) => {
    if (!query) return true
    return (
      reference.title.toLowerCase().includes(query) ||
      (reference.description ?? '').toLowerCase().includes(query) ||
      reference.tags.some((tag) => tag.toLowerCase().includes(query))
    )
  })

  result.sort((a, b) => {
    if (sortBy.value === 'title') return a.title.localeCompare(b.title)
    return b.updated.localeCompare(a.updated)
  })

  return result
})

function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const files = input.files ? Array.from(input.files) : []
  try {
    input.value = ''
  } catch {
    // 某些环境对 file input 的 value 只读，忽略即可
  }
  if (files.length > 0) emit('upload', files)
}

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
.refs-toolbar {
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
  align-items: center;
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

.upload-btn {
  padding: 7px 14px;
  border: 1px solid var(--brand);
  border-radius: 7px;
  background: var(--brand);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.upload-btn:hover {
  border-color: var(--brand-strong);
  background: var(--brand-strong);
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

.ref-stack {
  display: grid;
  gap: 12px;
}

.empty-state {
  padding: 64px 24px;
  border: 1px dashed var(--line);
  border-radius: 12px;
  color: var(--ink-2, #52635d);
  text-align: center;
  font-size: 13px;
}

.ref-context-menu {
  position: fixed;
  z-index: 1000;
  min-width: 128px;
  padding: 4px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface, #fffefa);
  box-shadow: 0 8px 24px rgba(20, 39, 33, 0.14);
}

.ref-context-menu button {
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

.ref-context-menu button:hover {
  background: var(--surface-2, #f0eee7);
}

.ref-context-menu .is-danger {
  color: #c2413b;
}
</style>
