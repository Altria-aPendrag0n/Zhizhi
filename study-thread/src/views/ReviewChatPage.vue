<template>
  <div class="review-chat-page">
    <!-- 顶部：被复习笔记 + 进度 + 结束复习 -->
    <header class="review-chat-page__header">
      <div class="review-chat-page__note">
        <span class="review-chat-page__eyebrow">复习会话</span>
        <button
          v-if="note"
          class="review-chat-page__note-title"
          type="button"
          @click="handleNavigateNote(note.path)"
        >
          {{ note.title }}
        </button>
        <span v-else class="review-chat-page__note-title">{{ session?.title || '复习会话' }}</span>
      </div>
      <div v-if="hasQuestions" class="review-chat-page__progress">
        {{ currentQuestionIndex }} / {{ questions.length }}
      </div>
      <button
        v-if="!showRating && !rated"
        class="review-chat-page__end"
        type="button"
        :disabled="isStreaming"
        @click="showRating = true"
      >
        结束复习
      </button>
    </header>

    <!-- 簇内笔记展示（P4-3）：对话首条消息前展示复习簇，当前被复习笔记高亮 -->
    <section v-if="hasCluster" class="review-chat-page__cluster">
      <button
        type="button"
        class="review-chat-page__cluster-toggle"
        :aria-expanded="clusterOpen"
        @click="clusterOpen = !clusterOpen"
      >
        <span class="review-chat-page__cluster-summary">复习簇 · {{ clusterNotes.length }} 条关联笔记</span>
        <span class="review-chat-page__cluster-caret">{{ clusterOpen ? '收起' : '展开' }}</span>
      </button>
      <ul v-if="clusterOpen" class="review-chat-page__cluster-list">
        <li
          v-for="(item, index) in clusterNotes"
          :key="item.path"
          class="review-chat-page__cluster-item"
          :class="{ 'review-chat-page__cluster-item--current': item.path === note?.path }"
        >
          <span class="review-chat-page__cluster-index">{{ index + 1 }}</span>
          <button
            type="button"
            class="review-chat-page__cluster-note"
            @click="handleNavigateNote(item.path)"
          >
            {{ item.title }}
          </button>
          <span v-if="item.path === note?.path" class="review-chat-page__cluster-badge">当前</span>
        </li>
      </ul>
    </section>

    <!-- 对话区（复用 ChatView：渲染/划线/已生成笔记） -->
    <div class="review-chat-page__body">
      <ChatView
        :messages="messages"
        :is-streaming="isStreaming"
        :streaming-text="streamingText"
        :streaming-thinking="streamingThinking"
        :error="error"
        :note-refs="noteRefs"
        @retry="handleRetry"
        @extract-note="handleExtractNote"
        @add-to-note="handleAddToNote"
        @navigate-note="handleNavigateNote"
      />
    </div>

    <!-- 原文复习模式（未配置 AI）提示 -->
    <p v-if="!hasQuestions && !showRating" class="review-chat-page__fallback">
      未配置 AI，当前为原文复习模式：先自行回顾，再点击「结束复习」自评。
    </p>

    <!-- 输入区 / 自评面板 -->
    <div v-if="showRating" class="review-chat-page__rating">
      <!-- 簇模式：逐条评级（每条笔记独立 applyReview） -->
      <template v-if="hasCluster">
        <p class="review-chat-page__rating-title">逐条评级簇内笔记，各自更新复习计划</p>
        <div v-for="item in clusterNotes" :key="item.path" class="review-chat-page__rating-item">
          <div class="review-chat-page__rating-item-head">
            <button
              type="button"
              class="review-chat-page__rating-item-title"
              @click="handleNavigateNote(item.path)"
            >
              {{ item.title }}
            </button>
            <span v-if="gapPaths.has(item.path)" class="review-chat-page__gap-badge">AI 缺口</span>
            <span
              class="review-chat-page__rating-item-state"
              :class="ratedPaths.has(item.path) ? 'is-done' : 'is-pending'"
            >
              {{ ratedPaths.has(item.path) ? '已评级' : '待评级' }}
            </span>
          </div>
          <div class="review-chat-page__rating-actions">
            <button
              v-for="item2 in RATINGS"
              :key="item2.value"
              class="review-chat-page__rate"
              :class="`review-chat-page__rate--${item2.value}`"
              type="button"
              :disabled="ratedPaths.has(item.path)"
              @click="handleRate(item.path, item2.value)"
            >
              {{ item2.label }}
            </button>
          </div>
        </div>
        <div class="review-chat-page__rating-footer">
          <button class="review-chat-page__finish" type="button" @click="finishReview">
            完成复习，返回学习地图
          </button>
        </div>
      </template>
      <!-- 单条模式：保持原四档自评 -->
      <template v-else>
        <p v-if="!rated" class="review-chat-page__rating-title">这次复习，你记得怎么样？</p>
        <p v-else class="review-chat-page__rating-done">已评级，正在返回学习地图…</p>
        <div v-if="!rated" class="review-chat-page__rating-actions">
          <button
            v-for="item in RATINGS"
            :key="item.value"
            class="review-chat-page__rate"
            :class="`review-chat-page__rate--${item.value}`"
            type="button"
            @click="handleRate(session?.reviewed_note ?? '', item.value)"
          >
            {{ item.label }}
          </button>
        </div>
      </template>
    </div>
    <Composer
      v-else
      :is-streaming="isStreaming"
      :disabled="isStreaming || !hasQuestions || showRating || rated"
      :placeholder="composerPlaceholder"
      @send="handleSend"
      @stop="handleStop"
    />

    <AddToNoteDialog
      :visible="addToNoteDialog.visible"
      :highlighted-text="addToNoteDialog.highlightedText"
      :notes="noteStore.notes"
      :saving="addToNoteDialog.saving"
      :error="addToNoteDialog.error"
      @close="closeAddToNote"
      @confirm="confirmAddToNote"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { Message, Note, ReviewRating, ReviewQuestion, Session } from '../types'
