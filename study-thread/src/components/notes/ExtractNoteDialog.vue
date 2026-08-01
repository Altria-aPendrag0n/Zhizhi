<template>
  <Teleport to="body">
    <div v-if="visible" class="extract-dialog__mask" @click.self="handleCancel">
      <div class="extract-dialog" role="dialog" aria-modal="true">
        <div class="extract-dialog__header">
          <h3>摘录为笔记</h3>
          <p class="extract-dialog__sub">标题由你确认，描述将自动生成</p>
        </div>

        <div class="extract-dialog__body">
          <label class="extract-dialog__label" for="note-title-input">笔记标题</label>
          <input
            id="note-title-input"
            ref="titleInputRef"
            v-model="localTitle"
            class="extract-dialog__title-input"
            placeholder="输入笔记标题…"
            :disabled="loading || saving"
            maxlength="60"
            @keydown.enter.prevent="handleConfirm"
          />

          <label class="extract-dialog__label">划线内容</label>
          <blockquote class="extract-dialog__quote">
            {{ highlightedText }}
          </blockquote>

          <div v-if="error" class="extract-dialog__error">{{ error }}</div>
        </div>

        <div class="extract-dialog__footer">
          <button class="extract-dialog__btn extract-dialog__btn--ghost" :disabled="saving" @click="handleCancel">
            取消
          </button>
          <button
            class="extract-dialog__btn extract-dialog__btn--primary"
            :disabled="loading || saving || !localTitle.trim()"
            @click="handleConfirm"
          >
            {{ loading ? '正在生成建议标题…' : saving ? '保存中…' : '确认保存' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'

const props = defineProps<{
  visible: boolean
  /** 预填的建议标题 */
  title: string
  highlightedText: string
  loading?: boolean
  saving?: boolean
  error?: string
}>()

const emit = defineEmits<{
  close: []
  confirm: [title: string]
}>()

const localTitle = ref('')
const titleInputRef = ref<HTMLInputElement | null>(null)

watch(
  () => props.title,
  (value) => {
    localTitle.value = value
  },
)

watch(
  () => props.visible,
  async (visible) => {
    if (visible) {
      localTitle.value = props.title
      await nextTick()
      titleInputRef.value?.focus()
      titleInputRef.value?.select()
    }
  },
)

function handleConfirm() {
  const title = localTitle.value.trim()
  if (!title || props.loading || props.saving) return
  emit('confirm', title)
}

function handleCancel() {
  if (props.saving) return
  emit('close')
}
</script>

<style scoped>
.extract-dialog__mask {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: grid;
  place-items: center;
  background: rgba(18, 30, 26, 0.4);
  backdrop-filter: blur(2px);
}

.extract-dialog {
  width: min(440px, calc(100vw - 48px));
  background: #fffefa;
  border: 1px solid var(--line);
  border-radius: 14px;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.18);
  overflow: hidden;
  animation: dialogIn 0.18s ease;
}

.extract-dialog__header {
  padding: 18px 20px 0;
}

.extract-dialog__header h3 {
  margin: 0;
  font: 650 17px 'HarmonyOS Sans SC', 'PingFang SC', sans-serif;
  color: var(--ink);
}

.extract-dialog__sub {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--ink-3);
}

.extract-dialog__body {
  padding: 16px 20px 0;
}

.extract-dialog__label {
  display: block;
  margin-bottom: 6px;
  font-size: 11px;
  font-weight: 700;
  color: var(--ink-2);
  letter-spacing: 0.05em;
}

.extract-dialog__title-input {
  width: 100%;
  box-sizing: border-box;
  padding: 9px 12px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: #fff;
  font-size: 14px;
  color: var(--ink);
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.extract-dialog__title-input:focus {
  border-color: var(--brand);
  box-shadow: 0 0 0 3px var(--brand-soft);
}

.extract-dialog__title-input:disabled {
  opacity: 0.6;
}

.extract-dialog__quote {
  margin: 0;
  padding: 10px 12px;
  border-left: 3px solid var(--brand-soft);
  background: var(--surface-2);
  color: var(--ink-2);
  font-size: 12px;
  line-height: 1.7;
  max-height: 120px;
  overflow-y: auto;
  white-space: pre-wrap;
}

.extract-dialog__error {
  margin-top: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #fdeceb;
  color: #b3362d;
  font-size: 12px;
}

.extract-dialog__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 20px 20px;
}

.extract-dialog__btn {
  padding: 8px 16px;
  border: 1px solid transparent;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.extract-dialog__btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.extract-dialog__btn--ghost {
  background: transparent;
  border-color: var(--line);
  color: var(--ink-2);
}

.extract-dialog__btn--ghost:hover:not(:disabled) {
  background: var(--surface-2);
}

.extract-dialog__btn--primary {
  background: var(--brand);
  color: #fff;
}

.extract-dialog__btn--primary:hover:not(:disabled) {
  background: var(--brand-strong);
}

@keyframes dialogIn {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
</style>
