<template>
  <div class="plan-board">
    <!-- ============ 列表模式 ============ -->
    <template v-if="mode === 'list'">
      <section class="plan-board__intro">
        <div class="eyebrow">Learning Plan</div>
        <h2 class="plan-board__hero-title">学习计划 · 让每天知道学什么</h2>
        <p class="plan-board__hero-desc">
          规划师根据你的目标、基础与每日时长生成阶段计划；任务按顺序推进、落后自动顺延，不设截止日。
        </p>
        <button class="plan-board__cta" type="button" @click="startWizard">制定新计划</button>
      </section>

      <!-- 空状态：尚无任何计划 -->
      <div v-if="planStore.plans.length === 0" class="plan-board__empty">
        <p class="plan-board__empty-title">还没有学习计划</p>
        <p class="plan-board__empty-desc">
          告诉规划师你想学什么、每天能投入多久，它会为你生成一条可执行的学习路径。
        </p>
      </div>

      <template v-else>
        <!-- 今日任务（多计划并行、按计划分组纯展示） -->
        <section class="plan-board__section">
          <h3 class="plan-board__section-title">今日任务（{{ planStore.todayCount }}）</h3>
          <div
            v-for="group in planStore.todayGroups"
            :key="group.plan.plan"
            class="plan-board__today-group"
          >
            <h4 class="plan-board__today-plan">{{ group.plan.title }}</h4>
            <div v-for="task in group.tasks" :key="task.id" class="plan-board__task">
              <label class="plan-board__task-main">
                <input
                  type="checkbox"
                  class="plan-board__task-check"
                  :checked="task.done"
                  @change="toggleTask(group.plan, task)"
                />
                <span class="plan-board__task-body">
                  <span class="plan-board__task-title">{{ task.title }}</span>
                  <span v-if="phaseTitle(group.plan, task.phase)" class="plan-board__task-phase">
                    {{ phaseTitle(group.plan, task.phase) }}
                  </span>
                  <span v-if="task.detail" class="plan-board__task-detail">{{ task.detail }}</span>
                </span>
              </label>
              <span class="plan-board__task-estimate">约 {{ task.estimate }} 分钟</span>
              <button class="plan-board__task-start" type="button" @click="startLearning(group.plan, task)">
                开始学习
              </button>
            </div>
          </div>
          <p v-if="planStore.todayGroups.length === 0" class="plan-board__all-done">
            今日任务已完成。完成后容量自动补位，也可以继续勾选下一个任务。
          </p>
        </section>

        <!-- 全部计划 -->
        <section class="plan-board__section">
          <h3 class="plan-board__section-title">全部计划（{{ planStore.plans.length }}）</h3>
          <div v-for="plan in planStore.plans" :key="plan.plan" class="plan-board__plan-card">
            <div class="plan-board__plan-head" @click="toggleExpand(plan.plan)">
              <div class="plan-board__plan-heading">
                <span class="plan-board__plan-title">{{ plan.title }}</span>
                <span class="plan-board__plan-status" :data-status="plan.status">{{ statusLabel(plan.status) }}</span>
              </div>
              <p v-if="plan.goal" class="plan-board__plan-goal">{{ plan.goal }}</p>
              <div class="plan-board__plan-progress">
                <div class="plan-board__progress-track">
                  <div class="plan-board__progress-fill" :style="{ width: planProgress(plan).pct + '%' }" />
                </div>
                <span class="plan-board__progress-text">
                  {{ planProgress(plan).done }}/{{ planProgress(plan).total }} · {{ planEta(plan) }}
                </span>
              </div>
            </div>

            <div v-if="expandedPlanId === plan.plan" class="plan-board__plan-detail">
              <div v-for="phase in plan.phases" :key="phase.id" class="plan-board__phase">
                <div class="plan-board__phase-head">
                  <span class="plan-board__phase-title">{{ phase.title }}</span>
                  <span class="plan-board__phase-eta">{{ phaseEta(plan, phase.id) }}</span>
                </div>
                <p v-if="phase.objective" class="plan-board__phase-objective">{{ phase.objective }}</p>
                <div class="plan-board__progress-track plan-board__progress-track--phase">
                  <div class="plan-board__progress-fill" :style="{ width: phaseProgress(plan, phase.id).pct + '%' }" />
                </div>
              </div>
              <div class="plan-board__plan-actions">
                <button
                  v-if="plan.status !== 'archived'"
                  class="plan-board__action"
                  type="button"
                  @click.stop="changeStatus(plan, plan.status === 'active' ? 'paused' : 'active')"
                >
                  {{ plan.status === 'active' ? '暂停' : '恢复' }}
                </button>
                <button
                  v-if="plan.status !== 'archived'"
                  class="plan-board__action"
                  type="button"
                  @click.stop="changeStatus(plan, 'archived')"
                >
                  归档
                </button>
                <button
                  v-if="plan.status === 'archived'"
                  class="plan-board__action"
                  type="button"
                  @click.stop="changeStatus(plan, 'active')"
                >
                  恢复到进行中
                </button>
              </div>
            </div>
          </div>
        </section>
      </template>
    </template>

    <!-- ============ 生成向导（正式会话，kind=plan） ============ -->
    <template v-else>
      <section class="plan-board__intro">
        <div class="eyebrow">Plan Architect</div>
        <h2 class="plan-board__hero-title">制定学习计划</h2>
        <p class="plan-board__hero-desc">
          说明你想学什么、已有基础、每天能投入多久与期望周期，规划师会给出可确认的计划草案。
        </p>
        <button class="plan-board__back" type="button" @click="exitWizard">返回计划列表</button>
      </section>

      <!-- 对话消息区：首条消息发出后才渲染，避免空态时显示一个无法输入的空框 -->
      <div v-if="wizardMessages.length > 0" class="plan-board__chat">
        <div
          v-for="(msg, index) in wizardMessages"
          :key="index"
          class="plan-board__msg"
          :class="`plan-board__msg--${msg.role}`"
        >
          <span class="plan-board__msg-role">{{ msg.role === 'user' ? '我' : '规划师' }}</span>
          <p class="plan-board__msg-content">{{ msg.content }}</p>
        </div>

        <!-- 草稿预览与确认 -->
        <div v-if="previewDraft" class="plan-board__preview">
          <p class="plan-board__preview-hint">规划师给出了计划草案，确认后将保存到 Vault：</p>
          <PlanPreview :draft="previewDraft" />
          <div class="plan-board__preview-actions">
            <button class="plan-board__cta" type="button" @click="confirmPlan">就这样，生成计划</button>
            <button class="plan-board__action" type="button" @click="continueAdjusting">继续调整</button>
          </div>
        </div>

        <p v-if="draftError" class="plan-board__draft-error">{{ draftError }}</p>
      </div>

      <form class="plan-board__composer" @submit.prevent="send">
        <textarea
          v-model="input"
          class="plan-board__input"
          rows="2"
          placeholder="例如：想用 30 天入门 Rust，目前零基础，每天能学 1 小时"
          :disabled="wizardBusy || previewDraft !== null"
        />
        <button class="plan-board__send" type="submit" :disabled="!input.trim() || wizardBusy || previewDraft !== null">
          发送
        </button>
      </form>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import type { Message, PlanDoc, PlanStatus, PlanTask } from '../../types'
