<template>
  <div class="chat-message" :class="`chat-message--${message.role}`">
    <!-- 用户消息 -->
    <template v-if="message.role === 'user'">
      <div class="chat-message__prompt">
        <span class="chat-message__avatar--user">你</span>
        <div>
          <b>提问</b>
          <br>
          <span class="chat-message__text">{{ message.content }}</span>
        </div>
      </div>
    </template>

    <!-- AI 消息 -->
    <template v-else-if="message.role === 'assistant'">
      <div class="chat-message__answer">
        <p class="chat-message__label">知枝 · 学习伴读</p>
        <div class="chat-message__body" data-highlightable="true" v-html="renderedContent" />
        <div v-if="noteCount > 0" class="chat-message__source">
          <span class="chat-message__source-dot"></span>
          本次回答已生成 {{ noteCount }} 张原子笔记
        </div>
      </div>
    </template>

    <!-- System 消息 -->
    <template v-else>
      <div class="chat-message__system">
        <span>{{ message.content }}</span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
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
  padding: 0;
}

.chat-message--system {
  text-align: center;
  padding: 4px 0;
}

.chat-message__system span {
  font-size: 12px;
  color: var(--ink-2);
}

/* 用户消息 —— 提示框风格 */
.chat-message__prompt {
  display: flex;
  gap: 12px;
  margin: 0 0 35px;
  padding: 15px 17px;
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  background: #f6f4ed;
  color: var(--ink-2);
  font-size: 14px;
  line-height: 1.65;
}

.chat-message__prompt b {
  color: var(--brand);
}

.chat-message__avatar--user {
  flex: 0 0 28px;
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: #fff;
  font-family: Georgia, 'Songti SC', serif;
  background: var(--brand);
  font-size: 13px;
}

.chat-message__text {
  font-size: 14px;
  line-height: 1.65;
  white-space: pre-wrap;
}

/* AI 消息 —— 左侧边线风格 */
.chat-message__answer {
  padding: 4px 0 0 40px;
  border-left: 1px solid var(--line);
}

.chat-message__label {
  margin: 0 0 18px;
  color: var(--ink-2);
  font-size: 12px;
  font-weight: 700;
}

.chat-message__body {
  font-size: 15px;
  line-height: 1.9;
  color: var(--ink);
}

.chat-message__body :deep(h2) {
  margin: 30px 0 12px;
  font-family: Georgia, 'Songti SC', serif;
  font-size: 23px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.chat-message__body :deep(h3) {
  margin: 24px 0 10px;
  font-family: Georgia, 'Songti SC', serif;
  font-size: 19px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.chat-message__body :deep(p) {
  margin: 0 0 16px;
  font-size: 15px;
  line-height: 1.9;
}

.chat-message__body :deep(ol) {
  margin: 10px 0 19px;
  padding-left: 22px;
}

.chat-message__body :deep(li) {
  padding-left: 8px;
  margin: 8px 0;
  font-size: 15px;
  line-height: 1.75;
}

.chat-message__body :deep(strong) {
  color: var(--brand-strong);
  font-weight: 650;
}

.chat-message__body :deep(blockquote) {
  margin: 24px 0;
  padding: 17px 19px;
  border-left: 3px solid var(--brand);
  background: var(--brand-soft);
  border-radius: 0 var(--r-md) var(--r-md) 0;
  color: var(--brand-strong);
  font-family: Georgia, 'Songti SC', serif;
  font-size: 18px;
  line-height: 1.65;
  font-style: normal;
}

.chat-message__body :deep(.selectable) {
  position: relative;
  padding: 1px 3px 2px;
  color: var(--brand-strong);
  font-weight: 650;
  text-decoration: underline;
  text-decoration-color: rgba(36, 92, 77, 0.55);
  text-decoration-thickness: 2px;
  text-underline-offset: 4px;
  background: linear-gradient(transparent 62%, var(--brand-soft) 0);
  border-radius: 2px;
  cursor: text;
}

.chat-message__body :deep(a) {
  color: var(--brand);
  text-decoration: underline;
  text-underline-offset: 3px;
  transition: color 0.15s;
}

.chat-message__body :deep(a:hover) {
  color: var(--brand-strong);
}

.chat-message__body :deep(code) {
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 13px;
  background: var(--surface-2);
  padding: 2px 6px;
  border-radius: 4px;
}

.chat-message__body :deep(pre) {
  background: #f6f4ed;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  padding: 14px 16px;
  overflow-x: auto;
  font-size: 13px;
  line-height: 1.6;
}

.chat-message__body :deep(pre code) {
  background: transparent;
  padding: 0;
}

.chat-message__source {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: 28px;
  color: var(--ink-2);
  font-size: 12px;
}

.chat-message__source-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--brand);
  flex-shrink: 0;
}
</style>