import { useSettingsStore } from '../stores/settings'
import { useVaultStore } from '../stores/vault'
import { useNoteStore } from '../stores/notes'
import { useReviewStore } from '../stores/review'
import { useToast } from '../composables/useToast'
import { createProvider } from '../api/provider-factory'
import { reviewFollowupStream } from '../api/skills/review-quiz'
import { extractNote } from '../api/skills/extract-note'
import { loadReviewSession, getReviewSessionFilePath } from '../utils/review-session'
import { parseMentionedNotes } from '../utils/review-gap'
import { saveSessionToVault } from '../utils/session-serializer'
import { insertHighlightAt, insertHighlightAtEnd, type AddToNoteTarget } from '../utils/note-insert'
import { resolveMessageIndex } from '../utils/message-locator'
import { extractNoteRefsFromSession, type NoteReference } from '../utils/session-linker'
import { readFile } from '../utils/vault-fs'
import ChatView from '../components/chat/ChatView.vue'
import Composer from '../components/chat/Composer.vue'
import AddToNoteDialog from '../components/notes/AddToNoteDialog.vue'

const route = useRoute()
const router = useRouter()
const settingsStore = useSettingsStore()
const vaultStore = useVaultStore()
const noteStore = useNoteStore()
const reviewStore = useReviewStore()
const toast = useToast()

const session = ref<Session | null>(null)
const note = ref<Note | null>(null)
/** 复习簇内笔记（P4-3，来自 frontmatter review_cluster，仅簇模式长度 > 1） */
const clusterNotes = ref<Note[]>([])
const clusterOpen = ref(true)
/** 已评级笔记路径（簇模式逐条评级） */
const ratedPaths = ref<Set<string>>(new Set())
/** AI 反馈标注的缺口笔记路径（P4-4：仅这些笔记被 AI 判定为回答涉及/应涉及的缺口） */
const gapPaths = ref<Set<string>>(new Set())
const messages = ref<Message[]>([])
const isStreaming = ref(false)
const streamingText = ref('')
const streamingThinking = ref('')
const error = ref<string | null>(null)
const currentQuestionIndex = ref(0)
const showRating = ref(false)
const rated = ref(false)
const extractedNotes = ref<NoteReference[]>([])
const addToNoteDialog = reactive({
  visible: false,
  highlightedText: '',
  saving: false,
  error: '',
})
let abortController: AbortController | null = null

