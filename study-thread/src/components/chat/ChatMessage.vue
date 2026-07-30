<template>
  <div class="chat-message" :class="`chat-message--${message.role}`">
    <!-- 用户消息 -->
    <template v-if="message.role === 'user'">
      <div class="chat-message__avatar chat-message__avatar--user">
        <User :size="18" />
      </div>
      <div class="chat-message__bubble">
        <div class="chat-message__text">{{ message.content }}</div>
      </div>
    </template>

    <!-- AI 消息 -->
    <template v-else-if="message.role === 'assistant'">
      <div class="chat-message__avatar chat-message__avatar--ai">
        <span class="text-xs font-bold">枝</span>
      </div>
      <div class="chat-message__content">
        <div class="chat-message__label">知枝 · 学习伴读</div>
        <div class="chat-message__body selectable" v-html="renderedContent" />
        <div v-if="noteCount > 0" class="chat-message__source">
          本次回答已生成 {{ noteCount }} 张原子笔记
        </div>
      </div>
    </template>

    <!-- System 消息 -->
    <template v-else>
      <div class="chat-message__system">
        <span class="text-xs text-muted-foreground">{{ message.content }}</span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { User } from '@lucide/vue'
import { marked } from 'marked'
import type { Message } from '../../types'

const props = defineProps<{
  message: Message
  noteCount?: number
}>()

const noteCount = computed(() => props.noteCount ?? 0)

const renderedContent = computed(() => {
  return marked(props.message.content, {
    breaks: true,
    gfm: true,
  }) as string
})
</script>

<style scoped>
.chat-message {
  display: flex;
  gap: 12px;
  padding: 16px 0;
}

.chat-message--user {
  flex-direction: row;
}

.chat-message--assistant {
  flex-direction: row;
}

.chat-message__avatar {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.chat-message__avatar--user {
  background: var(--surface-2);
  color: var(--ink);
}

.chat-message__avatar--ai {
  background: var(--brand);
  color: var(--brand-ink);
}

.chat-message__bubble {
  background: var(--surface-2);
  border-radius: 12px;
  padding: 10px 14px;
  max-width: 70%;
}

.chat-message__text {
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.chat-message__content {
  flex: 1;
  min-width: 0;
}

.chat-message__label {
  font-size: 12px;
  font-weight: 590;
  color: var(--brand);
  margin-bottom: 6px;
}

.chat-message__body {
  font-size: 14px;
  line-height: 1.7;
  color: var(--ink);
}

.chat-message__body :deep(h1),
.chat-message__body :deep(h2),
.chat-message__body :deep(h3) {
  color: var(--ink);
}

.chat-message__body :deep(code) {
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 13px;
}

.chat-message__body :deep(blockquote) {
  color: var(--muted-foreground);
}

.chat-message__source {
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px solid var(--line);
  font-size: 12px;
  color: var(--muted-foreground);
}

.chat-message__system {
  text-align: center;
  width: 100%;
  padding: 4px 0;
}

.chat-message--system {
  justify-content: center;
}
</style>