<template>
  <div class="thread-list">
    <header class="thread-list__head">
      <h2 class="thread-list__title">{{ projectName }}</h2>
      <button class="thread-list__icon-btn" type="button" aria-label="新建会话" @click="$emit('new-thread')">
        <SquarePen :size="17" :stroke-width="1.75" />
      </button>
    </header>
    <ul v-if="threads.length > 0" class="thread-list__items">
      <li
        v-for="thread in threads"
        :key="thread.id"
        class="thread-list__item"
        :class="{ 'is-active': thread.id === activeId }"
        @click="selectThread(thread.id)"
        @contextmenu.prevent="openContextMenu($event, thread.id)"
      >
        <template v-if="editingThreadId === thread.id">
          <input
            ref="titleInput"
            v-model="draftTitle"
            class="thread-list__title-input"
            aria-label="会话标题"
            @click.stop
            @blur="cancelEditing"
            @keydown.enter.prevent="saveEditing"
            @keydown.escape.prevent="cancelEditing"
          />
          <span class="thread-list__editing-hint">Enter 确认 · Esc 取消</span>
        </template>
        <template v-else>
          <span class="thread-list__item-title">{{ thread.title }}</span>
          <span class="thread-list__item-meta">{{ thread.meta }}</span>
        </template>
      </li>
    </ul>
    <div v-else class="thread-list__empty">
      <p class="text-muted-foreground text-sm">暂无会话</p>
    </div>
    <footer class="thread-list__footer">
      <span>{{ threadCount }} 个会话</span>
      <span>{{ noteCount }} 张笔记</span>
    </footer>
    <Teleport to="body">
      <div
        v-if="contextMenu"
        ref="contextMenuElement"
        class="thread-list__context-menu"
        :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
        role="menu"
        @click.stop
      >
        <button type="button" role="menuitem" @click="startEditing">
          <Pencil :size="15" :stroke-width="1.8" />
          编辑标题
        </button>
        <button class="is-danger" type="button" role="menuitem" @click="deleteThread">
          <Trash2 :size="15" :stroke-width="1.8" />
          删除会话
        </button>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import { Pencil, SquarePen, Trash2 } from '@lucide/vue'

export interface Thread {
  id: string
  title: string
  meta: string
}

const emit = defineEmits<{
  select: [id: string]
  rename: [id: string, title: string]
  delete: [id: string]
  'new-thread': []
}>()

const props = defineProps<{
  projectName: string
  threads: Thread[]
  activeId: string | null
  threadCount: number
  noteCount: number
}>()

const contextMenu = ref<{ id: string; x: number; y: number } | null>(null)
const contextMenuElement = ref<HTMLElement>()
const editingThreadId = ref<string | null>(null)
const draftTitle = ref('')
const titleInput = ref<HTMLInputElement[] | HTMLInputElement>()

function openContextMenu(event: MouseEvent, id: string) {
  const menuWidth = 144
  const menuHeight = 84
  contextMenu.value = {
    id,
    x: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
    y: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8)),
  }
}

function closeContextMenu() {
  contextMenu.value = null
}

function selectThread(id: string) {
  if (editingThreadId.value !== id) {
    emit('select', id)
  }
}

function startEditing() {
  const thread = props.threads.find((item) => item.id === contextMenu.value?.id)
  if (!thread) return

  editingThreadId.value = thread.id
  draftTitle.value = thread.title
  closeContextMenu()
  nextTick(() => {
    const input = Array.isArray(titleInput.value) ? titleInput.value[0] : titleInput.value
    input?.select()
  })
}

function saveEditing() {
  const id = editingThreadId.value
  const title = draftTitle.value.trim()
  editingThreadId.value = null
  if (id && title) {
    emit('rename', id, title)
  }
}

function cancelEditing() {
  editingThreadId.value = null
}

function deleteThread() {
  if (contextMenu.value) {
    emit('delete', contextMenu.value.id)
  }
  closeContextMenu()
}

function handleDocumentPointerDown(event: PointerEvent) {
  const target = event.target
  if (target instanceof Node && !contextMenuElement.value?.contains(target)) {
    closeContextMenu()
  }
}

function handleDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    closeContextMenu()
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
.thread-list {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
}

.thread-list__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 60px;
  padding: 0 14px 0 18px;
  border-bottom: 1px solid var(--line);
}

.thread-list__title {
  margin: 0;
  font-size: 14px;
  font-weight: 650;
  letter-spacing: 0.01em;
}

.thread-list__icon-btn {
  display: inline-grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 8px;
  color: var(--ink-3);
  background: transparent;
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease;
}

.thread-list__icon-btn:hover {
  color: var(--brand);
  background: var(--brand-soft);
}

.thread-list__items {
  flex: 1;
  display: grid;
  gap: 3px;
  align-content: start;
  margin: 0;
  padding: 12px 8px;
  overflow-y: auto;
  list-style: none;
}

.thread-list__item {
  display: grid;
  gap: 4px;
  padding: 11px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.18s ease;
}

.thread-list__item:hover {
  background: var(--brand-soft);
}

.thread-list__item.is-active {
  background: var(--brand-soft);
}

.thread-list__item.is-active .thread-list__item-meta {
  color: var(--brand);
}

.thread-list__item-title {
  overflow: hidden;
  font-size: 13px;
  font-weight: 590;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.thread-list__item.is-active .thread-list__item-title {
  font-weight: 650;
}

.thread-list__item-meta,
.thread-list__editing-hint {
  color: var(--ink-2);
  font-size: 11px;
}

.thread-list__title-input {
  width: 100%;
  box-sizing: border-box;
  padding: 5px 7px;
  border: 1px solid var(--brand);
  border-radius: 6px;
  outline: none;
  color: var(--ink);
  background: var(--surface);
  font: inherit;
}

.thread-list__empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.thread-list__footer {
  display: flex;
  justify-content: space-between;
  padding: 14px 16px;
  border-top: 1px solid var(--line);
  color: var(--ink-2);
  font-size: 11px;
  line-height: 1.6;
}
</style>

<style>
.thread-list__context-menu {
  position: fixed;
  z-index: 1000;
  display: grid;
  min-width: 144px;
  padding: 4px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14);
}

.thread-list__context-menu button {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-radius: 5px;
  color: var(--ink);
  background: transparent;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.thread-list__context-menu button:hover {
  background: var(--brand-soft);
}

.thread-list__context-menu button.is-danger {
  color: var(--state-error);
}

.thread-list__context-menu button.is-danger:hover {
  background: color-mix(in srgb, var(--state-error) 10%, transparent);
}
</style>
