<template>
  <div class="cg" ref="rootRef" :style="{ '--cg-cell': `${cellSize}px` }">
    <div class="cg__table">
      <!-- 月份行 + 格子行放入同一横向滚动容器：窄窗口滚动时标签与格子保持对齐 -->
      <div class="cg__scroll">
        <!-- 顶部月份标签行：左列与星期标签列同宽占位，保证月份与格子列对齐 -->
        <div class="cg__months-row">
          <div class="cg__weekday-col" aria-hidden="true"></div>
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
        </div>

        <!-- 星期标签与格子：同一行内并排、同 grid 行高，保证纵轴严格对齐 -->
        <div class="cg__grid-row">
          <div class="cg__weekday-col" aria-hidden="true">
            <span
              v-for="(label, index) in WEEKDAY_LABELS"
              :key="label"
              :style="{ gridRow: index * 2 + 1 }"
            >{{ label }}</span>
          </div>
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
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { toDateKey, type DailyCounts } from '../../utils/learning-stats'

/**
 * GitHub 风格学习频率格子图：
 * 近一年（53 周）× 7 天，每格表示一天，当天学习次数（问答/复习/笔记总和）越多颜色越深（绿色分层），悬停显示当日明细。
 * - 格子尺寸按容器宽度自适应：尽量填满容器宽度，纵向保持紧凑。
 * - 纵轴（周一/周三/周五）与横轴（月份）文字与格子严格对齐。
 */

const props = withDefaults(
  defineProps<{
    /** dateKey（YYYY-MM-DD，本地时区）→ 当日次数 */
    daily: Record<string, DailyCounts>
    /** 全年视图展示周数（GitHub 为 53） */
    weekCount?: number
  }>(),
  { weekCount: 53 },
)

const WEEKDAY_LABELS = ['周一', '周三', '周五']
const DAYS_PER_WEEK = 7

/* 布局尺寸常量（与 style 中对应值保持一致） */
const WEEKDAY_COL_WIDTH = 30 // 星期标签列宽（--cg-weekday-col）
const ROW_GAP = 8 // 月份行 / 格子行内 星期列与格子的间距
const CELL_GAP = 3 // 格子间间距
const MIN_CELL = 8 // 格子尺寸下限（超窄容器兜底）
const MAX_CELL = 28 // 格子尺寸上限（适中大小：横向自然铺开，纵向不超高）

/** 根容器引用：用于测量可用宽度 */
const rootRef = ref<HTMLElement | null>(null)
/** 根容器当前内容宽度（px） */
const gridWidth = ref(0)
let resizeObserver: ResizeObserver | null = null

function measure() {
  if (!rootRef.value) return
  const width = rootRef.value.clientWidth
  if (typeof width === 'number') gridWidth.value = width
}

onMounted(() => {
  measure()
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => measure())
    if (rootRef.value) resizeObserver.observe(rootRef.value)
  } else {
    window.addEventListener('resize', measure)
  }
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  window.removeEventListener('resize', measure)
})

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

/** 所在周的周一（getDay()：0=周日 … 6=周六；row 约定周一=0） */
function mondayOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
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

function buildCell(date: Date, column: number): GraphCell {
  const key = toDateKey(date)
  const counts = props.daily[key] ?? { qa: 0, review: 0, note: 0 }
  const total = counts.qa + counts.review + counts.note
  const parts: string[] = []
  if (counts.qa > 0) parts.push(`问答 ${counts.qa}`)
  if (counts.review > 0) parts.push(`复习 ${counts.review}`)
  if (counts.note > 0) parts.push(`笔记 ${counts.note}`)
  return {
    key,
    date,
    column,
    row: (date.getDay() + 6) % DAYS_PER_WEEK, // 周一=0 … 周日=6
    counts,
    total,
    level: levelOf(total),
    dateLabel: `${date.getMonth() + 1}月${date.getDate()}日`,
    tipText: parts.length > 0 ? `${date.getMonth() + 1}月${date.getDate()}日：${parts.join('，')}` : `${date.getMonth() + 1}月${date.getDate()}日：无学习`,
  }
}

const today = new Date()

/** 全年视图：今天所在周的周一往前推 (周数-1) 周起，连续 周数×7 天 */
const cells = computed<GraphCell[]>(() => {
  const firstDate = mondayOfWeek(today)
  firstDate.setDate(firstDate.getDate() - (props.weekCount - 1) * DAYS_PER_WEEK)
  const list: GraphCell[] = []
  for (let i = 0; i < props.weekCount * DAYS_PER_WEEK; i++) {
    const date = addDays(firstDate, i)
    list.push(buildCell(date, Math.floor(i / DAYS_PER_WEEK)))
  }
  return list
})

/** 列数：展示周数 */
const columnCount = computed<number>(() => props.weekCount)

/**
 * 格子边长：按容器可用宽度均分填满，限制在 [MIN_CELL, MAX_CELL]。
 * 未测量到宽度（如测试环境）时回退 10px。
 */
const cellSize = computed(() => {
  const width = gridWidth.value
  if (!width || width <= 0) return 10
  const cols = columnCount.value
  const gridArea = width - WEEKDAY_COL_WIDTH - ROW_GAP
  const cell = (gridArea - (cols - 1) * CELL_GAP) / cols
  return Math.min(MAX_CELL, Math.max(MIN_CELL, Math.floor(cell)))
})

/** 月份标签：列首天所在月份变化处显示（GitHub 风格，逐月分布） */
const monthLabels = computed<string[]>(() => {
  const labels: string[] = []
  let lastMonth = -1
  const firstDate = mondayOfWeek(today)
  firstDate.setDate(firstDate.getDate() - (props.weekCount - 1) * DAYS_PER_WEEK)
  for (let col = 0; col < columnCount.value; col++) {
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
  --cg-weekday-col: 30px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 11px;
  color: var(--ink-3, #7a8a84);
}

/* 表格主体：月份行 + 格子行，两行共享同一左列宽度；整体按内容宽度居中，留白均匀分布 */
.cg__table {
  align-self: center;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* 横向容器：不显示滚动条（格子尺寸自适应已尽量适配容器宽度，极端窄窗口裁剪而非滚动） */
.cg__scroll {
  overflow: hidden;
}

.cg__months-row,
.cg__grid-row {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

/* 星期标签列：宽度固定，grid 行高与格子严格一致 */
.cg__weekday-col {
  width: var(--cg-weekday-col);
  flex-shrink: 0;
  display: grid;
  grid-template-rows: repeat(7, var(--cg-cell));
  gap: 3px;
  min-height: calc(7 * var(--cg-cell) + 6 * 3px);
}

.cg__weekday-col span {
  display: flex;
  align-items: center;
  font-size: 10px;
  line-height: 1;
}

/* 月份标签行：列宽与格子一致，文字左边缘与对应列对齐（允许向右溢出） */
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

/* 格子区 */
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
