<template>
  <div class="learning-hub">
    <!-- 知识图谱总览视图 -->
    <template v-if="currentView === 'overview'">
      <section class="learning-hub__intro" aria-labelledby="focus-title">
        <div class="eyebrow">Today's learning loop</div>
        <h2 id="focus-title" class="learning-hub__hero-title">把理解留在可回溯的路径上</h2>
        <p class="learning-hub__hero-desc">
          从一处被划线的判断开始，把它压缩成可检验的解释，再用追问、练习与复习确认理解。
        </p>
      </section>

      <!-- 学习线索 -->
      <section class="learning-line" aria-label="学习线索">
        <div class="line-step">
          <span class="step-no">01</span>
          <span class="step-name">划线</span>
          <span class="step-detail">捕捉值得停下的判断</span>
        </div>
        <span class="line-arrow" aria-hidden="true"></span>
        <div class="line-step">
          <span class="step-no">02</span>
          <span class="step-name">原子笔记</span>
          <span class="step-detail">压缩为一个可复用观点</span>
        </div>
        <span class="line-arrow" aria-hidden="true"></span>
        <div class="line-step current">
          <span class="step-no">03 · NOW</span>
          <span class="step-name">分支追问</span>
          <span class="step-detail">暴露解释中的跳步</span>
        </div>
        <span class="line-arrow" aria-hidden="true"></span>
        <div class="line-step">
          <span class="step-no">04</span>
          <span class="step-name">练习</span>
          <span class="step-detail">用白话组织因果结构</span>
        </div>
        <span class="line-arrow" aria-hidden="true"></span>
        <div class="line-step">
          <span class="step-no">05</span>
          <span class="step-name">复习</span>
          <span class="step-detail">在间隔后重新提取</span>
        </div>
      </section>

      <!-- 统计卡片 -->
      <div class="learning-hub__stats">
        <div class="stat-card">
          <div class="stat-card__value">{{ stats.totalSessions }}</div>
          <div class="stat-card__label">总会话</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__value">{{ stats.totalNotes }}</div>
          <div class="stat-card__label">总笔记</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__value">{{ stats.activeDays }}</div>
          <div class="stat-card__label">本月学习天数</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__value">{{ stats.avgDepth.toFixed(1) }}</div>
          <div class="stat-card__label">平均追问深度</div>
        </div>
      </div>

      <!-- 会话树 -->
      <div class="learning-hub__section">
        <BranchTree
          :tree="sessionTree"
          @select-node="handleSelectNode"
        />
      </div>

      <!-- 最近活动 -->
      <div class="learning-hub__section">
        <div class="activity-panel">
          <h3 class="activity-panel__title">最近活动</h3>
          <div class="activity-panel__list" v-if="recentActivities.length > 0">
            <div
              v-for="(item, index) in recentActivities"
              :key="index"
              class="activity-item"
              @click="handleActivityClick(item)"
            >
              <span class="activity-item__icon">
                <BookOpen v-if="item.type === 'session'" :size="14" />
                <FileText v-else :size="14" />
              </span>
              <span class="activity-item__text">{{ item.label }}</span>
              <span class="activity-item__time">{{ item.time }}</span>
            </div>
          </div>
          <div v-else class="activity-panel__empty">
            暂无活动记录
          </div>
        </div>
      </div>

      <!-- 快速入口 -->
      <div class="learning-hub__quick">
        <button class="quick-btn" @click="router.push('/chat')">
          <MessageSquare :size="16" />
          <span>开始新会话</span>
        </button>
        <button class="quick-btn" @click="router.push('/notes')">
          <FileText :size="16" />
          <span>查看所有笔记</span>
        </button>
      </div>
    </template>

    <!-- 概念关系网络视图 -->
    <template v-else-if="currentView === 'network'">
      <section class="learning-hub__intro" aria-labelledby="network-title">
        <div class="eyebrow">Concept Network</div>
        <h2 id="network-title" class="learning-hub__hero-title">概念关系网络</h2>
        <p class="learning-hub__hero-desc">
          探索知识节点之间的关联，理解概念之间的因果、类比与层级关系。
        </p>
      </section>

      <div class="concept-network">
        <div class="concept-network__canvas">
          <!-- 概念节点 -->
          <div class="concept-node concept-node--center" style="top: 50%; left: 50%;">
            <span class="concept-node__label">理解</span>
            <span class="concept-node__count">核心概念</span>
          </div>
          <div class="concept-node" style="top: 15%; left: 35%;">
            <span class="concept-node__label">因果结构</span>
            <span class="concept-node__count">12 条关联</span>
          </div>
          <div class="concept-node" style="top: 15%; left: 65%;">
            <span class="concept-node__label">可检验性</span>
            <span class="concept-node__count">8 条关联</span>
          </div>
          <div class="concept-node" style="top: 50%; left: 20%;">
            <span class="concept-node__label">费曼学习法</span>
            <span class="concept-node__count">15 条关联</span>
          </div>
          <div class="concept-node" style="top: 50%; left: 80%;">
            <span class="concept-node__label">工作记忆</span>
            <span class="concept-node__count">10 条关联</span>
          </div>
          <div class="concept-node" style="top: 85%; left: 35%;">
            <span class="concept-node__label">间隔重复</span>
            <span class="concept-node__count">9 条关联</span>
          </div>
          <div class="concept-node" style="top: 85%; left: 65%;">
            <span class="concept-node__label">认知负荷</span>
            <span class="concept-node__count">7 条关联</span>
          </div>

          <!-- 连线 SVG -->
          <svg class="concept-network__lines" viewBox="0 0 800 600" preserveAspectRatio="none">
            <line x1="50%" y1="50%" x2="35%" y2="15%" stroke="#b8c9bf" stroke-width="1.5" />
            <line x1="50%" y1="50%" x2="65%" y2="15%" stroke="#b8c9bf" stroke-width="1.5" />
            <line x1="50%" y1="50%" x2="20%" y2="50%" stroke="#b8c9bf" stroke-width="1.5" />
            <line x1="50%" y1="50%" x2="80%" y2="50%" stroke="#b8c9bf" stroke-width="1.5" />
            <line x1="50%" y1="50%" x2="35%" y2="85%" stroke="#b8c9bf" stroke-width="1.5" />
            <line x1="50%" y1="50%" x2="65%" y2="85%" stroke="#b8c9bf" stroke-width="1.5" />
            <line x1="35%" y1="15%" x2="65%" y2="15%" stroke="#d4ddd6" stroke-width="1" stroke-dasharray="4,4" />
            <line x1="20%" y1="50%" x2="35%" y2="85%" stroke="#d4ddd6" stroke-width="1" stroke-dasharray="4,4" />
            <line x1="80%" y1="50%" x2="65%" y2="85%" stroke="#d4ddd6" stroke-width="1" stroke-dasharray="4,4" />
          </svg>
        </div>

        <!-- 关系列表 -->
        <div class="concept-network__relations">
          <h3 class="activity-panel__title">关系列表</h3>
          <div class="relation-list">
            <div class="relation-item" v-for="rel in conceptRelations" :key="rel.id">
              <span class="relation-item__type" :class="`relation-item__type--${rel.type}`">
                {{ rel.typeLabel }}
              </span>
              <span class="relation-item__from">{{ rel.from }}</span>
              <span class="relation-item__arrow">→</span>
              <span class="relation-item__to">{{ rel.to }}</span>
              <span class="relation-item__desc">{{ rel.desc }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useSessionStore } from '../stores/session'
