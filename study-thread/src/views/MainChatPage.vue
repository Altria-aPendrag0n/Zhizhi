<template>
  <div class="main-chat-page">
    <ChatView
      :messages="messages"
      :is-streaming="isStreaming"
      :streaming-text="streamingText"
      :error="error"
      @retry="handleRetry"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { Message } from '../types'
import ChatView from '../components/chat/ChatView.vue'

const messages = ref<Message[]>([])
const isStreaming = ref(false)
const streamingText = ref('')
const error = ref<string | null>(null)

function handleRetry() {
  error.value = null
  // 重试逻辑将在 Task 14 中实现
}
</script>

<style scoped>
.main-chat-page {
  display: flex;
  flex-direction: column;
  height: 100%;
}
</style>