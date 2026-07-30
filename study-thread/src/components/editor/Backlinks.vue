<template>
  <div class="backlinks-panel">
    <h2 class="panel-title">反向链接</h2>
    <p class="panel-desc">引用当前笔记的其他笔记</p>

    <div v-if="loading" class="loading-state">
      <p>正在搜索反向链接...</p>
    </div>

    <div v-else-if="backlinks.length === 0" class="empty-state">
      <p>还没有笔记链接到这里</p>
    </div>

    <div v-else class="backlinks-list">
      <div
        v-for="(link, index) in backlinks"
        :key="index"
        class="backlink-item"
        @click="$emit('navigate', link.sourcePath)"
      >
        <div class="backlink-title">{{ link.title }}</div>
        <div class="backlink-context" v-html="link.context"></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
export interface BacklinkEntry {
  sourcePath: string
  title: string
  context: string
}

defineProps<{
  backlinks: BacklinkEntry[]
  loading?: boolean
}>()

defineEmits<{
  navigate: [path: string]
}>()
</script>

<style scoped>
.backlinks-panel {
  padding: 20px 16px;
}

.panel-title {
  margin: 0;
  font-size: 14px;
  color: var(--ink);
}

.panel-desc {
  margin: 5px 0 18px;
  color: var(--ink-2);
  font-size: 11px;
}

.loading-state,
.empty-state {
  padding: 24px 0;
  text-align: center;
  color: var(--ink-2);
  font-size: 12px;
}

.backlinks-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.backlink-item {
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  cursor: pointer;
  transition: border-color 0.15s;
}

.backlink-item:hover {
  border-color: var(--brand);
}

.backlink-title {
  margin-bottom: 6px;
  color: var(--brand);
  font-size: 12px;
  font-weight: 700;
}

.backlink-context {
  color: var(--ink-2);
  font-size: 11px;
  line-height: 1.6;
}
</style>