import { useNoteStore } from '../stores/notes'
import { parseNoteDate } from '../utils/date'
import type { SessionTreeNode } from '../utils/session-tree'
import { BookOpen, FileText, MessageSquare } from '@lucide/vue'
import BranchTree from '../components/chat/BranchTree.vue'

const router = useRouter()
const route = useRoute()
const sessionStore = useSessionStore()
const noteStore = useNoteStore()

const sessionTree = ref<SessionTreeNode | null>(null)
const currentView = ref<'overview' | 'network'>('overview')

interface ConceptRelation {
  id: string
  type: 'causal' | 'analogy' | 'hierarchy' | 'reference'
  typeLabel: string
  from: string
  to: string
  desc: string
}

const conceptRelations = ref<ConceptRelation[]>([
  { id: '1', type: 'causal', typeLabel: '因果', from: '理解', to: '因果结构', desc: '理解是对因果结构的把握' },
  { id: '2', type: 'causal', typeLabel: '因果', from: '理解', to: '可检验性', desc: '真正的理解可被检验' },
  { id: '3', type: 'analogy', typeLabel: '类比', from: '费曼学习法', to: '理解', desc: '用费曼法检验理解深度' },
  { id: '4', type: 'hierarchy', typeLabel: '层级', from: '工作记忆', to: '认知负荷', desc: '工作记忆容量影响认知负荷' },
  { id: '5', type: 'causal', typeLabel: '因果', from: '间隔重复', to: '理解', desc: '间隔重复巩固理解' },
  { id: '6', type: 'reference', typeLabel: '参考', from: '费曼学习法', to: '间隔重复', desc: '费曼法强调间隔复习' },
  { id: '7', type: 'hierarchy', typeLabel: '层级', from: '认知负荷', to: '理解', desc: '认知负荷影响理解效率' },
  { id: '8', type: 'causal', typeLabel: '因果', from: '因果结构', to: '可检验性', desc: '因果结构提供可检验的预测' },
])

