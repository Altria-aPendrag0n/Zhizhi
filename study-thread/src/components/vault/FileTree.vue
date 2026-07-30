<template>
  <div class="file-tree">
    <div v-if="!tree || tree.length === 0" class="file-tree__empty">
      <p class="text-muted-foreground text-sm">暂无文件</p>
    </div>
    <ul v-else class="file-tree__list">
      <FileTreeNode
        v-for="entry in tree"
        :key="entry.path"
        :entry="entry"
        :depth="0"
        @select="$emit('select', $event)"
      />
    </ul>
  </div>
</template>

<script setup lang="ts">
import type { DirEntry } from '../../types'
import FileTreeNode from './FileTreeNode.vue'

defineProps<{
  tree: DirEntry[] | null
}>()

defineEmits<{
  select: [path: string]
}>()
</script>

<style scoped>
.file-tree {
  padding: 4px 0;
}
.file-tree__empty {
  padding: 16px;
  text-align: center;
}
.file-tree__list {
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>