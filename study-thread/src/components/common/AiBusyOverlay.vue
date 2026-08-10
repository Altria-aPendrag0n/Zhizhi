<template>
  <Teleport to="body">
    <div
      v-if="busy.active"
      class="ai-busy"
      role="alertdialog"
      aria-modal="true"
      aria-label="AI 正在思考"
    >
      <div class="ai-busy__card">
        <span class="ai-busy__spinner" aria-hidden="true" />
        <span class="ai-busy__text">{{ busy.message }}</span>
        <span class="ai-busy__sub">请稍候，不要重复操作</span>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { useBusyStore } from '../../stores/busy'

const busy = useBusyStore()
</script>

<style scoped>
.ai-busy {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(25, 49, 43, 0.28);
  backdrop-filter: blur(2px);
  cursor: wait;
}

.ai-busy__card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  min-width: 220px;
  padding: 26px 34px;
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  background: var(--surface);
  box-shadow: 0 18px 48px rgba(20, 39, 33, 0.2);
}

.ai-busy__spinner {
  width: 26px;
  height: 26px;
  border: 3px solid var(--brand-soft);
  border-top-color: var(--brand);
  border-radius: 50%;
  animation: ai-busy-spin 0.8s linear infinite;
}

.ai-busy__text {
  font-family: Georgia, 'Songti SC', serif;
  font-size: 16px;
  font-weight: 600;
  color: var(--ink);
}

.ai-busy__sub {
  font-size: 11px;
  color: var(--ink-3);
}

@keyframes ai-busy-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
