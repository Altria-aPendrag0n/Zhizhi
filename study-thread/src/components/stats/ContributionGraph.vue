<template>
  <div class="cg">
    <div class="cg__body">
      <!-- 左侧星期标签：周一 / 周三 / 周五 -->
      <div class="cg__weekdays" aria-hidden="true">
        <span v-for="(label, index) in WEEKDAY_LABELS" :key="label" :style="{ gridRow: index + 1 }">{{ label }}</span>
      </div>

      <div class="cg__chart">
        <!-- 顶部月份标签 -->
        <div
          class="cg__months"
          :style="{ gridTemplateColumns: `repeat(${columnCount}, var(--cg-cell))` }"
          aria-hidden="true"
        >
          <span
            v-for="(month, index) in monthLabels"
            :key="`${month}-${index}`"
            class="cg__month-label"
          >
            {{ month }}
          </span>
        </div>

        <!-- 53 周 × 7 天格子 -->
        <div class="cg__grid" :style="{ gridTemplateColumns: `repeat(${columnCount}, var(--cg-cell))` }">
          <div
            v-for="cell in cells"
            :key="cell.key"
            class="cg__cell-wrap"
            :style="{ gridColumn: cell.column + 1, gridRow: cell.row + 1 }"
          >
            <div
              class="cg__cell"
              :class="`cg__cell--lvl${cell.level}`"
              role="img"
              :aria-label="cell.tipText"
            ></div>
            <div class="cg__tip">
              <div class="cg__tip-title">{{ cell.dateLabel }}</div>
              <div class="cg__tip-row" v-if="cell.counts.qa > 0">问答 {{ cell.counts.qa }}</div>
              <div class="cg__tip-row" v-if="cell.counts.review > 0">复习 {{ cell.counts.review }}</div>
              <div class="cg__tip-row" v-if="cell.counts.note > 0">笔记 {{ cell.counts.note }}</div>
              <div class="cg__tip-row" v-if="cell.total === 0">无学习记录</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 图例 -->
    <div class="cg__legend">
      <span class="cg__legend-label">少</span>
      <span v-for="level in 5" :key="level" class="cg__legend-cell" :class="`cg__cell--lvl${level - 1}`"></span>
      <span class="cg__legend-label">多</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { toDateKey, type DailyCounts } from '../../utils/learning-stats'

/**
 * GitHub 风格学习频率格子图：
 * 近一年（53 周）× 7 天，每格表示一天，当天学习次数（问答/复习/笔记总和）越多颜色越深（绿色分层）。
 * 悬停显示当日明细。
 */

const props = withDefaults(
  defineProps<{
    /** dateKey（YYYY-MM-DD，本地时区）→ 当日次数 */
    daily: Record<string, DailyCounts>
    /** 展示周数（GitHub 为 53） */
    weekCount?: number
  }>(),
  { weekCount: 53 },
)

const WEEKDAY_LABELS = ['周一', '周三', '周五']
const DAYS_PER_WEEK = 7

interface GraphCell {
  key: string
  date: Date
  column: number
  row: number
  counts: DailyCounts
  total: number
  level: number
  dateLabel: string
  tipText: string
}

/** 今天所在周的周一（getDay()：0=周日 … 6=周六） */
function mondayOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const offset = day === 0 ? 6 : day - 1
  d.setDate(d.getDate() - offset)
  return d
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

const today = new Date()
const columnCount = computed(() => props.weekCount)
/** 图表起始日期：今天所在周的周一往前推 (周数-1) 周 */
const firstDate = mondayOfWeek(today)
firstDate.setDate(firstDate.getDate() - (props.weekCount - 1) * DAYS_PER_WEEK)

/** 最大单日学习次数（用于颜色分层；无记录时为 1 避免除零） */
const maxCount = computed(() => {
  let max = 1
  for (const counts of Object.values(props.daily)) {
    const total = counts.qa + counts.review + counts.note
    if (total > max) max = total
  }
  return max
})

function levelOf(total: number): number {
  if (total <= 0) return 0
  const span = Math.max(1, maxCount.value - 1)
  // 1..max 均分到 1..4 档
  return 1 + Math.min(3, Math.floor(((total - 1) / span) * 3))
}

