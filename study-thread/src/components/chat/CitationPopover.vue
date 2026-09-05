<template>
  <div
    class="citation-popover"
    :style="{ left: `${position.x}px`, top: `${position.y}px` }"
    @click.stop
  >
    <div class="citation-popover__head">
      <span class="citation-popover__kind" :class="`is-${source.kind}`">
        {{ source.kind === 'note' ? '笔记' : '参考资料' }}
      </span>
      <span class="citation-popover__title">{{ source.title }}</span>
      <button class="citation-popover__close" title="关闭" @click="emit('close')">×</button>
    </div>
    <p v-if="locationLabel" class="citation-popover__location">{{ locationLabel }}</p>
    <p class="citation-popover__snippet">{{ source.snippet }}</p>
    <button class="citation-popover__open" @click="emit('open-source', source)">打开原文</button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { CitationSource } from '../../types'

const props = defineProps<{
  source: CitationSource
  /** 浮层定位（视口坐标，调用方已做边界收敛） */
  position: { x: number; y: number }
}>()

const emit = defineEmits<{
  close: []
  'open-source': [source: CitationSource]
}>()

const locationLabel = computed(() => {
  if (props.source.pageFrom !== undefined && props.source.pageTo !== undefined) {
    const section = props.source.sectionTitle ? `「${props.source.sectionTitle}」` : ''
    const pages =
      props.source.pageFrom === props.source.pageTo
        ? `第 ${props.source.pageFrom + 1} 页`
        : `第 ${props.source.pageFrom + 1}-${props.source.pageTo + 1} 页`
    return `${section}${pages}`.trim()
  }
  return props.source.sectionTitle ?? ''
})
</script>

<style scoped>
.citation-popover {
  position: fixed;
  z-index: 60;
  width: 320px;
  padding: 13px 15px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: #fff;
  box-shadow: 0 10px 32px rgba(31, 41, 36, 0.16);
}

.citation-popover__head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.citation-popover__kind {
  flex-shrink: 0;
  padding: 1px 8px;
  border-radius: 999px;
  color: #fff;
  font-size: 10px;
  font-weight: 650;
}

.citation-popover__kind.is-note {
  background: var(--brand);
}

.citation-popover__kind.is-reference {
  background: #a0762c;
}

.citation-popover__title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 650;
  color: var(--ink);
}

.citation-popover__close {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: var(--ink-2);
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
}

.citation-popover__close:hover {
  color: var(--ink);
}

.citation-popover__location {
  margin: 7px 0 0;
  color: var(--brand-strong);
  font-size: 11px;
}

.citation-popover__snippet {
  margin: 8px 0 0;
  color: var(--ink-2);
  font-size: 12px;
  line-height: 1.7;
  display: -webkit-box;
  -webkit-line-clamp: 5;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.citation-popover__open {
  margin-top: 11px;
  padding: 5px 12px;
  border: 1px solid var(--brand);
  border-radius: var(--r-sm);
  background: var(--brand-soft);
  color: var(--brand-strong);
  font-size: 12px;
  cursor: pointer;
}

.citation-popover__open:hover {
  background: var(--brand);
  color: #fff;
}
</style>
