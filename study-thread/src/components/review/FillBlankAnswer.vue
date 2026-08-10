<template>
  <div class="review-answer review-answer--fill">
    <input
      v-model="text"
      class="review-answer__input"
      type="text"
      :disabled="disabled"
      :placeholder="`填写${blanks}个空位（多个空用「；」分隔）`"
      @keydown.enter="submit"
    />
    <button
      class="review-answer__submit"
      type="button"
      :disabled="disabled || !text.trim()"
      @click="submit"
    >
      提交
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  blanks?: number
  disabled?: boolean
}>()

const emit = defineEmits<{
  /** payload: string（多空用「；」分隔）→ 父级经 serializeAnswer('fill_blank', payload) 序列化 */
  submit: [payload: string]
}>()

const text = ref('')

function submit() {
  const value = text.value.trim()
  if (!value || props.disabled) return
  emit('submit', value)
  text.value = ''
}
</script>

<style scoped>
.review-answer {
  display: flex;
  gap: 8px;
  width: 100%;
}

.review-answer__input {
  flex: 1;
  min-width: 0;
  padding: 11px 14px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
  font: inherit;
  font-size: 14px;
  color: var(--ink);
  transition: border-color 0.15s, box-shadow 0.15s;
}

.review-answer__input::placeholder {
  color: var(--ink-3);
}

.review-answer__input:focus {
  outline: none;
  border-color: var(--brand);
  box-shadow: 0 0 0 3px rgba(36, 92, 77, 0.14);
}

.review-answer__input:disabled {
  opacity: 0.6;
}

.review-answer__submit {
  flex: none;
  padding: 0 22px;
  border: 1px solid var(--brand);
  border-radius: var(--r-md);
  background: var(--brand);
  color: var(--brand-ink);
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
  transition: background 0.15s;
}

.review-answer__submit:hover:not(:disabled) {
  background: var(--brand-strong);
}

.review-answer__submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
