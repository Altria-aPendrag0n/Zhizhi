<template>
  <div class="learning-hub-page">
    <div class="learning-hub-layout">
      <!-- 学习地图切换管理栏：多个视图间切换，不涉及会话新建 -->
      <aside class="hub-sidebar">
        <nav class="hub-nav" aria-label="学习地图视图">
          <button
            class="hub-nav__item"
            :class="{ active: currentView === 'review' }"
            type="button"
            @click="switchView('review')"
          >
            复习
            <span v-if="reviewStore.dueCount > 0" class="hub-nav__badge">
              {{ reviewStore.dueCount }}
            </span>
          </button>
          <button
            class="hub-nav__item"
            :class="{ active: currentView === 'network' }"
            type="button"
            @click="switchView('network')"
          >
            认知地图（开发中）
          </button>
        </nav>
      </aside>

      <div class="hub-content">
        <div class="learning-hub">
          <!-- 复习视图：到期间隔复习 -->
          <template v-if="currentView === 'review'">
      <section class="learning-hub__intro" aria-labelledby="review-title">
        <div class="eyebrow">Spaced Repetition</div>
        <h2 id="review-title" class="learning-hub__hero-title">复习 · 在间隔后重新提取</h2>
        <p class="learning-hub__hero-desc">
          到期笔记按遗忘优先级排列。复习后按记忆情况评级，系统据此安排下一次间隔。
        </p>
      </section>

      <div class="learning-hub__section">
        <ReviewDueList
          :tasks="reviewStore.dueTasks"
          :boosted-paths="reviewStore.boostedNotePaths"
          :graduated-tasks="reviewStore.graduatedTasks"
          :ongoing-paths="ongoingNotePaths"
          @rate="handleRate"
          @open="handleOpenReview"
          @start="handleStartReview"
          @reactivate="handleReactivate"
        />
      </div>
    </template>

    <!-- 认知地图视图（开发中） -->
    <template v-else-if="currentView === 'network'">
      <section class="learning-hub__intro" aria-labelledby="network-title">
        <div class="eyebrow">Concept Network</div>
        <h2 id="network-title" class="learning-hub__hero-title">认知地图（开发中）</h2>
        <p class="learning-hub__hero-desc">
          探索知识节点之间的关联，理解概念之间的因果、类比与层级关系。此视图仍在开发中。
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
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useNoteStore } from '../stores/notes'
import { useReviewStore } from '../stores/review'
import { useVaultStore } from '../stores/vault'
import { useSettingsStore } from '../stores/settings'
import { useToast } from '../composables/useToast'
import type { Note, ReviewQuestion, ReviewRating, ReviewTask } from '../types'
import { createProvider } from '../api/provider-factory'
import { generateReviewQuestions, generateClusterQuestions, shouldSuggestGraduation } from '../api/skills/review-quiz'
import { loadLearnerProfile, describeLearnerProfile } from '../utils/learner-profile'
import { describeDifficultyContext, estimateNoteDifficulty, noteDifficultyBandFromLength } from '../utils/review-difficulty'
import { buildReviewRelatedNotes, createReviewSession, findIncompleteReviewSession, listOngoingReviewNotePaths } from '../utils/review-session'
import { buildReviewCluster } from '../utils/review-cluster'
import { saveSessionToVault } from '../utils/session-serializer'
import ReviewDueList from '../components/review/ReviewDueList.vue'

const router = useRouter()
const route = useRoute()
const noteStore = useNoteStore()
const reviewStore = useReviewStore()
const vaultStore = useVaultStore()
const settingsStore = useSettingsStore()
const toast = useToast()

/** 当前视图：由左侧"学习地图切换管理栏"控制；默认复习视图，支持 ?view=review|network 深链接 */
const currentView = ref<'review' | 'network'>(route.query.view === 'network' ? 'network' : 'review')

/** 存在未完成复习会话的笔记路径集合（规范化键），供 ReviewDueList 显示「继续复习」 */
const ongoingNotePaths = ref<Set<string>>(new Set())

