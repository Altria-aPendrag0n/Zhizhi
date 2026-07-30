<template>
  <div class="composer">
    <div class="composer__inner">
      <textarea
        ref="textareaRef"
        v-model="input"
        class="composer__textarea"
        :placeholder="placeholder"
        rows="1"
        :disabled="disabled"
        @keydown="handleKeydown"
        @input="handleInput"
      />
      <div class="composer__actions">
        <button
          v-if="isStreaming"
          class="composer__stop-btn"
          title="停止生成"
          @click="$emit('stop')"
        >
          <Square :size="16" />
        </button>
        <button
          v-else
          class="composer__send-btn"
          :class="{ 'composer__send-btn--disabled': !canSend }"
          :disabled="!canSend"
          title="发送"
          @click="handleSend"
        >
          <ArrowUp :size="18" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { ArrowUp, Square } from '@lucide/vue'

const props = defineProps<{
  isStreaming: boolean
  disabled: boolean
  placeholder?: string
}>()

const emit = defineEmits<{
  send: [content: string]
  stop: []
}>()

const input = ref('')
const textareaRef = ref<HTMLTextAreaElement | null>(null)

const canSend = computed(() => input.value.trim().length > 0 && !props.disabled)

function handleInput() {
  // 自动增高
  nextTick(() => {
    const el = textareaRef.value
    if (el) {
      el.style.height = 'auto'
      el.style.height = Math.min(el.scrollHeight, 200) + 'px'
    }
  })
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

function handleSend() {
  if (!canSend.value) return
  const content = input.value.trim()
  input.value = ''
  // 重置高度
  nextTick(() => {
    const el = textareaRef.value
    if (el) {
      el.style.height = 'auto'
    }
  })
  emit('send', content)
}
</script>

<style scoped>
.composer {
  padding: 12px 24px 20px;
  background: var(--surface-1);
  border-top: 1px solid var(--line);
}

.composer__inner {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  max-width: 720px;
  margin: 0 auto;
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: 15px;
  padding: 8px 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.composer__textarea {
  flex: 1;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--ink);
  font-size: 14px;
  line-height: 1.5;
  resize: none;
  max-height: 200px;
  font-family: inherit;
  padding: 4px 0;
}

.composer__textarea::placeholder {
  color: var(--muted-foreground);
}

.composer__textarea:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.composer__actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.composer__send-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 8px;
  background: var(--brand);
  color: var(--brand-ink);
  cursor: pointer;
  transition: background 0.15s, opacity 0.15s;
}

.composer__send-btn:hover {
  background: var(--brand-strong);
}

.composer__send-btn--disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.composer__stop-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 8px;
  background: var(--color-red, #ef4444);
  color: white;
  cursor: pointer;
  transition: background 0.15s;
}

.composer__stop-btn:hover {
  background: color-mix(in srgb, var(--color-red, #ef4444) 80%, black);
}
</style>