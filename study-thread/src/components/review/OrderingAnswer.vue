<template>
  <div class="review-answer review-answer--ordering">
    <p class="review-answer__hint">以下步骤为乱序，用「↑/↓」调整顺序后提交：</p>
    <ol class="review-answer__steps">
      <li v-for="(step, index) in ordered" :key="index" class="review-answer__step">
        <span class="review-answer__step-index">{{ index + 1 }}</span>
        <span class="review-answer__step-text">{{ step }}</span>
        <button
          class="review-answer__move"
          type="button"
          :disabled="disabled || index === 0"
          aria-label="上移"
          @click="move(index, -1)"
        >
          ↑
        </button>
        <button
          class="review-answer__move"
          type="button"
          :disabled="disabled || index === ordered.length - 1"
          aria-label="下移"
          @click="move(index, 1)"
        >
          ↓
        </button>
      </li>
    </ol>
    <button class="review-answer__submit" type="button" :disabled="disabled" @click="submit">
      提交顺序
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  /** 乱序步骤列表（初始渲染即乱序，用户重排） */
  steps: string[]
  disabled?: boolean
}>()

const emit = defineEmits<{
  /** payload: string[]（重排后的完整步骤文本）→ 父级经 serializeAnswer('ordering', payload) 序列化 */
  submit: [payload: string[]]
}>()

const ordered = ref([...props.steps])

function move(index: number, delta: number) {
  const target = index + delta
  if (target < 0 || target >= ordered.value.length) return
  const list = ordered.value
  const item = list[index]
  list.splice(index, 1)
  list.splice(target, 0, item)
  ordered.value = [...list]
}

function submit() {
  if (props.disabled) return
  emit('submit', [...ordered.value])
}
</script>

<style scoped>
.review-answer {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}

.review-answer__hint {
  margin: 0;
  font-size: 12px;
  color: var(--ink-2);
}

.review-answer__steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.review-answer__step {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
  transition: border-color 0.15s;
}

.review-answer__step:hover {
  border-color: #b9c9bf;
}

.review-answer__step-index {
  flex: none;
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-family: Georgia, 'Songti SC', serif;
  font-size: 12px;
  font-weight: 700;
  color: var(--brand);
  background: var(--brand-soft);
}

.review-answer__step-text {
  flex: 1;
  font-size: 14px;
  line-height: 1.5;
  color: var(--ink);
}

.review-answer__move {
  flex: none;
  width: 30px;
  height: 30px;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  background: transparent;
  cursor: pointer;
  font: inherit;
  font-size: 14px;
  line-height: 1;
  color: var(--ink-2);
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}

.review-answer__move:hover:not(:disabled) {
  border-color: var(--brand);
  color: var(--brand);
  background: var(--brand-soft);
}

.review-answer__move:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.review-answer__submit {
  align-self: flex-end;
  padding: 9px 22px;
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
