<template>
  <div class="learning-hub">
    <div class="learning-hub__header">
      <h1 class="learning-hub__title">学习总览</h1>
      <p class="learning-hub__subtitle">总览你的学习旅程</p>
    </div>

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
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSessionStore } from '../stores/session'
import { useNoteStore } from '../stores/notes'
import type { SessionTreeNode } from '../utils/session-tree'
import { BookOpen, FileText, MessageSquare } from '@lucide/vue'
import BranchTree from '../components/chat/BranchTree.vue'

const router = useRouter()
const sessionStore = useSessionStore()
const noteStore = useNoteStore()

const sessionTree = ref<SessionTreeNode | null>(null)

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

function handleSelectNode(_nodeId: string) {
  // 跳转到对应会话
}

function handleActivityClick(item: ActivityItem) {
  if (item.type === 'session') {
    sessionStore.switchSession(item.target || '')
    router.push('/chat')
  }
}

function formatRelativeTime(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
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
  padding: 32px;
  max-width: 900px;
  margin: 0 auto;
  height: 100%;
  overflow-y: auto;
}

.learning-hub__header {
  margin-bottom: 28px;
}

.learning-hub__title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: var(--ink);
}

.learning-hub__subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--ink-3);
}

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
  border-radius: 12px;
  text-align: center;
}

.stat-card__value {
  font-size: 24px;
  font-weight: 700;
  color: var(--brand);
}

.stat-card__label {
  margin-top: 4px;
  font-size: 12px;
  color: var(--ink-3);
}

.learning-hub__section {
  margin-bottom: 24px;
}

.activity-panel {
  border: 1px solid var(--line);
  border-radius: 12px;
  overflow: hidden;
  background: var(--surface);
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
  border-radius: 8px;
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

.learning-hub__quick {
  display: flex;
  gap: 12px;
}

.quick-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  color: var(--ink);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.quick-btn:hover {
  border-color: var(--brand);
  background: var(--brand-soft);
}

@media (max-width: 700px) {
  .learning-hub__stats {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>