const sessionId = computed(() => String(route.params.sessionId || ''))
const questions = computed<ReviewQuestion[]>(() => session.value?.review_questions ?? [])
const hasQuestions = computed(() => questions.value.length > 0)
/** 簇模式：簇内笔记超过 1 条时进入逐条评级 */
const hasCluster = computed(() => clusterNotes.value.length > 1)
const noteRefs = computed(() => extractedNotes.value)
const composerPlaceholder = computed(() =>
  questions.value[currentQuestionIndex.value]
    ? `回答第 ${currentQuestionIndex.value + 1} 题…`
    : '继续输入…',
)

const RATINGS: { value: ReviewRating; label: string; hint: string }[] = [
  { value: 'again', label: '忘了', hint: '完全没记住，回退间隔' },
  { value: 'hard', label: '模糊', hint: '有印象但不完整，保持间隔' },
  { value: 'good', label: '记得', hint: '能复述大意，推进间隔' },
  { value: 'easy', label: '熟练', hint: '能独立解释，大幅推进间隔' },
]

onMounted(load)

async function load() {
  if (!vaultStore.vaultPath) {
    toast.error('请先在设置中选择本地 Vault')
    router.replace('/hub')
    return
  }
  const loaded = await loadReviewSession(vaultStore.vaultPath, sessionId.value)
  if (!loaded) {
    toast.error('复习会话不存在或已被删除')
    router.replace('/hub')
    return
  }
  session.value = loaded
  messages.value = [...loaded.messages]
  currentQuestionIndex.value = 0
  if (loaded.reviewed_note) {
    note.value = await noteStore.loadNote(loaded.reviewed_note)
  }
  // P4-3 簇复习：加载 frontmatter review_cluster 中的簇内笔记（当前笔记高亮展示）
  if (loaded.review_cluster && loaded.review_cluster.length > 1) {
    if (noteStore.notes.length === 0 && vaultStore.vaultPath) {
      await noteStore.loadAllNotes(vaultStore.vaultPath)
    }
    const cluster: Note[] = []
    for (const path of loaded.review_cluster) {
      const clusterNote = await noteStore.loadNote(path)
      if (clusterNote) cluster.push(clusterNote)
    }
    clusterNotes.value = cluster
  }
  // 从会话文件解析已生成的笔记引用（划线摘录后）
  try {
    extractedNotes.value = await loadNoteRefs()
  } catch {
    extractedNotes.value = []
  }
}

async function loadNoteRefs(): Promise<NoteReference[]> {
  if (!vaultStore.vaultPath || !session.value) return []
  try {
    const content = await readFile(getReviewSessionFilePath(vaultStore.vaultPath, session.value.id))
    return extractNoteRefsFromSession(content)
  } catch {
    return []
  }
}

async function persist(): Promise<string | null> {
  if (!vaultStore.vaultPath || !session.value) return null
  session.value.messages = [...messages.value]
  return saveSessionToVault(vaultStore.vaultPath, session.value, false, extractedNotes.value, true)
}

