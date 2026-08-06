<template>
  <li class="thread-branch">
    <div
      class="thread-branch__row"
      :class="{ 'is-active': node.id === activeBranchId }"
      :style="{ paddingLeft: `${depth * 14 + 8}px` }"
      @click="openBranch"
      @contextmenu.prevent="openMenu"
    >
      <GitBranch :size="13" class="thread-branch__icon" />
      <span class="thread-branch__title">{{ node.title }}</span>
      <button
        v-if="node.children.length > 0"
        type="button"
        class="thread-branch__toggle"
        :aria-label="expanded ? '收起子分支' : '展开子分支'"
        @click.stop="expanded = !expanded"
      >
        <ChevronRight v-if="!expanded" :size="12" />
        <ChevronDown v-else :size="12" />
      </button>
    </div>
    <ul v-if="expanded && node.children.length > 0" class="thread-branch__children">
      <ThreadBranch
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :session-id="sessionId"
        :depth="depth + 1"
        :active-branch-id="activeBranchId"
        @open-branch="handleChildOpen"
      />
    </ul>
  </li>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { SessionTreeNode } from '../../utils/session-tree'
import { ChevronRight, ChevronDown, GitBranch } from '@lucide/vue'

const props = defineProps<{
  node: SessionTreeNode
  /** 所属主会话 id（跳转分支会话时使用） */
  sessionId: string
  depth: number
  activeBranchId?: string | null
}>()

const emit = defineEmits<{
  'open-branch': [sessionId: string, branchId: string]
  menu: [payload: { sessionId: string; branchId: string; x: number; y: number }]
}>()

const expanded = ref(false)

function openBranch() {
  emit('open-branch', props.sessionId, props.node.id)
}

function openMenu(event: MouseEvent) {
  emit('menu', {
    sessionId: props.sessionId,
    branchId: props.node.id,
    x: event.clientX,
    y: event.clientY,
  })
}

function handleChildOpen(sessionId: string, branchId: string) {
  emit('open-branch', sessionId, branchId)
}
</script>

<style scoped>
.thread-branch {
  list-style: none;
}

.thread-branch__row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 7px;
  cursor: pointer;
  transition: background 0.15s;
}

.thread-branch__row:hover {
  background: var(--brand-soft);
}

.thread-branch__row.is-active {
  background: var(--brand-soft);
}

.thread-branch__row.is-active .thread-branch__title {
  color: var(--brand);
  font-weight: 650;
}

.thread-branch__row.is-active .thread-branch__icon {
  color: var(--brand);
}

.thread-branch__icon {
  flex-shrink: 0;
  color: var(--ink-3);
}

.thread-branch__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: 12px;
  font-weight: 520;
  color: var(--ink);
  white-space: nowrap;
  /* 文本超出时在接近容器右缘（滚动条位置）处渐变消失 */
  -webkit-mask-image: linear-gradient(to right, #000 62%, transparent 96%);
  mask-image: linear-gradient(to right, #000 62%, transparent 96%);
}

.thread-branch__toggle {
  display: inline-grid;
  place-items: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  border: 0;
  border-radius: 4px;
  color: var(--ink-3);
  background: transparent;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.thread-branch__toggle:hover {
  color: var(--brand);
  background: var(--brand-soft);
}

.thread-branch__children {
  margin: 0;
  padding: 0;
}
</style>
