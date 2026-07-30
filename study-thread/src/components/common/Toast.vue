<template>
  <Teleport to="body">
    <TransitionGroup name="toast" tag="div" class="toast-container">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="toast"
        :class="`toast--${toast.type}`"
      >
        <span class="toast__icon">
          <AlertCircle v-if="toast.type === 'error'" :size="16" />
          <CheckCircle v-else-if="toast.type === 'success'" :size="16" />
          <Info v-else :size="16" />
        </span>
        <span class="toast__message">{{ toast.message }}</span>
        <button class="toast__close" @click="removeToast(toast.id)">x</button>
      </div>
    </TransitionGroup>
  </Teleport>
</template>

<script setup lang="ts">
import { useToast } from '../../composables/useToast'
import { AlertCircle, CheckCircle, Info } from '@lucide/vue'

const { toasts, removeToast } = useToast()
</script>

<style scoped>
.toast-container {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 8px;
  background: var(--surface);
  border: 1px solid var(--line);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  font-size: 13px;
  color: var(--ink);
  pointer-events: auto;
  min-width: 200px;
  max-width: 360px;
}

.toast--error {
  border-left: 3px solid #ef4444;
}

.toast--success {
  border-left: 3px solid #22c55e;
}

.toast--info {
  border-left: 3px solid var(--brand);
}

.toast__icon {
  flex-shrink: 0;
  color: var(--ink-2);
}

.toast--error .toast__icon {
  color: #ef4444;
}

.toast--success .toast__icon {
  color: #22c55e;
}

.toast--info .toast__icon {
  color: var(--brand);
}

.toast__message {
  flex: 1;
  line-height: 1.4;
}

.toast__close {
  flex-shrink: 0;
  background: none;
  border: none;
  color: var(--ink-3);
  cursor: pointer;
  font-size: 14px;
  padding: 2px;
  line-height: 1;
}

.toast__close:hover {
  color: var(--ink);
}

/* 过渡动画 */
.toast-enter-active {
  transition: all 0.3s ease;
}

.toast-leave-active {
  transition: all 0.2s ease;
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(40px);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(40px);
}
</style>