/** 切换学习地图视图并同步 URL query，保证外部入口（主界面待复习 → view=review）可直达 */
function switchView(view: 'review' | 'network') {
  currentView.value = view
  router.replace({ query: { view } })
}

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

onMounted(() => {
  // 加载复习队列（vault 就绪时；未打开 vault 时队列为空），并补录存量笔记（幂等）
  if (vaultStore.vaultPath) {
    void reviewStore.syncQueueWithNotes(vaultStore.vaultPath)
    // 收集有进行中复习会话的笔记，供「开始复习 / 继续复习」按钮切换
    void refreshOngoingSessions()
  }
})

/** 刷新进行中复习会话的笔记路径集合（失败静默置空，不影响复习列表） */
async function refreshOngoingSessions() {
  const vaultPath = vaultStore.vaultPath
  if (!vaultPath) return
  try {
    ongoingNotePaths.value = new Set(await listOngoingReviewNotePaths(vaultPath))
  } catch {
    ongoingNotePaths.value = new Set()
  }
}

/** 复习评级：回写复习队列并轻提示下一次间隔 */
async function handleRate(task: ReviewTask, rating: ReviewRating) {
  const updated = await reviewStore.applyReview(task.notePath, rating)
  if (updated) {
    toast.success(`已评级「${ratingLabel(rating)}」，${updated.interval} 天后再次复习`)
  }
}

/** 打开笔记详情（从复习卡片跳转） */
function handleOpenReview(task: ReviewTask) {
  router.push(`/notes/${encodeURIComponent(task.notePath)}`)
}

/** 重新激活已毕业任务（P1 增强）：回到到期清单，立即安排复习 */
async function handleReactivate(task: ReviewTask) {
  const updated = await reviewStore.reactivate(task.notePath)
  if (updated) {
    toast.success(`已重新激活「${task.title}」，已回到到期清单`)
  } else {
    toast.error('重新激活失败：任务不在复习队列')
  }
}

/**
 * 开始复习：出题（未配置 AI 则进入原文模式）→ 创建复习会话 → 跳转复习页
 */
async function handleStartReview(task: ReviewTask) {
  const vaultPath = vaultStore.vaultPath
  if (!vaultPath) {
    toast.error('请先在设置中选择本地 Vault')
    return
  }
  // 复用进行中的复习会话：该笔记已有未完成的复习会话时直接继续，
  // 不重复调用 LLM 出题（出题结果已随会话文件持久化，节省 token）
  const existingSessionId = await findIncompleteReviewSession(vaultPath, task.notePath)
  if (existingSessionId) {
    toast.info('继续上次的复习会话（复用已生成题目）')
    router.push(`/review/${encodeURIComponent(existingSessionId)}`)
    return
  }
  const note = await noteStore.loadNote(task.notePath)
  if (!note) {
    toast.error('笔记不存在或无法读取')
    return
  }

  // 装载关联笔记（wikilink/同标签），供出题参考
  if (noteStore.notes.length === 0) await noteStore.loadAllNotes(vaultPath)
  const allNotes: Note[] = []
  for (const meta of noteStore.notes) {
    const full = await noteStore.loadNote(meta.path)
    if (full) allNotes.push(full)
  }
  const relatedNotes = buildReviewRelatedNotes(note, allNotes)
  // P4 簇复习：以到期笔记为中心取 wikilink/反链 1 度邻居构成复习簇（无邻居 → 单条复习保持 P2 行为）
  const cluster = buildReviewCluster(note.path, allNotes)
  const clusterMode = cluster.length > 1

  // 出题（无 API Key 或出题失败时 questions 为空 → 原文复习模式）
  const config = settingsStore.getProviderConfig()
  let questions: ReviewQuestion[] = []
  if (config.apiKey) {
    // 等待出题期间全屏忙碌遮罩由 provider 层（busyMessage）自动打开，避免反复点击"开始复习"重复创建会话
    try {
      // P3-4 难度个性化：加载画像注入出题 prompt；高置信度 + 高掌握度时附毕业引导
      const profile = await loadLearnerProfile(vaultPath)
      const learnerProfile = describeLearnerProfile(profile)
      // P5-2 难度信号：卡片掌握度 + 复习曲线（classic 间隔档位 / fsrs 表现分·波动）→ 注入出题 prompt
      // 笔记内容难度：单条按正文长度 + 类型估计；簇模式按各笔记正文平均长度估计（簇内均为短 fact 则不强行出 debate）
      const noteDifficulty = clusterMode
        ? noteDifficultyBandFromLength(Math.round(cluster.reduce((sum, n) => sum + n.content.length, 0) / cluster.length))
        : estimateNoteDifficulty(note)
      const difficultyContext = describeDifficultyContext(task, settingsStore.reviewAlgorithm, noteDifficulty)
      if (clusterMode) {
        // P4 簇模式：按簇上下文出关系型问题（涉及笔记标注，供 P4-4 缺口回写）
        questions = await generateClusterQuestions(cluster, createProvider(config), learnerProfile, difficultyContext)
      } else {
        let graduationHint = ''
        if (shouldSuggestGraduation(note, profile, task.mastery)) {
          graduationHint =
            `该笔记关联的概念在你的画像中标记为 high（能独立解释），且复习掌握度已达 ` +
            `${Math.round(task.mastery * 100)}%。若你觉得已掌握，可只出 1-2 道 explain 挑战题，` +
            `或建议跳过本次复习。`
        }
        questions = await generateReviewQuestions(
          note,
          relatedNotes,
          createProvider(config),
          learnerProfile,
          graduationHint,
          difficultyContext,
        )
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '复习出题失败，已进入原文复习模式')
    }
  }

  const session = createReviewSession(note, questions, undefined, clusterMode ? cluster : undefined)
  await saveSessionToVault(vaultPath, session, false, [], true)
  toast.success(questions.length > 0 ? '已创建复习会话' : '已创建复习会话（原文模式）')
  router.push(`/review/${encodeURIComponent(session.id)}`)
}

