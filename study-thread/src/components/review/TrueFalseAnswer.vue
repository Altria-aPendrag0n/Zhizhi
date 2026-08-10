<template>
  <div class="review-answer review-answer--tf">
    <button
      class="review-answer__tf review-answer__tf--correct"
      type="button"
      :disabled="disabled"
      @click="emit('submit', true)"
    >
      <span class="review-answer__tf-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
      <span class="review-answer__tf-label">正确</span>
      <span class="review-answer__tf-desc">判断为对</span>
    </button>
    <button
      class="review-answer__tf review-answer__tf--wrong"
      type="button"
      :disabled="disabled"
      @click="emit('submit', false)"
    >
      <span class="review-answer__tf-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </span>
      <span class="review-answer__tf-label">错误</span>
      <span class="review-answer__tf-desc">判断为错</span>
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
  gap: 10px;
  width: 100%;
}

.review-answer__tf {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 16px 14px;
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  background: var(--surface);
  cursor: pointer;
  font: inherit;
  transition: all 0.15s;
}

.review-answer__tf-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  transition: background 0.15s, color 0.15s;
}

.review-answer__tf-label {
  font-size: 15px;
  font-weight: 700;
  color: var(--ink);
}

.review-answer__tf-desc {
  font-size: 11px;
  color: var(--ink-3);
}

.review-answer__tf--correct {
  border-color: #c9dfd2;
  background: #edf5f0;
}

.review-answer__tf--correct .review-answer__tf-icon {
  background: #d3e8dc;
  color: #2f7d5d;
}

.review-answer__tf--correct:hover:not(:disabled) {
  border-color: var(--state-success);
  background: #e2efe9;
}

.review-answer__tf--correct:hover:not(:disabled) .review-answer__tf-icon {
  background: var(--state-success);
  color: #fff;
}

.review-answer__tf--wrong {
  border-color: #ecd2cd;
  background: #fbf1ef;
}

.review-answer__tf--wrong .review-answer__tf-icon {
  background: #f3dcd8;
  color: #ad4d45;
}

.review-answer__tf--wrong:hover:not(:disabled) {
  border-color: var(--state-error);
  background: #f6e6e3;
}

.review-answer__tf--wrong:hover:not(:disabled) .review-answer__tf-icon {
  background: var(--state-error);
  color: #fff;
}

.review-answer__tf:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
