<template>
  <div class="home-page">
    <!-- 未打开 vault 时的引导 -->
    <div v-if="!vaultStore.vaultPath" class="home-page__empty">
      <Sprout :size="30" class="home-page__empty-icon" />
      <h2 class="home-page__empty-title">打开你的学习库，查看学习总览</h2>
      <p class="home-page__empty-desc">选择一个本地 Vault 目录，知枝会在这里记录每一次问答、笔记与复习。</p>
      <button class="home-page__empty-btn" type="button" @click="router.push('/settings')">前往设置打开 Vault</button>
    </div>

    <template v-else>
      <!-- 简介 -->
      <section class="home-hero" aria-labelledby="home-title">
        <div class="eyebrow">Learning Overview</div>
        <h2 id="home-title" class="home-hero__title">你的学习，日积月累</h2>
        <p class="home-hero__desc">
          每一次问答、每一篇笔记、每一轮复习都在沉淀。格子越深，说明那一天你学得越投入。
        </p>
      </section>

      <!-- 统计卡片 -->
      <div class="home-stats">
        <div class="stat-card">
          <div class="stat-card__value">{{ stats?.totalQa ?? '—' }}</div>
          <div class="stat-card__label">累计问答</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__value">{{ stats?.totalReview ?? '—' }}</div>
          <div class="stat-card__label">累计复习</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__value">{{ stats?.totalNote ?? '—' }}</div>
          <div class="stat-card__label">累计笔记</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__value">{{ stats?.totalDays ?? '—' }}</div>
          <div class="stat-card__label">学习天数</div>
        </div>
        <div class="stat-card stat-card--brand">
          <div class="stat-card__value">{{ stats?.streakDays ?? '—' }}</div>
          <div class="stat-card__label">连续学习 · 天</div>
        </div>
      </div>

      <!-- 学习频率格子图 -->
      <section class="home-section" aria-labelledby="frequency-title">
        <div class="home-section__header">
          <h3 id="frequency-title" class="home-section__title">学习频率</h3>
          <span class="home-section__hint">近一年每天的学习次数（问答 + 复习 + 笔记），颜色越深学习越多</span>
        </div>
        <div class="home-section__card">
          <div v-if="loading" class="home-loading">
            <span class="home-loading__spinner" aria-hidden="true"></span>
            正在统计学习记录…
          </div>
          <ContributionGraph v-else-if="stats" :daily="dailyMap" />
          <div v-else class="home-loading">暂无学习记录</div>
        </div>
      </section>

      <!-- 快速入口 -->
      <div class="home-quick">
        <button class="quick-btn quick-btn--primary" type="button" @click="startNewChat">
          <MessageSquare :size="16" />
          <span>开始新会话</span>
        </button>
        <button class="quick-btn" type="button" @click="router.push('/notes')">
          <FileText :size="16" />
          <span>查看所有笔记</span>
        </button>
        <button class="quick-btn" type="button" @click="router.push('/hub')">
          <Map :size="16" />
          <span>打开学习地图</span>
        </button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Sprout, MessageSquare, FileText, Map } from '@lucide/vue'
import ContributionGraph from '../components/stats/ContributionGraph.vue'
import { useVaultStore } from '../stores/vault'
import { useNoteStore } from '../stores/notes'
import { collectLearningStats, type DailyCounts, type LearningStats } from '../utils/learning-stats'

const router = useRouter()
const vaultStore = useVaultStore()
const noteStore = useNoteStore()
/** 知枝学习项目下新建会话（由 App 提供） */
const createNewThread = inject<(projectId?: string) => void>('createNewThread', () => {})

const stats = ref<LearningStats | null>(null)
const loading = ref(false)

/** ContributionGraph 需要普通对象映射 */
const dailyMap = computed<Record<string, DailyCounts>>(() => {
  if (!stats.value) return {}
  return Object.fromEntries(stats.value.daily)
})