import { usePlanStore } from '../../stores/plan'
import { useVaultStore } from '../../stores/vault'
import { useSessionStore } from '../../stores/session'
import { useSettingsStore } from '../../stores/settings'
import { useNoteStore } from '../../stores/notes'
import { useReferenceStore } from '../../stores/references'
import { useToast } from '../../composables/useToast'
import { createProvider } from '../../api/provider-factory'
import { buildPlanArchitectPrompt, extractPlanDraft } from '../../api/skills/plan-architect'
import { estimatePhaseCompletion } from '../../utils/plan-parser'
import PlanPreview from './PlanPreview.vue'
import type { Session } from '../../types'

const router = useRouter()
const planStore = usePlanStore()
const vaultStore = useVaultStore()
const sessionStore = useSessionStore()
const settingsStore = useSettingsStore()
const noteStore = useNoteStore()
const referencesStore = useReferenceStore()
const toast = useToast()

const mode = ref<'list' | 'wizard'>('list')

// ===================== 列表模式 =====================

const expandedPlanId = ref<string | null>(null)

function toggleExpand(planId: string) {
  expandedPlanId.value = expandedPlanId.value === planId ? null : planId
}

function statusLabel(status: PlanStatus): string {
  if (status === 'active') return '进行中'
  if (status === 'paused') return '已暂停'
  return '已归档'
}