async function handleSend(content: string) {
  if (!session.value || !note.value) return
  const config = settingsStore.getProviderConfig()
  if (!config.apiKey) {
    toast.error('请先在设置页面配置 API Key')
    router.push('/settings')
    return
  }
  const question = questions.value[currentQuestionIndex.value]
  if (!question) {
    toast.info('已无更多问题，点击「结束复习」自评')
    return
  }

  messages.value.push({ role: 'user', content })
  const aiMessage: Message = { role: 'assistant', content: '' }
  messages.value.push(aiMessage)
  isStreaming.value = true
  streamingText.value = ''
  streamingThinking.value = ''
  error.value = null

  const controller = new AbortController()
  abortController = controller
  try {
    const provider = createProvider(config)
    for await (const chunk of reviewFollowupStream(
      question,
      content,
      note.value,
      provider,
      hasCluster.value ? clusterNotes.value : undefined,
    )) {
      if (chunk.type === 'text') {
        streamingText.value += chunk.content
      } else if (chunk.type === 'thinking') {
        streamingThinking.value += chunk.content
      } else if (chunk.type === 'error') {
        error.value = chunk.content
        messages.value.pop()
        isStreaming.value = false
        streamingText.value = ''
        streamingThinking.value = ''
        return
      }
    }
    aiMessage.content = streamingText.value
    aiMessage.thinking = streamingThinking.value || undefined
    // P4-4 缺口定位：从 AI 反馈解析被标注的簇内缺口笔记（回答涉及/应涉及的笔记）
    if (hasCluster.value) {
      gapPaths.value = new Set(parseMentionedNotes(aiMessage.content, clusterNotes.value))
    }
    currentQuestionIndex.value++
    await persist()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('abort') || msg.includes('AbortError')) {
      aiMessage.content = streamingText.value
      aiMessage.thinking = streamingThinking.value || undefined
    } else {
      error.value = `请求失败: ${msg}`
      messages.value.pop()
    }
  } finally {
    isStreaming.value = false
    streamingText.value = ''
    streamingThinking.value = ''
    abortController = null
  }
}

function handleStop() {
  abortController?.abort()
  abortController = null
}

function handleRetry() {
  error.value = null
  const lastUserMsg = [...messages.value].reverse().find((m) => m.role === 'user')
  if (lastUserMsg) {
    if (messages.value[messages.value.length - 1]?.role === 'assistant') {
      messages.value.pop()
    }
    void handleSend(lastUserMsg.content)
  }
}

async function handleRate(notePath: string, rating: ReviewRating) {
  if (!notePath) {
    toast.error('未找到被复习笔记')
    return
  }
  if (ratedPaths.value.has(notePath)) return
  await reviewStore.applyReview(notePath, rating)
  ratedPaths.value.add(notePath)
  toast.success(`已评级「${ratingLabel(rating)}」，已更新复习计划`)
  // 单条模式：评级即完成，自动返回；簇模式：等待逐条评级后手动返回
  if (!hasCluster.value) {
    rated.value = true
    setTimeout(() => router.push('/hub'), 800)
  }
}

/** 簇模式：结束逐条评级并返回学习地图 */
function finishReview() {
  rated.value = true
  void router.push('/hub')
}

function ratingLabel(rating: ReviewRating): string {
  return RATINGS.find((item) => item.value === rating)?.label ?? rating
}

/** 划线 → 生成新笔记（自动加入复习队列） */
async function handleExtractNote(highlightedText: string, domMessageIndex: number | null = null) {
  const config = settingsStore.getProviderConfig()
  const needLLM = settingsStore.autoGenerateNoteTitle || settingsStore.autoGenerateNoteTags
  if (needLLM && !config.apiKey) {
    toast.error('请先在设置页面配置 API Key')
    router.push('/settings')
    return
  }
  if (!vaultStore.vaultPath || !session.value) {
    toast.error('请先选择本地 Vault')
    return
  }
  try {
    const sourceSession = await persist()
    const noteMeta = await extractNote(
      highlightedText,
      messages.value.map((message) => `${message.role}: ${message.content}`).join('\n\n'),
      createProvider(config),
      undefined,
      {
        generateTitle: settingsStore.autoGenerateNoteTitle,
        generateTags: settingsStore.autoGenerateNoteTags,
      },
    )
    const path = await noteStore.saveNote(vaultStore.vaultPath, noteMeta, sourceSession || '', highlightedText)
    if (!path) throw new Error('笔记保存失败')
    const messageIndex = resolveMessageIndex(highlightedText, messages.value, domMessageIndex, 'assistant')
    extractedNotes.value.push({ path, title: noteMeta.title, messageIndex, kind: 'note', highlight: highlightedText })
    await persist()
    toast.success('已提炼并保存为原子笔记（已进入复习队列）')
  } catch (e) {
    toast.error(e instanceof Error ? e.message : '笔记提炼失败')
  }
}

