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
  gap: 8px;
  width: 100%;
}

.review-answer__hint {
  margin: 0;
  font-size: 12px;
  color: var(--muted-foreground, #6b7280);
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
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--border, #e2e2e2);
  border-radius: 8px;
  background: var(--card, #ffffff);
}

.review-answer__step-index {
  flex: none;
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-primary, #4f7cff);
  background: color-mix(in srgb, var(--color-primary, #4f7cff) 10%, transparent);
}

.review-answer__step-text {
  flex: 1;
  font-size: 14px;
  color: var(--foreground, #1f2328);
}

.review-answer__move {
  flex: none;
  width: 28px;
  height: 28px;
  border: 1px solid var(--border, #e2e2e2);
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
}

.review-answer__move:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.review-answer__submit {
  align-self: flex-end;
  padding: 8px 20px;
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