onMounted(async () => {
  if (!vaultStore.vaultPath) return
  loading.value = true
  try {
    // 复用笔记 store 的元数据（避免重复扫描 notes/ 目录）
    if (noteStore.notes.length === 0) await noteStore.loadAllNotes(vaultStore.vaultPath)
    stats.value = await collectLearningStats(vaultStore.vaultPath, noteStore.notes)
  } catch (e) {
    console.warn('学习统计加载失败:', e)
    stats.value = null
  } finally {
    loading.value = false
  }
})

function startNewChat() {
  createNewThread('1')
}
</script>

<style scoped>
.home-page {
  box-sizing: border-box;
  min-height: 100%;
  padding: 34px 48px 64px;
  overflow-y: auto;
}

/* 空态引导 */
.home-page__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  text-align: center;
}

.home-page__empty-icon {
  color: var(--brand);
  margin-bottom: 16px;
}

.home-page__empty-title {
  margin: 0;
  font-family: Georgia, 'Songti SC', serif;
  font-size: 24px;
  font-weight: 600;
  color: var(--ink);
}

.home-page__empty-desc {
  max-width: 380px;
  margin: 10px 0 22px;
  color: var(--ink-2);
  font-size: 13px;
  line-height: 1.7;
}

.home-page__empty-btn {
  padding: 10px 18px;
  border: 0;
  border-radius: var(--r-md);
  background: var(--brand);
  color: var(--brand-ink);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

/* 简介 */
.home-hero {
  margin-bottom: 30px;
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

.home-hero__title {
  margin: 0;
  font-family: Georgia, 'Songti SC', serif;
  font-size: 32px;
  font-weight: 600;
  letter-spacing: -0.04em;
  line-height: 1.2;
  color: var(--ink);
}

.home-hero__desc {
  max-width: 620px;
  margin: 11px 0 0;
  color: var(--ink-2);
  font-size: 14px;
  line-height: 1.7;
}

/* 统计卡片 */
.home-stats {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 14px;
  margin-bottom: 30px;
}

.stat-card {
  padding: 18px 16px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  text-align: center;
}

.stat-card__value {
  font-size: 26px;
  font-weight: 700;
  color: var(--brand);
  font-family: Georgia, 'Songti SC', serif;
  line-height: 1.1;
}

.stat-card--brand {
  background: var(--brand-soft);
  border-color: #91b2a2;
}

.stat-card__label {
  margin-top: 6px;
  font-size: 12px;
  color: var(--ink-3);
}

/* 学习频率区 */
.home-section {
  margin-bottom: 30px;
}

.home-section__header {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 12px;
}

.home-section__title {
  margin: 0;
  font-size: 14px;
  font-weight: 650;
  color: var(--ink);
}

.home-section__hint {
  font-size: 11px;
  color: var(--ink-3);
}

.home-section__card {
  padding: 20px 22px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-1);
}

/* 加载态 */
.home-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 36px 0;
  color: var(--ink-3);
  font-size: 13px;
}

.home-loading__spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--brand-soft);
  border-top-color: var(--brand);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 快速入口 */
.home-quick {
  display: flex;
  gap: 12px;
}

.quick-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 15px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
  color: var(--ink);
  font-size: 12px;
  font-weight: 720;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}

.quick-btn:hover {
  border-color: var(--brand);
  color: var(--brand);
}

.quick-btn--primary {
  border-color: var(--brand);
  background: var(--brand);
  color: var(--brand-ink);
}

.quick-btn--primary:hover {
  background: var(--brand-strong);
  color: var(--brand-ink);
}

@media (max-width: 1240px) {
  .home-page {
    padding: 34px 34px 64px;
  }
}

@media (max-width: 1000px) {
  .home-stats {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 700px) {
  .home-page {
    padding: 24px 20px 56px;
  }
  .home-stats {
    grid-template-columns: repeat(2, 1fr);
  }
  .home-quick {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
