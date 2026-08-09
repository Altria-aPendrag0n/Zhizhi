<template>
  <div class="review-answer review-answer--choice">
    <button
      v-for="(option, index) in options"
      :key="index"
      class="review-answer__choice"
      type="button"
      :disabled="disabled"
      @click="emit('submit', { index, text: option })"
    >
      <span class="review-answer__choice-letter">{{ letters[index] }}</span>
      <span class="review-answer__choice-text">{{ option }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { OPTION_LETTERS } from '../../review/question-registry'

const props = defineProps<{
  /** 选项列表（题干不含字母，由组件渲染 A/B/C/D） */
  options: string[]
  disabled?: boolean
}>()

const emit = defineEmits<{
  /** payload: { index, text } → 父级经 serializeAnswer('choice', payload) 序列化 */
  submit: [payload: { index: number; text: string }]
}>()

const letters = computed(() => props.options.map((_, i) => OPTION_LETTERS[i] ?? `第${i + 1}项`))
</script>

<style scoped>
.review-answer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.review-answer__choice {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--border, #e2e2e2);
  border-radius: 8px;
  background: var(--card, #ffffff);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s, background 0.15s;
}

.review-answer__choice:hover:not(:disabled) {
  border-color: var(--color-primary, #4f7cff);
  background: color-mix(in srgb, var(--color-primary, #4f7cff) 6%, transparent);
}

.review-answer__choice:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.review-answer__choice-letter {
  flex: none;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-primary, #4f7cff);
  background: color-mix(in srgb, var(--color-primary, #4f7cff) 10%, transparent);
}

.review-answer__choice-text {
  font-size: 14px;
  line-height: 1.5;
  color: var(--foreground, #1f2328);
}
</style>
