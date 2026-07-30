<template>
  <li class="tree-node">
    <div
      class="tree-node__row"
      :class="{ 'tree-node__row--dimmed': depth > 0 }"
      :style="{ paddingLeft: (depth * 16 + 8) + 'px' }"
      @click="handleClick"
    >
      <span class="tree-node__indent-line" v-if="depth > 0" />
      <span class="tree-node__icon">
        <Folder v-if="entry.is_dir && !expanded" :size="16" />
        <FolderOpen v-else-if="entry.is_dir && expanded" :size="16" />
        <File v-else :size="16" />
      </span>
      <span class="tree-node__name">{{ entry.name }}</span>
    </div>
    <ul v-if="entry.is_dir && expanded && entry.children" class="tree-node__children">
      <FileTreeNode
        v-for="child in entry.children"
        :key="child.path"
        :entry="child"
        :depth="depth + 1"
        @select="$emit('select', $event)"
      />
    </ul>
  </li>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Folder, FolderOpen, File } from '@lucide/vue'
import type { DirEntry } from '../../types'

const props = defineProps<{
  entry: DirEntry
  depth: number
}>()

const emit = defineEmits<{
  select: [path: string]
}>()

const expanded = ref(false)

function handleClick() {
  if (props.entry.is_dir) {
    expanded.value = !expanded.value
  } else {
    emit('select', props.entry.path)
  }
}
</script>

<style scoped>
.tree-node__row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.1s;
  position: relative;
}
.tree-node__row:hover {
  background: var(--brand-soft);
}
.tree-node__indent-line {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--line);
  opacity: 0.5;
}
.tree-node__icon {
  flex-shrink: 0;
  color: var(--muted-foreground);
}
.tree-node__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tree-node__children {
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>