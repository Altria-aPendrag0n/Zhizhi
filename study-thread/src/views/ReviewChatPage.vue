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
      <p v-if="!rated" class="review-chat-page__rating-title">这次复习，你记得怎么样？</p>
      <p v-else class="review-chat-page__rating-done">已评级，正在返回学习地图…</p>
      <div v-if="!rated" class="review-chat-page__rating-actions">
        <button
          v-for="item in RATINGS"
          :key="item.value"
          class="review-chat-page__rate"
          :class="`review-chat-page__rate--${item.value}`"
          type="button"
          @click="handleRate(item.value)"
        >
          {{ item.label }}
        </button>
      </div>
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
    for await (const chunk of reviewFollowupStream(question.question, content, note.value, provider)) {
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

async function handleRate(rating: ReviewRating) {
  const notePath = session.value?.reviewed_note
  if (!notePath) {
    toast.error('未找到被复习笔记')
    return
  }
  await reviewStore.applyReview(notePath, rating)
  rated.value = true
  toast.success(`已评级「${ratingLabel(rating)}」，已更新复习计划`)
  setTimeout(() => router.push('/hub'), 800)
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
</style>