/** 划线 → 加入原笔记 */
async function handleAddToNote(highlightedText: string) {
  if (noteStore.notes.length === 0 && vaultStore.vaultPath) {
    await noteStore.loadAllNotes(vaultStore.vaultPath)
  }
  if (noteStore.notes.length === 0) {
    toast.error('还没有笔记，请先在会话中摘录一条笔记')
    return
  }
  addToNoteDialog.highlightedText = highlightedText
  addToNoteDialog.error = ''
  addToNoteDialog.visible = true
}

function closeAddToNote() {
  if (addToNoteDialog.saving) return
  addToNoteDialog.visible = false
}

async function confirmAddToNote(target: AddToNoteTarget) {
  addToNoteDialog.saving = true
  addToNoteDialog.error = ''
  try {
    const noteTarget = await noteStore.loadNote(target.notePath)
    if (!noteTarget) throw new Error('笔记不存在或无法读取')
    const newBody = target.headingLine === null
      ? insertHighlightAtEnd(target.body, addToNoteDialog.highlightedText)
      : insertHighlightAt(target.body, target.headingLine, addToNoteDialog.highlightedText)
    const saved = await noteStore.updateNote({ ...noteTarget, content: newBody })
    if (!saved) throw new Error('写入笔记失败')
    addToNoteDialog.visible = false
    toast.success('已加入笔记')
  } catch (e) {
    addToNoteDialog.error = e instanceof Error ? e.message : '加入笔记失败'
  } finally {
    addToNoteDialog.saving = false
  }
}

function handleNavigateNote(path: string) {
  router.push(`/notes/${encodeURIComponent(path)}`)
}
</script>

<style scoped>
.review-chat-page {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.review-chat-page__header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--line);
  background: var(--surface);
  flex-shrink: 0;
}

.review-chat-page__note {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
  flex: 1;
}

.review-chat-page__eyebrow {
  flex-shrink: 0;
  color: var(--brand);
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.13em;
  text-transform: uppercase;
}

.review-chat-page__note-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border: 0;
  background: transparent;
  padding: 0;
  font: inherit;
  font-size: 14px;
  font-weight: 650;
  color: var(--ink);
  cursor: pointer;
  text-align: left;
}

.review-chat-page__note-title:hover {
  color: var(--brand);
  text-decoration: underline;
}

/* ---- 簇展示（P4-3）---- */
.review-chat-page__cluster {
  flex-shrink: 0;
  margin: 10px 20px 0;
  border: 1px dashed var(--line-strong);
  border-radius: var(--r-lg);
  background: var(--surface);
  overflow: hidden;
}

.review-chat-page__cluster-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 9px 14px;
  border: 0;
  background: transparent;
  font: inherit;
  cursor: pointer;
}

.review-chat-page__cluster-toggle:hover {
  background: var(--surface-2);
}

.review-chat-page__cluster-summary {
  font-size: 12px;
  font-weight: 650;
  color: var(--ink);
}

.review-chat-page__cluster-caret {
  font-size: 11px;
  color: var(--ink-3);
}

.review-chat-page__cluster-list {
  margin: 0;
  padding: 0 14px 10px;
  list-style: none;
}

.review-chat-page__cluster-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 0;
  border-top: 1px solid var(--line);
}

.review-chat-page__cluster-index {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: var(--brand-soft);
  color: var(--brand);
  font-size: 10px;
  font-weight: 700;
}

