<template>
  <div class="thinking-block">
    <button
      type="button"
      class="thinking-block__toggle"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      <ChevronRight :size="13" class="thinking-block__chevron" :class="{ 'is-expanded': expanded }" />
      <span class="thinking-block__label">思考过程</span>
    </button>
    <div v-show="expanded" class="thinking-block__content">{{ text }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ChevronRight } from '@lucide/vue'

const props = defineProps<{
  text: string
  /** 初始是否展开；回答结束后默认折叠，流式中默认展开 */
  startExpanded?: boolean
}>()

const expanded = ref(props.startExpanded ?? false)
</script>

<style scoped>
.thinking-block {
  margin: 0 0 18px;
  padding-left: 16px;
  border-left: 1px solid var(--line);
}

.thinking-block__toggle {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 0;
  border: 0;
  background: none;
  font-family: inherit;
  color: var(--ink-2);
  cursor: pointer;
  transition: color 0.15s;
}

.thinking-block__toggle:hover {
  color: var(--ink);
}

.thinking-block__chevron {
  color: var(--ink-3);
  transition: transform 0.18s ease;
}

.thinking-block__chevron.is-expanded {
  transform: rotate(90deg);
}

.thinking-block__label {
  font-size: 12px;
  font-weight: 590;
  letter-spacing: 0.02em;
}

.thinking-block__content {
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--ink-3);
  white-space: pre-wrap;
  overflow-wrap: break-word;
}
</style>
