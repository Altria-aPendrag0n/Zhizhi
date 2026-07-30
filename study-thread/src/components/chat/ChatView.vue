<template>
  <div class="chat-view" ref="containerRef" @mouseup="handleMouseUp">
    <!-- 空状态 -->
    <div v-if="!messages.length && !isStreaming" class="chat-view__empty">
      <div class="chat-view__empty-icon">
        <MessageSquare :size="48" />
      </div>
      <h2 class="text-lg font-bold text-primary mt-4">开始学习对话</h2>
      <p class="text-sm text-muted-foreground mt-2">
        向知枝提问，或粘贴一段想要拆解的概念
      </p>
    </div>

    <!-- 消息列表 -->
    <div v-else class="chat-view__messages">
      <ChatMessage
        v-for="(msg, index) in messages"
        :key="index"
        :message="msg"
        :note-count="0"
      />

      <!-- 流式文本 -->
      <div v-if="streamingText || isStreaming" class="chat-message chat-message--assistant">
        <div class="chat-message__avatar chat-message__avatar--ai">
          <span class="text-xs font-bold">枝</span>
        </div>
        <StreamText :text="streamingText" :is-streaming="isStreaming" />
      </div>
    </div>

    <!-- 重试按钮 -->
    <div v-if="error" class="chat-view__error">
      <AlertCircle :size="16" />
      <span class="text-sm">{{ error }}</span>
      <button class="btn btn-secondary text-xs" @click="$emit('retry')">重试</button>
    </div>

    <!-- 划线浮动菜单 -->
    <HighlightMenu
      :visible="highlightMenu.visible"
      :x="highlightMenu.x"
      :y="highlightMenu.y"
      @close="highlightMenu.visible = false"
      @extract-note="handleExtractNote"
      @create-branch="handleCreateBranch"
      @copy="handleCopy"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, reactive } from 'vue'
import { MessageSquare, AlertCircle } from '@lucide/vue'
import type { Message } from '../../types'
import ChatMessage from './ChatMessage.vue'
import StreamText from './StreamText.vue'
import HighlightMenu from './HighlightMenu.vue'

const props = defineProps<{
  messages: Message[]
  isStreaming: boolean
  streamingText: string
  error: string | null
}>()

const emit = defineEmits<{
  retry: []
  'extract-note': [text: string]
  'create-branch': [text: string]
}>()

const containerRef = ref<HTMLElement | null>(null)

const highlightMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
})

function handleMouseUp() {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed) {
    return
  }

  const text = selection.toString().trim()
  if (!text) return

  // 检查选中的文本是否在 AI 消息（.selectable）内
  const range = selection.getRangeAt(0)
  const container = range.commonAncestorContainer
  const selectableEl = (container as Element).closest?.('.selectable')
  if (!selectableEl) return

  // 获取选区位置
  const rect = range.getBoundingClientRect()
  highlightMenu.x = rect.left + rect.width / 2
  highlightMenu.y = rect.top
  highlightMenu.visible = true
}

function handleExtractNote(text: string) {
  emit('extract-note', text)
}

function handleCreateBranch(text: string) {
  emit('create-branch', text)
}

function handleCopy(_text: string) {
  // 复制逻辑已在 HighlightMenu 中处理
}

// 自动滚动到底部
watch(
  () => [props.messages.length, props.streamingText, props.isStreaming],
  async () => {
    await nextTick()
    if (containerRef.value) {
      containerRef.value.scrollTop = containerRef.value.scrollHeight
    }
  },
  { deep: true },
)
</script>

<style scoped>
.chat-view {
  flex: 1;
  overflow-y: auto;
  padding: 0 24px;
}

.chat-view__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  padding: 48px 24px;
}

.chat-view__empty-icon {
  color: var(--muted-foreground);
  opacity: 0.5;
}

.chat-view__messages {
  max-width: 720px;
  margin: 0 auto;
  padding: 24px 0;
}

.chat-message {
  display: flex;
  gap: 12px;
  padding: 16px 0;
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

.chat-message__avatar--ai {
  background: var(--brand);
  color: var(--brand-ink);
}

.chat-view__error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  margin: 0 24px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-red, #ef4444) 10%, transparent);
  color: var(--color-red, #dc2626);
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 12px;
  border: 0;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 590;
  cursor: pointer;
}

.btn-secondary {
  color: var(--ink);
  background: var(--surface-2);
}

.btn-secondary:hover {
  background: var(--line);
}
</style>