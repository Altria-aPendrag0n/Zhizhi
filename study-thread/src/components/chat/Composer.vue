<template>
  <div class="composer">
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
  position: fixed;
  z-index: 2;
  bottom: 23px;
  left: calc(76px + 244px + max(48px, 8vw));
  right: calc(292px + max(48px, 8vw));
  display: flex;
  align-items: flex-end;
  gap: 10px;
  padding: 11px 11px 11px 16px;
  border: 1px solid var(--line);
  border-radius: 15px;
  background: rgba(251, 250, 246, 0.96);
  box-shadow: 0 12px 30px rgba(25, 49, 43, 0.08);
  transition: box-shadow 0.2s ease, border-color 0.2s ease;
}

.composer:focus-within {
  box-shadow: 0 12px 30px rgba(25, 49, 43, 0.12), 0 0 0 2px var(--brand-soft);
  border-color: var(--brand);
}

.composer__textarea {
  flex: 1;
  height: 25px;
  padding: 2px 0;
  border: 0;
  outline: 0;
  color: var(--ink);
  background: transparent;
  font-size: 14px;
  font-family: inherit;
  resize: none;
  max-height: 200px;
}

.composer__textarea::placeholder {
  color: var(--ink-3);
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
  width: 35px;
  height: 35px;
  border: 0;
  border-radius: 10px;
  background: var(--brand);
  color: var(--brand-ink);
  cursor: pointer;
  transition: background 0.18s ease, opacity 0.18s ease, transform 0.15s ease;
}

.composer__send-btn:hover:not(.composer__send-btn--disabled) {
  background: var(--brand-strong);
  transform: scale(1.05);
}

.composer__send-btn--disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.composer__stop-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 35px;
  height: 35px;
  border: 0;
  border-radius: 10px;
  background: var(--state-error);
  color: white;
  cursor: pointer;
  transition: background 0.18s ease;
}

.composer__stop-btn:hover {
  background: color-mix(in srgb, var(--state-error) 80%, black);
}

@media (max-width: 1100px) {
  .composer {
    left: calc(64px + 218px + 38px);
    right: calc(270px + 38px);
  }
}
</style>