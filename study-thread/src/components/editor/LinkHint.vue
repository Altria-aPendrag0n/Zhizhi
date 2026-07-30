<template>
  <div class="link-hint" v-if="suggestions.length > 0">
    <div class="link-hint__header">
      <span class="link-hint__title">相关笔记</span>
      <button class="link-hint__close" @click="$emit('close')" title="关闭">x</button>
    </div>
    <ul class="link-hint__list">
      <li
        v-for="item in suggestions"
        :key="item.notePath"
        class="link-hint__item"
        @click="$emit('select', item)"
      >
        <div class="link-hint__item-title">
          <span class="link-hint__item-icon">[[</span>
          {{ item.title }}
        </div>
        <div class="link-hint__item-meta">
          <span class="link-hint__item-similarity">
            {{ (item.similarity * 100).toFixed(0) }}% 匹配
          </span>
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import type { LinkSuggestion } from '../../embedding/linker'

defineProps<{
  suggestions: LinkSuggestion[]
}>()

defineEmits<{
  close: []
  select: [item: LinkSuggestion]
}>()
</script>

<style scoped>
.link-hint {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
  overflow: hidden;
  max-height: 320px;
  display: flex;
  flex-direction: column;
}

.link-hint__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--line);
}

.link-hint__title {
  font-size: 11px;
  font-weight: 650;
  color: var(--ink-2);
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.link-hint__close {
  border: none;
  background: transparent;
  color: var(--ink-3);
  cursor: pointer;
  font-size: 14px;
  padding: 0;
  line-height: 1;
}

.link-hint__close:hover {
  color: var(--ink);
}

.link-hint__list {
  list-style: none;
  margin: 0;
  padding: 6px;
  overflow-y: auto;
}

.link-hint__item {
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
}

.link-hint__item:hover {
  background: var(--surface-2);
}

.link-hint__item-title {
  font-size: 13px;
  font-weight: 550;
  color: var(--ink);
  display: flex;
  align-items: center;
  gap: 4px;
}

.link-hint__item-icon {
  color: var(--ink-3);
  font-size: 11px;
  font-weight: 400;
}

.link-hint__item-meta {
  margin-top: 4px;
}

.link-hint__item-similarity {
  font-size: 11px;
  color: var(--brand);
}
</style>