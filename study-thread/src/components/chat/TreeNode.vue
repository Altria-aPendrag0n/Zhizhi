<template>
  <div class="tree-node">
    <div
      class="tree-node__row"
      :style="{ paddingLeft: depth * 20 + 'px' }"
      @click="$emit('select', node.id)"
    >
      <span class="tree-node__icon">
        <MessageSquare v-if="node.type === 'message'" :size="14" />
        <GitBranch v-else :size="14" />
      </span>
      <span class="tree-node__title">{{ node.title }}</span>
      <span class="tree-node__meta">· {{ formatDate(node.created) }}</span>
    </div>
    <TreeNode
      v-for="child in node.children"
      :key="child.id"
      :node="child"
      :depth="depth + 1"
      @select="$emit('select', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import type { SessionTreeNode } from '../../utils/session-tree'
import { MessageSquare, GitBranch } from '@lucide/vue'

defineProps<{
  node: SessionTreeNode
  depth: number
}>()

defineEmits<{
  select: [nodeId: string]
}>()

function formatDate(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}
</script>

<style scoped>
.tree-node__row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
  font-size: 13px;
}

.tree-node__row:hover {
  background: var(--surface-2);
}

.tree-node__icon {
  color: var(--ink-3);
  flex-shrink: 0;
}

.tree-node__title {
  color: var(--ink);
  font-weight: 500;
}

.tree-node__meta {
  color: var(--ink-3);
  font-size: 11px;
  white-space: nowrap;
}
</style>