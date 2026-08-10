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
  gap: 12px;
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
  cursor: pointer;
  text-align: left;
  font: inherit;
  transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
}

.review-answer__choice:hover:not(:disabled) {
  border-color: var(--brand);
  background: var(--brand-soft);
  box-shadow: 0 2px 8px rgba(36, 92, 77, 0.08);
}

.review-answer__choice:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.review-answer__choice-letter {
  flex: none;
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--r-sm);
  font-family: Georgia, 'Songti SC', serif;
  font-size: 13px;
  font-weight: 700;
  color: var(--brand);
  background: var(--brand-soft);
  transition: background 0.15s, color 0.15s;
}

.review-answer__choice:hover:not(:disabled) .review-answer__choice-letter {
  background: var(--brand);
  color: var(--brand-ink);
}

.review-answer__choice-text {
  font-size: 14px;
  line-height: 1.5;
  color: var(--ink);
}
</style>