interface ActivityItem {
  type: 'session' | 'note'
  label: string
  time: string
  target?: string
}

const recentActivities = ref<ActivityItem[]>([])
const stats = ref({
  totalSessions: 0,
  totalNotes: 0,
  activeDays: 0,
  avgDepth: 0,
})

onMounted(() => {
  sessionTree.value = sessionStore.sessionTree

  // 统计
  stats.value.totalNotes = noteStore.noteCount
  stats.value.totalSessions = sessionStore.sessions.length

  // 最近活动
  const activities: ActivityItem[] = []
  for (const s of sessionStore.sessions) {
    activities.push({
      type: 'session',
      label: s.title,
      time: formatRelativeTime(s.created),
      target: s.id,
    })
  }
  recentActivities.value = activities.slice(0, 10)
})

// 监听路由参数 thread 切换视图
watch(
  () => route.query.thread,
  (threadId) => {
    if (threadId === '7') {
      currentView.value = 'overview'
    } else if (threadId === '8') {
      currentView.value = 'network'
    } else {
      currentView.value = 'overview'
    }
  },
  { immediate: true },
)

function handleSelectNode(nodeId: string) {
  // 跳转到对应会话
  sessionStore.switchSession(nodeId)
  router.push('/chat')
}

function handleActivityClick(item: ActivityItem) {
  if (item.type === 'session') {
    sessionStore.switchSession(item.target || '')
    router.push('/chat')
  }
}

