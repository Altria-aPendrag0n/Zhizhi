<template>
  <div class="review-answer review-answer--tf">
    <button
      class="review-answer__tf review-answer__tf--correct"
      type="button"
      :disabled="disabled"
      @click="emit('submit', true)"
    >
      正确
    </button>
    <button
      class="review-answer__tf review-answer__tf--wrong"
      type="button"
      :disabled="disabled"
      @click="emit('submit', false)"
    >
      错误
    </button>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  disabled?: boolean
}>()

const emit = defineEmits<{
  /** payload: boolean → 父级经 serializeAnswer('true_false', payload) 序列化 */
  submit: [payload: boolean]
}>()
</script>

<style scoped>
.review-answer {
  display: flex;
  gap: 8px;
  width: 100%;
}

.review-answer__tf {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid var(--border, #e2e2e2);
  border-radius: 8px;
  background: var(--card, #ffffff);
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: border-color 0.15s, background 0.15s;
}

.review-answer__tf:hover:not(:disabled) {
  border-color: var(--color-primary, #4f7cff);
}

.review-answer__tf--correct:hover:not(:disabled) {
  background: color-mix(in srgb, #22c55e 8%, transparent);
  border-color: #22c55e;
}

.review-answer__tf--wrong:hover:not(:disabled) {
  background: color-mix(in srgb, #ef4444 8%, transparent);
  border-color: #ef4444;
}

.review-answer__tf:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