.review-chat-page__cluster-note {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border: 0;
  background: transparent;
  padding: 0;
  font: inherit;
  font-size: 12px;
  color: var(--ink-2);
  cursor: pointer;
  text-align: left;
}

.review-chat-page__cluster-note:hover {
  color: var(--brand);
  text-decoration: underline;
}

.review-chat-page__cluster-badge {
  flex-shrink: 0;
  margin-left: auto;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--brand);
  color: var(--brand-ink);
  font-size: 10px;
  font-weight: 700;
}

.review-chat-page__cluster-item--current {
  background: var(--brand-soft);
  border-radius: var(--r-md);
  padding-left: 6px;
  padding-right: 6px;
}

.review-chat-page__cluster-item--current .review-chat-page__cluster-note {
  color: var(--brand);
  font-weight: 650;
}

.review-chat-page__cluster-item--current .review-chat-page__cluster-index {
  background: var(--brand);
  color: var(--brand-ink);
}

.review-chat-page__progress {
  flex-shrink: 0;
  color: var(--ink-3);
  font-size: 12px;
}

.review-chat-page__end {
  flex-shrink: 0;
  padding: 7px 14px;
  border: 1px solid var(--brand);
  border-radius: var(--r-md);
  background: var(--brand);
  color: var(--brand-ink);
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
}

.review-chat-page__end:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.review-chat-page__end:hover:not(:disabled) {
  background: var(--brand-strong);
}

.review-chat-page__body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.review-chat-page__fallback {
  margin: 0;
  padding: 8px 20px;
  color: var(--state-warning);
  font-size: 12px;
  flex-shrink: 0;
  background: var(--surface);
}

.review-chat-page__rating {
  flex-shrink: 0;
  padding: 14px 20px;
  border-top: 1px solid var(--line);
  background: var(--surface);
}

.review-chat-page__rating-title {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 650;
  color: var(--ink);
}

.review-chat-page__rating-done {
  margin: 0;
  font-size: 13px;
  color: var(--ink-2);
}

.review-chat-page__rating-actions {
  display: flex;
  gap: 8px;
}

.review-chat-page__rate {
  flex: 1;
  padding: 9px 10px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
  color: var(--ink-2);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.review-chat-page__rate:hover {
  border-color: var(--brand);
  color: var(--brand);
  background: var(--brand-soft);
}

.review-chat-page__rate--again:hover {
  border-color: var(--state-error);
  color: var(--state-error);
  background: #f7e9e7;
}

.review-chat-page__rate--easy:hover {
  border-color: var(--state-success);
  color: var(--state-success);
  background: #e7f3ec;
}

.review-chat-page__rate:disabled {
  opacity: 0.55;
  cursor: default;
  border-color: var(--line);
  color: var(--ink-3);
  background: var(--surface);
}

/* ---- 簇模式逐条评级（P4-3）---- */
.review-chat-page__rating-item {
  margin-bottom: 12px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  background: var(--surface);
}

.review-chat-page__rating-item-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.review-chat-page__rating-item-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border: 0;
  background: transparent;
  padding: 0;
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  color: var(--ink);
  cursor: pointer;
  text-align: left;
}

.review-chat-page__rating-item-title:hover {
  color: var(--brand);
  text-decoration: underline;
}

.review-chat-page__rating-item-state {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 650;
}

.review-chat-page__rating-item-state.is-done {
  color: var(--state-success);
}

.review-chat-page__rating-item-state.is-pending {
  color: var(--ink-3);
}

.review-chat-page__gap-badge {
  flex-shrink: 0;
  margin-left: auto;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--state-warning);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
}

.review-chat-page__rating-footer {
  margin-top: 14px;
  text-align: center;
}

.review-chat-page__finish {
  padding: 9px 22px;
  border: 1px solid var(--brand);
  border-radius: var(--r-md);
  background: var(--brand);
  color: var(--brand-ink);
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
}

.review-chat-page__finish:hover {
  background: var(--brand-strong);
}
</style>
