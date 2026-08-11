<template>
  <div class="review-session-list">
    <div v-if="loading && sessions.length === 0" class="review-session-loading">
      <span class="review-session-loading__dot" />
      <p>正在加载复习会话…</p>
    </div>

    <div v-else-if="sessions.length > 0" class="review-session-stack">
      <button
        v-for="item in sessions"
        :key="item.id"
        class="review-session-item"
        type="button"
        @click="$emit('open', item.id)"
      >
        <div class="review-session-item__head">
          <span class="review-session-item__title">{{ item.title }}</span>
          <span
            class="review-session-item__badge"
            :class="{ 'is-done': item.completed }"
          >
            {{ item.completed ? '已完成' : '进行中' }}
          </span>
        </div>
        <div class="review-session-item__meta">
          <span v-if="item.reviewedNote" class="review-session-item__note" :title="item.reviewedNote">
            {{ item.reviewedNote }}
          </span>
          <span>{{ item.questionCount }} 题</span>
          <span>{{ formatTime(item.created) }}</span>
        </div>
      </button>
    </div>

    <div v-else class="review-session-empty">
      还没有复习会话。从学习地图开始一次复习后，记录会保留在这里，方便回看错题与反馈。
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ReviewSessionMeta } from '../../utils/review-session'

defineProps<{
  sessions: ReviewSessionMeta[]
  /** 列表异步加载中：显示加载占位，避免空状态闪现 */
  loading?: boolean
}>()

defineEmits<{
  open: [sessionId: string]
}>()

/** ISO 时间 → 本地 "YYYY-MM-DD HH:mm" */
function formatTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
</script>

<style scoped>
.review-session-list {
  width: 100%;
}

.review-session-stack {
  display: grid;
  gap: 12px;
}

.review-session-item {
  width: 100%;
  padding: 14px 16px;
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  background: var(--surface);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.review-session-item:hover {
  border-color: var(--brand);
  background: var(--brand-soft);
}

.review-session-item__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.review-session-item__title {
  min-width: 0;
  overflow: hidden;
  color: var(--ink);
  font-size: 14px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.review-session-item__badge {
  flex-shrink: 0;
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--brand-soft);
  color: var(--brand);
  font-size: 11px;
  font-weight: 650;
}

.review-session-item__badge.is-done {
  color: var(--state-success);
  background: color-mix(in srgb, var(--state-success) 12%, transparent);
}

.review-session-item__meta {
  display: flex;
  align-items: center;
  gap: 14px;
  color: var(--ink-2);
  font-size: 12px;
}

.review-session-item__note {
  min-width: 0;
  overflow: hidden;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.review-session-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 64px 24px;
  color: var(--ink-2);
  font-size: 13px;
}

.review-session-loading__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--brand);
  animation: review-session-pulse 1s ease-in-out infinite;
}

@keyframes review-session-pulse {
  0%,
  100% {
    opacity: 0.35;
    transform: scale(0.85);
  }
  50% {
    opacity: 1;
    transform: scale(1.1);
  }
}

.review-session-empty {
  padding: 64px 24px;
  border: 1px dashed var(--line);
  border-radius: 12px;
  color: var(--ink-2);
  text-align: center;
  font-size: 13px;
}
</style>