function ratingLabel(rating: ReviewRating): string {
  const labels: Record<ReviewRating, string> = {
    again: '忘了',
    hard: '模糊',
    good: '记得',
    easy: '熟练',
  }
  return labels[rating]
}
</script>

<style scoped>
.learning-hub-page {
  box-sizing: border-box;
  min-height: 100%;
  padding: 34px 48px 64px;
  overflow-y: auto;
}

.learning-hub-layout {
  display: flex;
  gap: 40px;
  align-items: flex-start;
}

/* 学习地图切换管理栏 */
.hub-sidebar {
  width: 168px;
  flex-shrink: 0;
}

.hub-nav {
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.hub-nav__item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--ink-2, #52635d);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.hub-nav__item:hover {
  background: var(--surface-2, #f0eee7);
  color: var(--ink);
}

.hub-nav__item.active {
  background: var(--brand-soft, #dce9e1);
  color: var(--brand-strong, #174438);
  font-weight: 700;
}

.hub-nav__item.active::before {
  width: 3px;
  height: 14px;
  border-radius: 2px;
  background: var(--brand);
  content: '';
}

.hub-nav__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  margin-left: auto;
  padding: 0 5px;
  border-radius: var(--r-pill);
  background: var(--state-error);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
}

.hub-content {
  flex: 1;
  min-width: 0;
}

.learning-hub {
  min-height: 100%;
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

.learning-hub__section {
  margin-bottom: 24px;
}

/* 活动面板 */
.activity-panel__title {
  margin: 0;
  padding: 14px 18px;
  font-size: 14px;
  font-weight: 650;
  color: var(--ink);
  border-bottom: 1px solid var(--line);
}

@media (max-width: 1240px) {
  .learning-hub-page {
    padding: 34px 34px 64px;
  }
}

@media (max-width: 860px) {
  .learning-hub-page {
    padding: 24px 20px 56px;
  }

  .learning-hub-layout {
    flex-direction: column;
    gap: 20px;
  }

  .hub-sidebar {
    width: 100%;
  }

  .hub-nav {
    position: static;
    flex-direction: row;
    flex-wrap: wrap;
  }
}

/* 认知地图 */
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