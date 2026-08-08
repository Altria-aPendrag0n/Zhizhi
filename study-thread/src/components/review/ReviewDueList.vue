<template>
  <div class="review-due-list">
    <div v-if="tasks.length === 0" class="review-due-list__empty">
      <div class="review-due-list__empty-title">今天没有到期的复习</div>
      <div class="review-due-list__empty-desc">新摘录的原子笔记会在次日自动进入复习队列。</div>
    </div>

    <div
      v-for="task in tasks"
      :key="task.notePath"
      class="review-card"
      @click="$emit('open', task)"
    >
      <div class="review-card__main">
        <div class="review-card__top">
          <span class="review-card__title">{{ task.title }}</span>
          <span v-if="isBoosted(task)" class="review-card__boost">画像弱项</span>
          <span class="review-card__type" :class="`review-card__type--${task.type}`">
            {{ typeLabel(task.type) }}
          </span>
        </div>
        <div class="review-card__meta">
          <span>间隔 {{ task.interval }} 天</span>
          <span v-if="lastRating(task)">上次：{{ ratingLabel(lastRating(task)) }}</span>
        </div>
        <div class="review-card__mastery">
          <div class="review-card__mastery-track">
            <div
              class="review-card__mastery-fill"
              :style="{ width: `${Math.round(task.mastery * 100)}%` }"
            />
          </div>
          <span class="review-card__mastery-label">
            掌握度 {{ Math.round(task.mastery * 100) }}%
          </span>
        </div>
      </div>

      <div class="review-card__actions" @click.stop>
        <button
          class="review-card__start"
          type="button"
          title="进入 AI 复习会话"
          @click="$emit('start', task)"
        >
          开始复习
        </button>
        <button
          v-for="rating in RATINGS"
          :key="rating.value"
          class="review-card__rate"
          :class="`review-card__rate--${rating.value}`"
          type="button"
          :title="rating.hint"
          @click="$emit('rate', task, rating.value)"
        >
          {{ rating.label }}
        </button>
      </div>
    </div>

    <!-- 已毕业（P1 增强）：移出到期清单，可重新激活 -->
    <div v-if="graduatedList.length > 0" class="review-graduated">
      <button
        type="button"
        class="review-graduated__toggle"
        :aria-expanded="graduatedOpen"
        @click="graduatedOpen = !graduatedOpen"
      >
        <span class="review-graduated__summary">
          已毕业 · {{ graduatedList.length }} 条（移出到期清单）
        </span>
        <span class="review-graduated__caret">{{ graduatedOpen ? '收起' : '展开' }}</span>
      </button>
      <ul v-if="graduatedOpen" class="review-graduated__list">
        <li v-for="task in graduatedList" :key="task.notePath" class="review-graduated__item">
          <div class="review-graduated__main">
            <span class="review-graduated__title">{{ task.title }}</span>
            <span class="review-graduated__meta">
              掌握度 {{ Math.round(task.mastery * 100) }}% · 间隔 {{ task.interval }} 天
            </span>
          </div>
          <button
            class="review-graduated__reactivate"
            type="button"
            @click="$emit('reactivate', task)"
          >
            重新激活
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { ReviewRating, ReviewTask } from '../../types'

const props = defineProps<{ tasks: ReviewTask[]; boostedPaths?: string[]; graduatedTasks?: ReviewTask[] }>()

defineEmits<{
  rate: [task: ReviewTask, rating: ReviewRating]
  open: [task: ReviewTask]
  start: [task: ReviewTask]
  reactivate: [task: ReviewTask]
}>()

const graduatedOpen = ref(false)
/** 已毕业任务（prop 可选，缺省为空列表） */
const graduatedList = computed(() => props.graduatedTasks ?? [])

/** 该笔记是否关联到画像 low/medium 置信度概念（画像弱项，P3-3 提权标记） */
function isBoosted(task: ReviewTask): boolean {
  return props.boostedPaths?.includes(task.notePath) ?? false
}

const RATINGS: { value: ReviewRating; label: string; hint: string }[] = [
  { value: 'again', label: '忘了', hint: '完全没记住，回退间隔' },
  { value: 'hard', label: '模糊', hint: '有印象但不完整，保持间隔' },
  { value: 'good', label: '记得', hint: '能复述大意，推进间隔' },
  { value: 'easy', label: '熟练', hint: '能独立解释，大幅推进间隔' },
]

const TYPE_LABELS: Record<string, string> = {
  concept: '概念',
  method: '方法',
  fact: '事实',
  question: '问题',
}

function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? '笔记'
}

function lastRating(task: ReviewTask): ReviewRating | null {
  const last = task.history[task.history.length - 1]
  return last ? last.rating : null
}

