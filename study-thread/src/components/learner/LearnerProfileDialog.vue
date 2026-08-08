<template>
  <Teleport to="body">
    <div v-if="visible" class="learner-dialog">
      <div class="learner-dialog__overlay" @click="handleCancel" />
      <div class="learner-dialog__panel">
        <p v-if="loading" class="learner-dialog__loading">正在分析本次会话，更新学习画像…</p>
        <DiffView v-else-if="diff" :diff="diff" @confirm="handleConfirm" @cancel="handleCancel" />
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import type { ProfileDiff } from '../../api/skills/update-learner'
import DiffView from '../common/DiffView.vue'

defineProps<{
  visible: boolean
  diff: ProfileDiff | null
  loading: boolean
}>()

const emit = defineEmits<{
  confirm: [diff: ProfileDiff]
  cancel: []
}>()

function handleConfirm(diff: ProfileDiff) {
  emit('confirm', diff)
}

function handleCancel() {
  emit('cancel')
}
</script>

<style scoped>
.learner-dialog {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
}

.learner-dialog__overlay {
  position: absolute;
  inset: 0;
  background: rgba(25, 49, 43, 0.35);
}

.learner-dialog__panel {
  position: relative;
  width: 560px;
  max-width: 100%;
  max-height: 80vh;
  overflow-y: auto;
  border-radius: var(--r-lg);
  background: var(--surface);
  box-shadow: 0 12px 40px rgba(20, 39, 33, 0.18);
  padding: 20px;
}

.learner-dialog__loading {
  margin: 0;
  padding: 28px 0;
  text-align: center;
  color: var(--ink-2);
  font-size: 13px;
}
</style>
