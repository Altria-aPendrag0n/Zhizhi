<template>
  <div class="review-due-list">
    <div v-if="tasks.length === 0" class="review-due-list__empty">
      <div class="review-due-list__empty-mark" aria-hidden="true">
        <span class="review-due-list__empty-mark-dot" />
        <span class="review-due-list__empty-mark-line" />
      </div>
      <div class="review-due-list__empty-title">今天没有到期的复习</div>
      <div class="review-due-list__empty-desc">新摘录的原子笔记会在当天自动进入复习队列。</div>
    </div>

    <div
      v-for="task in tasks"
      :key="task.notePath"
      class="review-card"
      :class="`review-card--${task.type}`"
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
          :class="{ 'is-ongoing': isOngoing(task) }"
          type="button"
          :title="isOngoing(task) ? '继续上次的复习会话' : '进入 AI 复习会话'"
          @click="$emit('start', task)"
        >
          {{ isOngoing(task) ? '继续复习' : '开始复习' }}
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

const props = defineProps<{
  tasks: ReviewTask[]
  boostedPaths?: string[]
  graduatedTasks?: ReviewTask[]
  /** 存在未完成复习会话的笔记路径集合（规范化：分隔符归一 + 小写），命中显示「继续复习」 */
  ongoingPaths?: Set<string>
}>()

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

/** 路径规范化键：统一分隔符 + 小写（与 review-session 收集的 ongoing 路径一致） */
function pathKey(path: string): string {
  return path.replace(/\\/g, '/').toLowerCase()
}

/** 该笔记是否存在未完成的复习会话（有则按钮显示「继续复习」） */
function isOngoing(task: ReviewTask): boolean {
  return props.ongoingPaths?.has(pathKey(task.notePath)) ?? false
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
  padding: 44px 24px;
  border: 1.5px dashed var(--line);
  border-radius: var(--r-lg);
  background: var(--surface);
  text-align: center;
}

.review-due-list__empty-mark {
  position: relative;
  display: inline-flex;
  width: 44px;
  height: 44px;
  margin-bottom: 14px;
  border-radius: 14px;
  background: var(--brand-soft);
}

.review-due-list__empty-mark-dot {
  position: absolute;
  top: 13px;
  left: 50%;
  width: 8px;
  height: 8px;
  transform: translateX(-50%);
  border-radius: 50%;
  background: var(--brand);
}

.review-due-list__empty-mark-line {
  position: absolute;
  top: 26px;
  left: 50%;
  width: 16px;
  height: 1.5px;
  transform: translateX(-50%);
  border-radius: 1px;
  background: var(--brand);
  opacity: 0.55;
}

.review-due-list__empty-title {
  font-family: Georgia, 'Songti SC', serif;
  font-size: 17px;
  font-weight: 600;
  color: var(--ink);
}

.review-due-list__empty-desc {
  margin-top: 8px;
  font-size: 12px;
  color: var(--ink-3);
}

.review-card {
  position: relative;
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 14px;
  padding: 16px 18px 16px 20px;
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  background: var(--surface);
  box-shadow: var(--shadow-1);
  cursor: pointer;
  overflow: hidden;
  transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
}

/* 左侧类型色条：概念/方法/事实/问题 */
.review-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: 3px;
  background: var(--card-type, var(--brand));
}

.review-card--concept::before {
  --card-type: #2e7d5b;
}

.review-card--method::before {
  --card-type: #3f6b72;
}

.review-card--fact::before {
  --card-type: #b0772a;
}

.review-card--question::before {
  --card-type: #7b4f9e;
}

.review-card:hover {
  border-color: #b9c9bf;
  box-shadow: 0 6px 18px rgba(25, 49, 43, 0.1);
  transform: translateY(-1px);
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
  font-family: Georgia, 'Songti SC', serif;
  font-size: 15px;
  font-weight: 600;
  color: var(--ink);
}

.review-card__type {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: var(--r-pill);
  font-size: 10px;
  font-weight: 650;
  letter-spacing: 0.04em;
}

.review-card__boost {
  flex-shrink: 0;
  padding: 2px 8px;
  border: 1px solid #e6c46a;
  border-radius: var(--r-pill);
  background: #fdf4dc;
  color: #92671a;
  font-size: 10px;
  font-weight: 650;
  letter-spacing: 0.04em;
}

.review-card__type--concept {
  background: #e2f1e7;
  color: #2e7d5b;
}

.review-card__type--method {
  background: #e5eff2;
  color: #3f6b72;
}

.review-card__type--fact {
  background: #f8edd9;
  color: #b0772a;
}

.review-card__type--question {
  background: #eee6f4;
  color: #7b4f9e;
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
  margin-top: 10px;
}

.review-card__mastery-track {
  flex: 1;
  max-width: 220px;
  height: 5px;
  border-radius: var(--r-pill);
  background: var(--surface-2);
  overflow: hidden;
}

.review-card__mastery-fill {
  height: 100%;
  border-radius: var(--r-pill);
  background: linear-gradient(90deg, var(--brand-soft), var(--brand));
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
  padding: 7px 11px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
  color: var(--ink-2);
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.review-card__start {
  padding: 7px 14px;
  border: 1px solid var(--brand);
  border-radius: var(--r-md);
  background: var(--brand);
  color: var(--brand-ink);
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(36, 92, 77, 0.24);
  transition: background 0.15s, box-shadow 0.15s, transform 0.15s;
}

.review-card__start:hover {
  background: var(--brand-strong);
  box-shadow: 0 3px 10px rgba(36, 92, 77, 0.3);
  transform: translateY(-1px);
}

/* 「继续复习」：存在未完成复习会话时黄绿色按钮 */
.review-card__start.is-ongoing {
  border-color: #a3b72f;
  background: #bdd441;
  color: #37450c;
  box-shadow: 0 2px 6px rgba(150, 176, 40, 0.3);
}

.review-card__start.is-ongoing:hover {
  background: #a9be35;
  box-shadow: 0 3px 10px rgba(150, 176, 40, 0.38);
}

.review-card__rate:hover {
  border-color: var(--brand);
  color: var(--brand);
  background: var(--brand-soft);
}

.review-card__rate--again:hover {
  border-color: var(--state-error);
  color: var(--state-error);
  background: #f6e8e5;
}

.review-card__rate--good:hover {
  border-color: var(--state-success);
  color: var(--state-success);
  background: #e3efe9;
}

.review-card__rate--hard:hover {
  border-color: var(--state-warning);
  color: var(--state-warning);
  background: #f6eeda;
}

.review-card__rate--easy:hover {
  border-color: var(--brand-strong);
  color: var(--brand-strong);
  background: var(--brand-soft);
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
