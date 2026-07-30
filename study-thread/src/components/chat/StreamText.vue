<template>
  <div class="stream-text">
    <div class="chat-message__label">知枝 · 学习伴读</div>
    <div class="stream-text__body" v-html="renderedContent" />
    <span class="stream-text__cursor" v-if="isStreaming">|</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  text: string
  isStreaming: boolean
}>()

const renderedContent = computed(() => {
  let text = props.text
  // 简单 Markdown 渲染（容错处理）
  try {
    text = text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code class="bg-surface-2 px-1 rounded text-sm">$1</code>')
      .replace(/\n\n/g, '<br><br>')
      .replace(/\n/g, '<br>')
  } catch {
    // 部分文本不完整，容错处理
  }
  return text
})
</script>

<style scoped>
.stream-text {
  flex: 1;
  min-width: 0;
}

.chat-message__label {
  font-size: 12px;
  font-weight: 590;
  color: var(--brand);
  margin-bottom: 6px;
}

.stream-text__body {
  font-size: 14px;
  line-height: 1.7;
  color: var(--ink);
  display: inline;
}

.stream-text__cursor {
  display: inline;
  animation: blink 1s step-end infinite;
  color: var(--brand);
  font-weight: 400;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
</style>