function ratingLabel(rating: ReviewRating | null): string {
  if (!rating) return ''
  return RATINGS.find((item) => item.value === rating)?.label ?? rating
}
</script>

<style scoped>
.review-due-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.review-due-list__empty {
  padding: 34px 24px;
  border: 1px dashed var(--line);
  border-radius: var(--r-lg);
  text-align: center;
}

.review-due-list__empty-title {
  font-family: Georgia, 'Songti SC', serif;
  font-size: 16px;
  color: var(--ink);
}

.review-due-list__empty-desc {
  margin-top: 8px;
  font-size: 12px;
  color: var(--ink-3);
}

.review-card {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 14px;
  padding: 15px 16px;
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  background: var(--surface);
  box-shadow: var(--shadow-1);
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.review-card:hover {
  border-color: #91b2a2;
  box-shadow: 0 4px 14px rgba(25, 49, 43, 0.08);
}

.review-card__main {
  flex: 1;
  min-width: 0;
}

.review-card__top {
  display: flex;
  align-items: center;
  gap: 8px;
}

.review-card__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 650;
  color: var(--ink);
}

.review-card__type {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 650;
  letter-spacing: 0.04em;
}

.review-card__boost {
  flex-shrink: 0;
  padding: 2px 8px;
  border: 1px solid #e6b656;
  border-radius: 4px;
  background: #fff8e6;
  color: #a06a00;
  font-size: 10px;
  font-weight: 650;
  letter-spacing: 0.04em;
}

.review-card__type--concept {
  background: #e8f5e9;
  color: #2e7d32;
}

.review-card__type--method {
  background: #e3f2fd;
  color: #1565c0;
}

.review-card__type--fact {
  background: #fff3e0;
  color: #e65100;
}

.review-card__type--question {
  background: #f3e5f5;
  color: #7b1fa2;
}

.review-card__meta {
  display: flex;
  gap: 12px;
  margin-top: 6px;
  font-size: 11px;
  color: var(--ink-3);
}

.review-card__mastery {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 9px;
}

.review-card__mastery-track {
  flex: 1;
  max-width: 220px;
  height: 4px;
  border-radius: 2px;
  background: var(--surface-2);
  overflow: hidden;
}

.review-card__mastery-fill {
  height: 100%;
  border-radius: 2px;
  background: var(--brand);
  transition: width 0.25s ease;
}

.review-card__mastery-label {
  font-size: 11px;
  color: var(--ink-3);
}

.review-card__actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.review-card__rate {
  padding: 6px 10px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
  color: var(--ink-2);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}

.review-card__start {
  padding: 6px 12px;
  border: 1px solid var(--brand);
  border-radius: var(--r-md);
  background: var(--brand);
  color: var(--brand-ink);
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s;
}

.review-card__start:hover {
  background: var(--brand-strong);
}

.review-card__rate:hover {
  border-color: var(--brand);
  color: var(--brand);
  background: var(--brand-soft);
}

.review-card__rate--again:hover {
  border-color: var(--state-error);
  color: var(--state-error);
  background: #f7e9e7;
}

.review-card__rate--easy:hover {
  border-color: var(--state-success);
  color: var(--state-success);
  background: #e7f3ec;
}

@media (max-width: 900px) {
  .review-card {
    flex-direction: column;
  }

  .review-card__actions {
    justify-content: flex-end;
  }
}

/* ---- 已毕业区块（P1 增强）---- */
.review-graduated {
  margin-top: 16px;
  border: 1px dashed var(--line);
  border-radius: var(--r-lg);
  background: var(--surface);
  overflow: hidden;
}

.review-graduated__toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 10px 14px;
  border: 0;
  background: transparent;
  font: inherit;
  cursor: pointer;
}

.review-graduated__toggle:hover {
  background: var(--surface-2);
}

.review-graduated__summary {
  font-size: 12px;
  font-weight: 650;
  color: var(--state-success);
}

.review-graduated__caret {
  font-size: 11px;
  color: var(--ink-3);
}

.review-graduated__list {
  margin: 0;
  padding: 0 14px 10px;
  list-style: none;
}

.review-graduated__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 0;
  border-top: 1px solid var(--line);
}

.review-graduated__main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.review-graduated__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 600;
  color: var(--ink);
}

.review-graduated__meta {
  font-size: 11px;
  color: var(--ink-3);
}

.review-graduated__reactivate {
  flex-shrink: 0;
  padding: 5px 12px;
  border: 1px solid var(--brand);
  border-radius: var(--r-md);
  background: var(--surface);
  color: var(--brand);
  font: inherit;
  font-size: 11px;
  font-weight: 650;
  cursor: pointer;
  transition: all 0.15s;
}

.review-graduated__reactivate:hover {
  background: var(--brand);
  color: var(--brand-ink);
}
</style>
