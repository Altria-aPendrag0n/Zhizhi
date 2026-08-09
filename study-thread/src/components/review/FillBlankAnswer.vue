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
  padding: 10px 14px;
  border: 1px solid var(--border, #e2e2e2);
  border-radius: 8px;
  background: var(--card, #ffffff);
  font-size: 14px;
  color: var(--foreground, #1f2328);
}

.review-answer__input:focus {
  outline: none;
  border-color: var(--color-primary, #4f7cff);
}

.review-answer__input:disabled {
  opacity: 0.6;
}

.review-answer__submit {
  flex: none;
  padding: 0 20px;
  border: none;
  border-radius: 8px;
  background: var(--color-primary, #4f7cff);
  color: #fff;
  font-size: 14px;
  cursor: pointer;
}

.review-answer__submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
