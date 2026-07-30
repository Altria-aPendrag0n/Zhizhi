<template>
  <div class="branch-tree">
    <div class="branch-tree__header">
      <h3 class="branch-tree__title">会话树</h3>
      <span class="branch-tree__count">{{ nodeCount }} 个节点</span>
    </div>
    <div class="branch-tree__body">
      <TreeNode
        v-if="tree"
        :node="tree"
        :depth="0"
        @select="$emit('select-node', $event)"
      />
      <div v-else class="branch-tree__empty">
        还没有会话记录
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { SessionTreeNode } from '../../utils/session-tree'
import { countNodes } from '../../utils/session-tree'
import TreeNode from './TreeNode.vue'

const props = defineProps<{
  tree: SessionTreeNode | null
}>()

defineEmits<{
  'select-node': [nodeId: string]
}>()

const nodeCount = computed(() => {
  if (!props.tree) return 0
  return countNodes(props.tree)
})
</script>

<style scoped>
.branch-tree {
  border: 1px solid var(--line);
  border-radius: 12px;
  overflow: hidden;
  background: var(--surface);
}

.branch-tree__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--line);
}

.branch-tree__title {
  margin: 0;
  font-size: 14px;
  font-weight: 650;
  color: var(--ink);
}

.branch-tree__count {
  font-size: 11px;
  color: var(--ink-3);
}

.branch-tree__body {
  padding: 12px;
  max-height: 400px;
  overflow-y: auto;
}

.branch-tree__empty {
  text-align: center;
  padding: 24px;
  color: var(--ink-3);
  font-size: 13px;
}
</style>