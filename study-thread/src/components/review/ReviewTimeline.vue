<template>
  <div class="review-timeline" aria-label="未来一周复习时间轴">
    <div
      v-for="day in days"
      :key="day.dateKey"
      class="review-timeline__day"
      :class="{ 'is-today': day.isToday }"
    >
      <header class="review-timeline__head">
        <span class="review-timeline__date">{{ formatDate(day.date) }}</span>
        <span class="review-timeline__weekday">{{ weekday(day.date) }}</span>
        <span v-if="day.isToday" class="review-timeline__today-tag">今天</span>
        <span class="review-timeline__count" :class="{ 'is-empty': day.tasks.length === 0 }">
          {{ day.tasks.length === 0 ? '无' : day.tasks.length }}
        </span>
      </header>
      <p v-if="day.overdueCount > 0" class="review-timeline__overdue">含 {{ day.overdueCount }} 项逾期</p>
      <ul v-if="day.tasks.length > 0" class="review-timeline__tasks">
        <li v-for="taskItem in visibleTasks(day)" :key="taskItem.notePath" class="review-timeline__task-item">
          <button
            class="review-timeline__task"
            type="button"
            :title="`${taskItem.title}（打开笔记）`"
            @click="emit('open', taskItem.notePath)"
          >
            {{ taskItem.title }}
          </button>
        </li>
      </ul>
      <p v-else class="review-timeline__none">无</p>
      <button
        v-if="day.tasks.length > COLLAPSED_COUNT"
        class="review-timeline__more"
        type="button"
        @click="toggleExpand(day.dateKey)"
      >
        {{ isExpanded(day.dateKey) ? '收起' : `+${day.tasks.length - COLLAPSED_COUNT}` }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { ReviewTask } from '../../types'
import type { ReviewTimelineDay } from '../../utils/review-scheduler'

/** 折叠阈值：每卡默认展示的任务条数，超出部分折叠为「+N」 */
const COLLAPSED_COUNT = 4

defineProps<{
  /** 未来一周逐日聚合数据（buildReviewTimeline 产物） */
  days: ReviewTimelineDay[]
}>()

const emit = defineEmits<{
  /** 点击任务条目：打开笔记详情（回看原文，不触发复习调度） */
  open: [notePath: string]
}>()

const expandedDays = ref<Set<string>>(new Set())

function isExpanded(dateKey: string): boolean {
  return expandedDays.value.has(dateKey)
}

function toggleExpand(dateKey: string) {
  const next = new Set(expandedDays.value)
  if (next.has(dateKey)) next.delete(dateKey)
  else next.add(dateKey)
  expandedDays.value = next
}

function visibleTasks(day: ReviewTimelineDay): ReviewTask[] {
  return isExpanded(day.dateKey) ? day.tasks : day.tasks.slice(0, COLLAPSED_COUNT)
}

function formatDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${month}-${day}`
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function weekday(date: Date): string {
  return WEEKDAYS[date.getDay()]
}
</script>

<style scoped>
.review-timeline {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.review-timeline__day {
  flex: 1 0 0;
  min-width: 118px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
  min-height: 96px;
}

.review-timeline__day.is-today {
  border-color: var(--brand);
  background: var(--brand-soft);
}

.review-timeline__head {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.review-timeline__date {
  font-size: 12px;
  font-weight: 650;
  color: var(--ink);
}

.review-timeline__weekday {
  font-size: 11px;
  color: var(--ink-3);
}

.review-timeline__today-tag {
  padding: 1px 6px;
  border-radius: var(--r-pill);
  background: var(--brand);
  color: var(--brand-ink);
  font-size: 10px;
  font-weight: 650;
}

.review-timeline__count {
  margin-left: auto;
  min-width: 20px;
  padding: 0 6px;
  border-radius: var(--r-pill);
  background: var(--brand-soft);
  color: var(--brand-strong);
  font-size: 11px;
  font-weight: 700;
  text-align: center;
}

.review-timeline__count.is-empty {
  background: var(--surface-2);
  color: var(--ink-3);
  font-weight: 500;
}

.review-timeline__overdue {
  margin: 0;
  font-size: 11px;
  color: var(--state-error);
}

.review-timeline__tasks {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.review-timeline__task {
  display: block;
  width: 100%;
  padding: 3px 6px;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--ink-2);
  font-size: 12px;
  line-height: 1.5;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.review-timeline__task:hover {
  background: var(--brand-soft);
  color: var(--brand-strong);
}

.review-timeline__none {
  margin: 0;
  font-size: 12px;
  color: var(--ink-3);
}

.review-timeline__more {
  align-self: flex-start;
  padding: 2px 8px;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--brand);
  font-size: 11px;
  cursor: pointer;
}

.review-timeline__more:hover {
  background: var(--brand-soft);
}
</style>