function phaseTitle(plan: PlanDoc, phaseId: string): string {
  return plan.phases.find((phase) => phase.id === phaseId)?.title ?? ''
}

function planProgress(plan: PlanDoc): { total: number; done: number; pct: number } {
  const total = plan.tasks.length
  const done = plan.tasks.filter((task) => task.done).length
  return { total, done, pct: total > 0 ? Math.round((done / total) * 100) : 0 }
}

/** 整体预计完成日：剩余时长 ÷ 每日容量，自今日顺推 */
function planEta(plan: PlanDoc): string {
  const remaining = plan.tasks.filter((task) => !task.done).reduce((sum, task) => sum + task.estimate, 0)
  if (remaining <= 0) return '已完成'
  if (plan.daily_minutes <= 0) return ''
  const days = Math.ceil(remaining / plan.daily_minutes)
  return `预计 ${formatDate(addDays(days))} 完成（约 ${days} 天）`
}

function phaseProgress(plan: PlanDoc, phaseId: string): { pct: number } {
  const tasks = plan.tasks.filter((task) => task.phase === phaseId)
  const total = tasks.length
  const done = tasks.filter((task) => task.done).length
  return { pct: total > 0 ? Math.round((done / total) * 100) : 0 }
}

function phaseEta(plan: PlanDoc, phaseId: string): string {
  const date = estimatePhaseCompletion(plan, phaseId)
  return date ? `预计 ${formatDate(date)} 完成` : '已完成'
}

function addDays(days: number): Date {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date
}

function formatDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${month}-${day}`
}

async function toggleTask(plan: PlanDoc, task: PlanTask) {
  const ok = await planStore.completeTask(plan.plan, task.id, !task.done)
  if (!ok) toast.error('勾选失败，请重试')
}

async function changeStatus(plan: PlanDoc, status: PlanStatus) {
  const ok = await planStore.setPlanStatus(plan.plan, status)
  if (!ok) toast.error('状态更新失败，请重试')
}

/** 「开始学习」：落盘带任务上下文的学习会话，回填任务关联后跳转会话页 */
async function startLearning(plan: PlanDoc, task: PlanTask) {
  const vaultPath = vaultStore.vaultPath
  if (!vaultPath) {
    toast.info('请先选择 Vault')
    return
  }
  const phase = plan.phases.find((item) => item.id === task.phase)
  const lines = [
    `我正在执行学习计划「${plan.title}」${phase ? `（阶段：${phase.title}）` : ''}。`,
    `今日任务：${task.title}。`,
    task.detail ? `任务要求：${task.detail}` : '',
    '请作为学习伴读，带我完成这个任务。',
  ].filter(Boolean)
  const content = lines.join('\n')

  const session: Session = {
    id: `sess_${Date.now()}_plan`,
    title: `学习：${task.title}`.slice(0, 40),
    created: new Date().toISOString(),
    parent_session: null,
    fork_point: null,
    tags: [],
    messages: [{ role: 'user', content, timestamp: new Date().toISOString() }],
  }
  const filePath = await vaultStore.saveCurrentSession(session, false, [])
  if (!filePath) {
    toast.error('会话创建失败，请重试')
    return
  }
  await planStore.associateSession(plan.plan, task.id, filePath)
  if (vaultPath) void sessionStore.loadSessionsFromVault(vaultPath)
  await router.push({ path: '/chat', query: { thread: session.id } })
}

// ===================== 生成向导 =====================

const wizardMessages = ref<Message[]>([])
const wizardSessionId = ref<string | null>(null)
const wizardSessionCreated = ref('')
const wizardPlanId = ref<string | undefined>(undefined)
const wizardTitle = ref('学习计划向导')
const wizardBusy = ref(false)
const previewDraft = ref<PlanDoc | null>(null)
const draftError = ref('')
const input = ref('')

function startWizard() {
  if (!vaultStore.vaultPath) {
    toast.info('请先选择 Vault 再制定计划')
    return
  }
  mode.value = 'wizard'
}

function resetWizardState() {
  wizardMessages.value = []
  wizardSessionId.value = null
  wizardSessionCreated.value = ''
  wizardPlanId.value = undefined
  wizardTitle.value = '学习计划向导'
  previewDraft.value = null
  draftError.value = ''
  input.value = ''
}

function exitWizard() {
  mode.value = 'list'
  resetWizardState()
}

function continueAdjusting() {
  previewDraft.value = null
}

/** Vault 笔记主题概况（注入规划师上下文，让计划衔接已有知识） */
function buildVaultOverview(): string {
  const notes = noteStore.notes
  if (notes.length === 0) return '（Vault 暂无笔记，按零基础设计）'
  const tagCounts = new Map<string, number>()
  for (const note of notes) {
    for (const tag of note.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
  }
  const top = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
  const tagText = top.map(([tag, count]) => `${tag}(${count})`).join('、')
  return `共 ${notes.length} 条笔记，主要主题：${tagText || '暂无明显标签'}`
}

function buildReferencesSummary(): string {
  const refs = referencesStore.references
  if (refs.length === 0) return '（无参考资料）'
  const titles = refs.map((item) => item.title).slice(0, 15).join('、')
  return refs.length > 15 ? `${titles} 等 ${refs.length} 份资料` : titles
}

function buildToday(): string {
  return new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
  })
}

/** 将向导会话落盘为正式会话文件（kind=plan，确认计划后回填 plan_id） */
async function persistWizardSession() {
  if (!wizardSessionId.value || !vaultStore.vaultPath) return
  const session: Session = {
    id: wizardSessionId.value,
    title: wizardTitle.value,
    created: wizardSessionCreated.value,
    parent_session: null,
    fork_point: null,
    tags: [],
    messages: [...wizardMessages.value],
    kind: 'plan',
    ...(wizardPlanId.value ? { plan_id: wizardPlanId.value } : {}),
  }
  await vaultStore.saveCurrentSession(session, false, [])
}

async function send() {
  const content = input.value.trim()
  if (!content || wizardBusy.value || previewDraft.value) return
  input.value = ''

  if (!wizardSessionId.value) {
    wizardSessionId.value = `plan_${Date.now()}`
    wizardSessionCreated.value = new Date().toISOString()
    wizardTitle.value = content.length > 20 ? `计划向导：${content.slice(0, 20)}…` : `计划向导：${content}`
  }
  wizardMessages.value.push({ role: 'user', content, timestamp: new Date().toISOString() })
  await persistWizardSession()

  wizardBusy.value = true
  draftError.value = ''
  try {
    const config = settingsStore.getProviderConfig()
    if (!config.apiKey) {
      toast.error('请先在设置中配置 API Key 或登录官方服务')
      return
    }
    const provider = createProvider(config)
    const systemPrompt = buildPlanArchitectPrompt({
      today: buildToday(),
      vaultOverview: buildVaultOverview(),
      references: buildReferencesSummary(),
    })
    let reply = ''
    for await (const chunk of provider.chat(
      wizardMessages.value.map((message) => ({ role: message.role, content: message.content })),
      { systemPrompt, temperature: 0.5, maxTokens: 4096, busyMessage: '规划师正在思考…' },
    )) {
      if (chunk.type === 'text') reply += chunk.content
      else if (chunk.type === 'error') throw new Error(chunk.content)
    }
    wizardMessages.value.push({ role: 'assistant', content: reply, timestamp: new Date().toISOString() })
    await persistWizardSession()

    const result = extractPlanDraft(reply)
    if (result.status === 'invalid') draftError.value = result.error
    else if (result.status === 'ok') previewDraft.value = result.draft
  } catch (error) {
    toast.error(`规划师生成失败：${error instanceof Error ? error.message : String(error)}`)
  } finally {
    wizardBusy.value = false
  }
}

async function confirmPlan() {
  const draft = previewDraft.value
  const vaultPath = vaultStore.vaultPath
  if (!draft || !vaultPath) return
  try {
    await planStore.createPlan(vaultPath, draft)
  } catch (error) {
    console.error('计划落盘失败:', error)
    toast.error('计划落盘失败，请重试')
    return
  }
  // 回填计划关联并更新会话标题，再次落盘（仓库即真相）
  wizardPlanId.value = draft.plan
  wizardTitle.value = `计划：${draft.title}`
  await persistWizardSession()
  void sessionStore.loadSessionsFromVault(vaultPath)
  toast.success('学习计划已生成')
  exitWizard()
}
</script>

<style scoped>
.plan-board {
  display: flex;
  flex-direction: column;
  gap: var(--s-5);
}

.plan-board__intro {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
}

.plan-board__hero-title {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  color: var(--ink);
}

.plan-board__hero-desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--ink-2);
}

.plan-board__cta {
  align-self: flex-start;
  margin-top: var(--s-2);
  padding: var(--s-2) var(--s-4);
  border: none;
  border-radius: var(--r-pill);
  background: var(--brand);
  color: var(--brand-ink);
  font-size: 13px;
  cursor: pointer;
}

.plan-board__cta:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.plan-board__back {
  align-self: flex-start;
  margin-top: var(--s-2);
  padding: var(--s-1) var(--s-3);
  border: 1px solid var(--line);
  border-radius: var(--r-pill);
  background: var(--surface);
  color: var(--ink-2);
  font-size: 12px;
  cursor: pointer;
}

.plan-board__empty {
  padding: var(--s-6);
  border: 1px dashed var(--line);
  border-radius: var(--r-lg);
  background: var(--surface);
  text-align: center;
}

.plan-board__empty-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
}

.plan-board__empty-desc {
  margin: var(--s-2) 0 0;
  font-size: 13px;
  color: var(--ink-2);
}

.plan-board__section {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
}

.plan-board__section-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--ink);
}

.plan-board__today-group {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  padding: var(--s-3);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  background: var(--surface);
}

.plan-board__today-plan {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--brand-strong);
}

.plan-board__task {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  padding: var(--s-2) var(--s-3);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface-2);
}

.plan-board__task-main {
  display: flex;
  flex: 1;
  align-items: flex-start;
  gap: var(--s-2);
  cursor: pointer;
}

.plan-board__task-check {
  margin-top: 3px;
  accent-color: var(--brand);
}

.plan-board__task-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.plan-board__task-title {
  font-size: 13px;
  color: var(--ink);
}

.plan-board__task-phase {
  font-size: 12px;
  color: var(--state-info);
}

.plan-board__task-detail {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--ink-2);
}

.plan-board__task-estimate {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--ink-3);
}

.plan-board__task-start {
  flex-shrink: 0;
  padding: var(--s-1) var(--s-3);
  border: 1px solid var(--brand);
  border-radius: var(--r-pill);
  background: transparent;
  color: var(--brand);
  font-size: 12px;
  cursor: pointer;
}

.plan-board__task-start:hover {
  background: var(--brand-soft);
}

.plan-board__all-done {
  margin: 0;
  font-size: 13px;
  color: var(--state-success);
}

.plan-board__plan-card {
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  background: var(--surface);
  overflow: hidden;
}

.plan-board__plan-head {
  padding: var(--s-3) var(--s-4);
  cursor: pointer;
}

.plan-board__plan-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
}

.plan-board__plan-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
}

.plan-board__plan-status {
  padding: 2px 10px;
  border-radius: var(--r-pill);
  font-size: 12px;
  background: var(--brand-soft);
  color: var(--brand-strong);
}

.plan-board__plan-status[data-status='paused'] {
  background: #f2e8d5;
  color: var(--state-warning);
}

.plan-board__plan-status[data-status='archived'] {
  background: var(--surface-2);
  color: var(--ink-3);
}

.plan-board__plan-goal {
  margin: var(--s-1) 0 0;
  font-size: 12px;
  color: var(--ink-2);
}

.plan-board__plan-progress {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  margin-top: var(--s-2);
}

.plan-board__progress-track {
  flex: 1;
  height: 6px;
  border-radius: var(--r-pill);
  background: var(--surface-2);
  overflow: hidden;
}

.plan-board__progress-track--phase {
  margin-top: var(--s-2);
}

.plan-board__progress-fill {
  height: 100%;
  border-radius: var(--r-pill);
  background: var(--brand);
  transition: width 0.2s ease;
}

.plan-board__progress-text {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--ink-3);
}

.plan-board__plan-detail {
  padding: 0 var(--s-4) var(--s-4);
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
  border-top: 1px solid var(--line);
  padding-top: var(--s-3);
}

.plan-board__phase-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--s-3);
}

.plan-board__phase-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
}

.plan-board__phase-eta {
  font-size: 12px;
  color: var(--ink-3);
}

.plan-board__phase-objective {
  margin: var(--s-1) 0 0;
  font-size: 12px;
  color: var(--ink-2);
}

.plan-board__plan-actions {
  display: flex;
  gap: var(--s-2);
}

.plan-board__action {
  padding: var(--s-1) var(--s-3);
  border: 1px solid var(--line);
  border-radius: var(--r-pill);
  background: var(--surface);
  color: var(--ink-2);
  font-size: 12px;
  cursor: pointer;
}

.plan-board__action:hover {
  border-color: var(--brand);
  color: var(--brand);
}

/* ============ 向导 ============ */

.plan-board__chat {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
  padding: var(--s-4);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  background: var(--surface);
  max-height: 50vh;
  overflow-y: auto;
}

.plan-board__msg {
  display: flex;
  flex-direction: column;
  gap: var(--s-1);
}

.plan-board__msg-role {
  font-size: 11px;
  color: var(--ink-3);
}

.plan-board__msg-content {
  margin: 0;
  padding: var(--s-2) var(--s-3);
  border-radius: var(--r-md);
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

.plan-board__msg--user .plan-board__msg-content {
  align-self: flex-end;
  background: var(--brand-soft);
  color: var(--ink);
}

.plan-board__msg--assistant .plan-board__msg-content {
  background: var(--surface-2);
  color: var(--ink);
}

.plan-board__preview {
  padding: var(--s-3);
  border: 1px solid var(--brand);
  border-radius: var(--r-md);
  background: var(--surface);
}

.plan-board__preview-hint {
  margin: 0 0 var(--s-2);
  font-size: 12px;
  color: var(--brand-strong);
}

.plan-board__preview-actions {
  display: flex;
  gap: var(--s-2);
  margin-top: var(--s-3);
}

.plan-board__draft-error {
  margin: 0;
  padding: var(--s-2) var(--s-3);
  border-radius: var(--r-md);
  background: #f7e8e6;
  color: var(--state-error);
  font-size: 12px;
}

.plan-board__composer {
  display: flex;
  gap: var(--s-2);
  align-items: flex-end;
}

.plan-board__input {
  flex: 1;
  padding: var(--s-2) var(--s-3);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
  color: var(--ink);
  font-size: 13px;
  font-family: inherit;
  resize: vertical;
}

.plan-board__input:focus {
  outline: none;
  border-color: var(--brand);
}

.plan-board__send {
  padding: var(--s-2) var(--s-4);
  border: none;
  border-radius: var(--r-md);
  background: var(--brand);
  color: var(--brand-ink);
  font-size: 13px;
  cursor: pointer;
}

.plan-board__send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
