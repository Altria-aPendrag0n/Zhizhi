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
          <div class="thread-list__item-main">
            <div class="thread-list__item-text">
              <span class="thread-list__item-title">{{ thread.title }}</span>
              <span class="thread-list__item-meta">{{ thread.meta }}</span>
            </div>
            <button
              v-if="threadBranches(thread.id).length > 0"
              type="button"
              class="thread-list__item-toggle"
              :aria-label="isThreadExpanded(thread.id) ? '收起分支' : '展开分支'"
              @click.stop="toggleThread(thread.id)"
            >
              <ChevronRight v-if="!isThreadExpanded(thread.id)" :size="14" />
              <ChevronDown v-else :size="14" />
            </button>
          </div>
        </template>
        <ul
          v-if="isThreadExpanded(thread.id) && threadBranches(thread.id).length > 0"
          class="thread-list__branches"
          @click.stop
          @contextmenu.stop
        >
          <ThreadBranch
            v-for="branch in threadBranches(thread.id)"
            :key="branch.id"
            :node="branch"
            :session-id="thread.id"
            :depth="0"
            :active-branch-id="activeBranchId"
            @open-branch="handleOpenBranch"
            @menu="openBranchMenu"
          />
        </ul>
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
    <Teleport to="body">
      <div
        v-if="branchMenu"
        ref="branchMenuElement"
        class="thread-list__context-menu"
        :style="{ left: `${branchMenu.x}px`, top: `${branchMenu.y}px` }"
        role="menu"
        @click.stop
      >
        <button class="is-danger" type="button" role="menuitem" @click="confirmDeleteBranch">
          <Trash2 :size="15" :stroke-width="1.8" />
          删除分支
        </button>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import { Pencil, SquarePen, Trash2, ChevronRight, ChevronDown } from '@lucide/vue'
import type { SessionTreeNode } from '../../utils/session-tree'
import ThreadBranch from './ThreadBranch.vue'

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
  'open-branch': [sessionId: string, branchId: string]
  'delete-branch': [sessionId: string, branchId: string]
}>()

const props = defineProps<{
  projectName: string
  threads: Thread[]
  activeId: string | null
  threadCount: number
  noteCount: number
  /** 主会话 id → 顶层分支列表（来自 vault 会话树） */
  branches?: Record<string, SessionTreeNode[]>
  /** 当前激活的分支 id（高亮用） */
  activeBranchId?: string | null
}>()

const contextMenu = ref<{ id: string; x: number; y: number } | null>(null)
const contextMenuElement = ref<HTMLElement>()
/** 分支右键菜单（删除分支） */
const branchMenu = ref<{ sessionId: string; branchId: string; x: number; y: number } | null>(null)
const branchMenuElement = ref<HTMLElement>()
const editingThreadId = ref<string | null>(null)
const draftTitle = ref('')
const titleInput = ref<HTMLInputElement[] | HTMLInputElement>()
/** 已展开分支树的主会话 id 集合 */
const expandedThreads = ref<Set<string>>(new Set())

function threadBranches(threadId: string): SessionTreeNode[] {
  return props.branches?.[threadId] ?? []
}

function isThreadExpanded(threadId: string): boolean {
  return expandedThreads.value.has(threadId)
}

function toggleThread(threadId: string) {
  const next = new Set(expandedThreads.value)
  if (next.has(threadId)) next.delete(threadId)
  else next.add(threadId)
  expandedThreads.value = next
}

function handleOpenBranch(sessionId: string, branchId: string) {
  emit('open-branch', sessionId, branchId)
}

function openBranchMenu(payload: { sessionId: string; branchId: string; x: number; y: number }) {
  branchMenu.value = payload
}

function closeBranchMenu() {
  branchMenu.value = null
}

function confirmDeleteBranch() {
  if (branchMenu.value) {
    emit('delete-branch', branchMenu.value.sessionId, branchMenu.value.branchId)
  }
  closeBranchMenu()
}

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
  if (target instanceof Node) {
    if (!contextMenuElement.value?.contains(target)) closeContextMenu()
    if (!branchMenuElement.value?.contains(target)) closeBranchMenu()
  }
}

function handleDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    closeContextMenu()
    closeBranchMenu()
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
  /* 禁止横向滚动：长标题以容器右缘（滚动条位置）为边界截断 */
  overflow-x: hidden;
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

.thread-list__item-main {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.thread-list__item-text {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 3px;
}

.thread-list__item-toggle {
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  border: 0;
  border-radius: 6px;
  color: var(--ink-3);
  background: transparent;
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease;
}

.thread-list__item-toggle:hover {
  color: var(--brand);
  background: var(--brand-soft);
}

.thread-list__branches {
  margin: 0;
  padding: 2px 0 0;
  /* grid 子项默认 min-width:auto 会被长内容撑开，允许收缩以贴合滚动条边界 */
  min-width: 0;
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
  display: block;
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