const cells = computed<GraphCell[]>(() => {
  const list: GraphCell[] = []
  for (let i = 0; i < props.weekCount * DAYS_PER_WEEK; i++) {
    const date = addDays(firstDate, i)
    const key = toDateKey(date)
    const counts = props.daily[key] ?? { qa: 0, review: 0, note: 0 }
    const total = counts.qa + counts.review + counts.note
    const parts: string[] = []
    if (counts.qa > 0) parts.push(`问答 ${counts.qa}`)
    if (counts.review > 0) parts.push(`复习 ${counts.review}`)
    if (counts.note > 0) parts.push(`笔记 ${counts.note}`)
    list.push({
      key,
      date,
      column: Math.floor(i / DAYS_PER_WEEK),
      row: i % DAYS_PER_WEEK,
      counts,
      total,
      level: levelOf(total),
      dateLabel: `${date.getMonth() + 1}月${date.getDate()}日`,
      tipText: parts.length > 0 ? `${date.getMonth() + 1}月${date.getDate()}日：${parts.join('，')}` : `${date.getMonth() + 1}月${date.getDate()}日：无学习`,
    })
  }
  return list
})

/** 月份标签：列首天月份变化时显示（首列固定显示） */
const monthLabels = computed<string[]>(() => {
  const labels: string[] = []
  let lastMonth = -1
  for (let col = 0; col < props.weekCount; col++) {
    const month = addDays(firstDate, col * DAYS_PER_WEEK).getMonth()
    if (month !== lastMonth) {
      labels.push(`${month + 1}月`)
      lastMonth = month
    } else {
      labels.push('')
    }
  }
  return labels
})
</script>

<style scoped>
.cg {
  --cg-cell: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 11px;
  color: var(--ink-3, #7a8a84);
}

.cg__body {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.cg__weekdays {
  display: grid;
  grid-template-rows: repeat(7, var(--cg-cell));
  gap: 3px;
  flex-shrink: 0;
  min-height: calc(7 * var(--cg-cell) + 6 * 3px);
}

.cg__weekdays span {
  display: flex;
  align-items: center;
  font-size: 10px;
  line-height: 1;
}

.cg__chart {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cg__months {
  display: grid;
  gap: 3px;
  height: 14px;
}

.cg__month-label {
  display: flex;
  align-items: center;
  font-size: 10px;
  line-height: 1;
  white-space: nowrap;
}

.cg__grid {
  display: grid;
  grid-auto-flow: row;
  grid-template-rows: repeat(7, var(--cg-cell));
  gap: 3px;
}

.cg__cell-wrap {
  position: relative;
  width: var(--cg-cell);
  height: var(--cg-cell);
}

.cg__cell {
  width: 100%;
  height: 100%;
  border-radius: 2px;
  background: var(--cg-empty, #ebeee9);
  cursor: pointer;
  transition: transform 0.12s ease;
}

.cg__cell-wrap:hover .cg__cell {
  transform: scale(1.25);
}

.cg__cell--lvl1 { background: var(--cg-l1, #d6ebe0); }
.cg__cell--lvl2 { background: var(--cg-l2, #a3d2b8); }
.cg__cell--lvl3 { background: var(--cg-l3, #66b28d); }
.cg__cell--lvl4 { background: var(--cg-l4, #2f7d5c); }

/* hover 提示卡 */
.cg__tip {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%) translateY(2px);
  z-index: 20;
  min-width: 128px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #1c2b26;
  color: #f2f6f3;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.cg__cell-wrap:hover .cg__tip {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}

.cg__tip-title {
  margin-bottom: 4px;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  white-space: nowrap;
}

.cg__tip-row {
  font-size: 11px;
  line-height: 1.6;
  white-space: nowrap;
}

/* 图例 */
.cg__legend {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 3px;
}

.cg__legend-label {
  margin: 0 4px;
  font-size: 10px;
}

.cg__legend-cell {
  width: var(--cg-cell);
  height: var(--cg-cell);
  border-radius: 2px;
  background: var(--cg-empty, #ebeee9);
}

.cg__legend-cell.cg__cell--lvl1 { background: var(--cg-l1, #d6ebe0); }
.cg__legend-cell.cg__cell--lvl2 { background: var(--cg-l2, #a3d2b8); }
.cg__legend-cell.cg__cell--lvl3 { background: var(--cg-l3, #66b28d); }
.cg__legend-cell.cg__cell--lvl4 { background: var(--cg-l4, #2f7d5c); }
</style>