function formatRelativeTime(iso: string): string {
  const d = parseNoteDate(iso)
  if (!d) return ''
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const hours = Math.floor(diff / (1000 * 60 * 60))
  if (hours < 24) return `${hours}小时前`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}天前`
  return `${d.getMonth() + 1}月${d.getDate()}日`
}
</script>

<style scoped>
.learning-hub {
  padding: 42px 54px 72px;
  height: 100%;
  overflow-y: auto;
}

/* 简介区域 */
.learning-hub__intro {
  margin-bottom: 35px;
}

.eyebrow {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
  color: var(--brand);
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.13em;
  text-transform: uppercase;
}

.eyebrow::before {
  width: 22px;
  height: 1px;
  content: '';
  background: var(--brand);
}

.learning-hub__hero-title {
  margin: 0;
  font-family: Georgia, 'Songti SC', serif;
  font-size: 32px;
  font-weight: 600;
  letter-spacing: -0.04em;
  line-height: 1.2;
  color: var(--ink);
}

.learning-hub__hero-desc {
  max-width: 620px;
  margin: 11px 0 0;
  color: var(--ink-2);
  font-size: 14px;
  line-height: 1.7;
}

/* 学习线索 */
.learning-line {
  display: grid;
  grid-template-columns: 1fr 24px 1fr 24px 1fr 24px 1fr 24px 1fr;
  align-items: start;
  margin-bottom: 35px;
}

.line-step {
  position: relative;
  min-height: 118px;
  padding: 16px 13px 13px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: #f8f7f2;
}

.line-step.current {
  border-color: #91b2a2;
  background: var(--brand-soft);
  box-shadow: 0 7px 16px rgba(25, 49, 43, 0.07);
}

.step-no {
  display: block;
  margin-bottom: 16px;
  color: var(--ink-3);
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.1em;
}

.current .step-no {
  color: var(--brand);
}

.step-name {
  display: block;
  font-size: 13px;
  font-weight: 750;
  color: var(--ink);
}

.step-detail {
  display: block;
  margin-top: 6px;
  color: var(--ink-2);
  font-size: 11px;
  line-height: 1.45;
}

.line-arrow {
  align-self: center;
  height: 1px;
  margin: 0 5px;
  background: #b8c9bf;
  position: relative;
}

.line-arrow::after {
  position: absolute;
  right: -1px;
  top: -3px;
  width: 6px;
  height: 6px;
  border-top: 1px solid #8fa99b;
  border-right: 1px solid #8fa99b;
  transform: rotate(45deg);
  content: '';
}

/* 统计卡片 */
.learning-hub__stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  margin-bottom: 28px;
}

.stat-card {
  padding: 16px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  text-align: center;
}

.stat-card__value {
  font-size: 24px;
  font-weight: 700;
  color: var(--brand);
  font-family: Georgia, 'Songti SC', serif;
}

.stat-card__label {
  margin-top: 4px;
  font-size: 12px;
  color: var(--ink-3);
}

.learning-hub__section {
  margin-bottom: 24px;
}

/* 活动面板 */
.activity-panel {
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  overflow: hidden;
  background: var(--surface);
  box-shadow: var(--shadow-1);
}

.activity-panel__title {
  margin: 0;
  padding: 14px 18px;
  font-size: 14px;
  font-weight: 650;
  color: var(--ink);
  border-bottom: 1px solid var(--line);
}

.activity-panel__list {
  padding: 6px;
}

.activity-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: var(--r-md);
  cursor: pointer;
  transition: background 0.15s;
}

.activity-item:hover {
  background: var(--surface-2);
}

.activity-item__icon {
  color: var(--ink-3);
  flex-shrink: 0;
}

.activity-item__text {
  flex: 1;
  font-size: 13px;
  color: var(--ink);
}

.activity-item__time {
  font-size: 11px;
  color: var(--ink-3);
}

.activity-panel__empty {
  padding: 24px;
  text-align: center;
  color: var(--ink-3);
  font-size: 13px;
}

/* 快速入口 */
.learning-hub__quick {
  display: flex;
  gap: 12px;
}

.quick-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 15px;
  border: 1px solid var(--brand);
  border-radius: var(--r-md);
  background: var(--brand);
  color: var(--brand-ink);
  font-size: 12px;
  font-weight: 720;
  cursor: pointer;
  transition: background 0.15s;
}

.quick-btn:hover {
  background: var(--brand-strong);
}

@media (max-width: 1240px) {
  .learning-hub {
    padding: 34px 34px 64px;
  }
}

@media (max-width: 700px) {
  .learning-hub__stats {
    grid-template-columns: repeat(2, 1fr);
  }
  .learning-line {
    grid-template-columns: 1fr;
    gap: 8px;
  }
  .line-arrow {
    display: none;
  }
}

/* 概念关系网络 */
.concept-network {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 24px;
  margin-bottom: 28px;
}

.concept-network__canvas {
  position: relative;
  height: 520px;
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  background: var(--surface);
  overflow: hidden;
}

.concept-network__lines {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.concept-node {
  position: absolute;
  transform: translate(-50%, -50%);
  padding: 12px 16px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: var(--shadow-1);
  text-align: center;
  z-index: 1;
}

.concept-node:hover {
  border-color: var(--brand);
  box-shadow: 0 4px 16px rgba(25, 49, 43, 0.12);
  transform: translate(-50%, -50%) scale(1.05);
}

.concept-node--center {
  background: var(--brand-soft);
  border-color: var(--brand);
  box-shadow: 0 6px 24px rgba(25, 49, 43, 0.1);
}

.concept-node__label {
  display: block;
  font-size: 14px;
  font-weight: 650;
  color: var(--ink);
  white-space: nowrap;
}

.concept-node__count {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  color: var(--ink-3);
}

.concept-network__relations {
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  background: var(--surface);
  overflow: hidden;
  box-shadow: var(--shadow-1);
}

.relation-list {
  padding: 6px;
  max-height: 470px;
  overflow-y: auto;
}

.relation-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: var(--r-md);
  transition: background 0.15s;
}

.relation-item:hover {
  background: var(--surface-2);
}

.relation-item__type {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 650;
  letter-spacing: 0.04em;
}

.relation-item__type--causal {
  background: #e8f5e9;
  color: #2e7d32;
}

.relation-item__type--analogy {
  background: #e3f2fd;
  color: #1565c0;
}

.relation-item__type--hierarchy {
  background: #f3e5f5;
  color: #7b1fa2;
}

.relation-item__type--reference {
  background: #fff3e0;
  color: #e65100;
}

.relation-item__from,
.relation-item__to {
  font-size: 13px;
  color: var(--ink);
  font-weight: 550;
}

.relation-item__arrow {
  color: var(--ink-3);
  font-size: 12px;
  flex-shrink: 0;
}

.relation-item__desc {
  flex: 1;
  font-size: 12px;
  color: var(--ink-2);
  text-align: right;
}

@media (max-width: 900px) {
  .concept-network {
    grid-template-columns: 1fr;
  }
  .concept-network__canvas {
    height: 360px;
  }
}
</style>