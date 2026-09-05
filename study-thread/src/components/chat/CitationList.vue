<template>
  <div v-if="sources.length > 0" class="citation-list">
    <span class="citation-list__label">参考来源</span>
    <button
      v-for="source in sources"
      :key="`${source.index}-${source.path}`"
      class="citation-list__item"
      :title="source.title"
      @click="emit('open', source, $event)"
    >
      <span class="citation-list__index">[{{ source.index }}]</span>
      <component :is="source.kind === 'note' ? FileText : BookOpen" :size="12" class="citation-list__icon" />
      <span class="citation-list__title">{{ source.title }}</span>
      <span v-if="pageLabel(source)" class="citation-list__pages">{{ pageLabel(source) }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { BookOpen, FileText } from '@lucide/vue'
import type { CitationSource } from '../../types'

defineProps<{
  /** 本条回答引用的来源列表（编号与正文角标对应） */
  sources: CitationSource[]
}>()

const emit = defineEmits<{
  open: [source: CitationSource, event: MouseEvent]
}>()

/** 位置标签：pdf 命中显示页码区间，md 命中显示章节标题 */
function pageLabel(source: CitationSource): string {
  if (source.pageFrom !== undefined && source.pageTo !== undefined) {
    return source.pageFrom === source.pageTo
      ? `第 ${source.pageFrom + 1} 页`
      : `第 ${source.pageFrom + 1}-${source.pageTo + 1} 页`
  }
  return source.sectionTitle ?? ''
}
</script>

<style scoped>
.citation-list {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

.citation-list__label {
  color: var(--ink-2);
  font-size: 11px;
}

.citation-list__item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 260px;
  padding: 3px 9px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--ink-2);
  font-size: 11px;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}

.citation-list__item:hover {
  color: var(--brand-strong);
  border-color: var(--brand);
}

.citation-list__index {
  color: var(--brand);
  font-weight: 650;
  font-size: 11px;
}

.citation-list__icon {
  flex-shrink: 0;
}

.citation-list__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.citation-list__pages {
  flex-shrink: 0;
  color: var(--ink-2);
  font-size: 10px;
  opacity: 0.8;
}
</style>
