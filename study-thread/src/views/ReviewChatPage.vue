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

    <!-- AI 正误判定徽章（P5-6：反馈首行"判定：xxx"解析） -->
    <div v-if="judgment && !isStreaming" class="review-chat-page__judgment" :class="`is-${judgment}`">
      <span class="review-chat-page__judgment-badge">
        {{ judgment === 'correct' ? '回答正确' : judgment === 'partial' ? '部分正确' : '回答错误' }}
      </span>
      <span class="review-chat-page__judgment-note">由 AI 依据标准答案/笔记原文判断</span>
    </div>

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
              :title="item2.hint"
              :disabled="ratedPaths.has(item.path)"
              @click="handleRate(item.path, item2.value)"
            >
              <span class="review-chat-page__rate-name">{{ item2.label }}</span>
              <span class="review-chat-page__rate-hint">{{ item2.hint }}</span>
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
            :title="item.hint"
            @click="handleRate(session?.reviewed_note ?? '', item.value)"
          >
            <span class="review-chat-page__rate-name">{{ item.label }}</span>
            <span class="review-chat-page__rate-hint">{{ item.hint }}</span>
          </button>
        </div>
      </template>
    </div>
    <template v-else>
      <!-- 辩论题轮次指示（P5-5）：活跃题为 debate 时展示当前轮次与 AI 持方，仍走 Composer 文本作答 -->
      <div
        v-if="activeQuestion && activeQuestion.type === 'debate'"
        class="review-chat-page__debate"
      >
        <DebateView
          :round="debateRound"
          :max-rounds="activeQuestion.maxRounds ?? DEFAULT_MAX_ROUNDS"
          :position="activeQuestion.position"
        />
      </div>
      <!-- 结构化题型作答组件（P5-4：选择/判对错/填空/排序） -->
      <div
        v-if="activeQuestion && isStructuredAnswer"
        class="review-chat-page__answer"
      >
        <ChoiceAnswer
          v-if="activeQuestion.type === 'choice'"
          :options="activeQuestion.options ?? []"
          :disabled="isStreaming"
          @submit="handleStructuredAnswer"
        />
        <TrueFalseAnswer
          v-else-if="activeQuestion.type === 'true_false'"
          :disabled="isStreaming"
          @submit="handleStructuredAnswer"
        />
        <FillBlankAnswer
          v-else-if="activeQuestion.type === 'fill_blank'"
          :blanks="activeQuestion.blanks ?? 1"
          :disabled="isStreaming"
          @submit="handleStructuredAnswer"
        />
        <OrderingAnswer
          v-else-if="activeQuestion.type === 'ordering'"
          :steps="activeQuestion.steps ?? []"
          :disabled="isStreaming"
          @submit="handleStructuredAnswer"
        />
      </div>
      <!-- AI 等待提示（P5-6）：流式生成中提示用户耐心等待，避免反复提交 -->
      <div v-if="isStreaming" class="review-chat-page__waiting" role="status">
        <span class="review-chat-page__waiting-spinner" aria-hidden="true" />
        <span class="review-chat-page__waiting-text">AI 正在思考…请稍候，不要重复提交</span>
      </div>
      <Composer
        v-if="!isStructuredAnswer"
        :is-streaming="isStreaming"
        :disabled="isStreaming || !hasQuestions || showRating || rated"
        :placeholder="composerPlaceholder"
        @send="handleSend"
        @stop="handleStop"
      />
    </template>

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
import type { Message, Note, ReviewQuestion, ReviewQuestionType, ReviewRating, Session } from '../types'
import { useSettingsStore } from '../stores/settings'
import { useVaultStore } from '../stores/vault'
import { useNoteStore } from '../stores/notes'
import { useReviewStore } from '../stores/review'
import { useToast } from '../composables/useToast'
import { createProvider } from '../api/provider-factory'
import { reviewFollowupStream, reviewDebateStream } from '../api/skills/review-quiz'
import { DEFAULT_MAX_ROUNDS, serializeAnswer, shouldEndDebate } from '../review/question-registry'
import { extractNote } from '../api/skills/extract-note'
import { loadReviewSession, getReviewSessionFilePath } from '../utils/review-session'
import { parseMentionedNotes } from '../utils/review-gap'
import { saveSessionToVault } from '../utils/session-serializer'
import { insertHighlightAt, insertHighlightAtEnd, type AddToNoteTarget } from '../utils/note-insert'
import { resolveMessageIndex } from '../utils/message-locator'
import { extractNoteRefsFromSession, type NoteReference } from '../utils/session-linker'
import { readFile, deleteFile } from '../utils/vault-fs'
import ChatView from '../components/chat/ChatView.vue'
import Composer from '../components/chat/Composer.vue'
import AddToNoteDialog from '../components/notes/AddToNoteDialog.vue'
import ChoiceAnswer from '../components/review/ChoiceAnswer.vue'
import TrueFalseAnswer from '../components/review/TrueFalseAnswer.vue'
import FillBlankAnswer from '../components/review/FillBlankAnswer.vue'
import OrderingAnswer from '../components/review/OrderingAnswer.vue'
import DebateView from '../components/review/DebateView.vue'

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
/** 辩论状态（P5-5）：round 为用户第几次发言（1 起）；turns 为同题历史论点（含 AI 开场/反驳） */
const debateRound = ref(1)
const debateTurns = ref<{ role: 'user' | 'assistant'; content: string }[]>([])
/** AI 对上一轮回答的正误判定（从反馈首行解析，展示为徽章；辩论题不判定） */
const judgment = ref<'correct' | 'partial' | 'wrong' | null>(null)
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
/** 当前待作答问题（P5-4） */
const activeQuestion = computed<ReviewQuestion | undefined>(() => questions.value[currentQuestionIndex.value])
/** 结构化题型（渲染专属组件替代文本输入框；辩论/简答走 Composer） */
const STRUCTURED_TYPES: ReviewQuestionType[] = ['choice', 'true_false', 'fill_blank', 'ordering']
const isStructuredAnswer = computed(() => {
  const q = activeQuestion.value
  return !!q && STRUCTURED_TYPES.includes(q.type)
})
/** 簇模式：簇内笔记超过 1 条时进入逐条评级 */
const hasCluster = computed(() => clusterNotes.value.length > 1)
const noteRefs = computed(() => extractedNotes.value)
const composerPlaceholder = computed(() =>
  activeQuestion.value ? `回答第 ${currentQuestionIndex.value + 1} 题…` : '继续输入…',
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
  // 恢复答题进度：已作答的 user 消息数即已推进的题数（每答一题 push 一条 user 消息；
  // 上限为题目数，答完末题后停在"已无更多问题"；辩论多轮不推进题号，恢复为近似值）
  const answeredCount = messages.value.filter((m) => m.role === 'user').length
  currentQuestionIndex.value = Math.min(answeredCount, questions.value.length)
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

  // 用户消息携带时间戳（复习会话文件 review-* 不计入主界面问答统计，保持一致便于追溯）
  messages.value.push({ role: 'user', content, timestamp: new Date().toISOString() })
  // 新一轮作答开始，清空上一轮的 AI 判定徽章
  judgment.value = null
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
    const clusterCtx = hasCluster.value ? clusterNotes.value : undefined
    if (question.type === 'debate') {
      // P5-5 辩论：多轮对答，未达 maxRounds 不推进题号；达轮次后总结并进入下一题
      const maxRounds = question.maxRounds ?? DEFAULT_MAX_ROUNDS
      debateTurns.value.push({ role: 'user', content })
      const isFinal = shouldEndDebate('debate', debateRound.value, maxRounds)
      for await (const chunk of reviewDebateStream(
        question,
        debateTurns.value,
        note.value,
        provider,
        clusterCtx,
        debateRound.value,
        maxRounds,
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
      debateTurns.value.push({ role: 'assistant', content: streamingText.value })
      if (hasCluster.value) {
        gapPaths.value = new Set(parseMentionedNotes(aiMessage.content, clusterNotes.value))
      }
      if (isFinal) {
        debateRound.value = 1
        debateTurns.value = []
        judgment.value = null
        currentQuestionIndex.value++
      } else {
        debateRound.value++
      }
    } else {
      for await (const chunk of reviewFollowupStream(question, content, note.value, provider, clusterCtx)) {
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
      // P5-6 正误判定：解析反馈首行"判定：xxx"为徽章状态，并从消息文本中移除该行
      judgment.value = extractJudgment(aiMessage.content)
      if (judgment.value) {
        aiMessage.content = aiMessage.content
          .replace(/^判定[:：]\s*(正确|部分正确|错误)[^\n]*\n?/, '')
          .trimStart()
      }
      // P4-4 缺口定位：从 AI 反馈解析被标注的簇内缺口笔记（回答涉及/应涉及的笔记）
      if (hasCluster.value) {
        gapPaths.value = new Set(parseMentionedNotes(aiMessage.content, clusterNotes.value))
      }
      currentQuestionIndex.value++
    }
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

/**
 * 结构化题型作答（P5-4）：组件 payload 经注册表序列化为消息文本，复用 handleSend 流程。
 * 选择/判对错/填空/排序 → 对应组件；序列化约定见 serializeAnswer。
 */
function handleStructuredAnswer(payload: unknown) {
  const q = activeQuestion.value
  if (!q) return
  handleSend(serializeAnswer(q.type, payload))
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
    // 单条模式评级即完成：删除临时复习会话文件（下次「开始复习」将重新出题）
    void removeReviewSessionFile()
    setTimeout(() => router.push('/hub'), 800)
  }
}

/** 簇模式：结束逐条评级并返回学习地图 */
function finishReview() {
  rated.value = true
  // 簇模式完成复习：删除临时复习会话文件（下次「开始复习」将重新出题）
  void removeReviewSessionFile()
  void router.push('/hub')
}

/**
 * 删除临时复习会话文件（完成复习后调用）。
 *
 * 复习会话是按笔记临时生成并持久化出题结果的，用户中途退出时由学习地图复用（不重复出题）；
 * 完成后删除该文件，下次「开始复习」重新出题。删除失败静默忽略，不影响评级返回。
 */
async function removeReviewSessionFile() {
  if (!vaultStore.vaultPath || !session.value) return
  try {
    await deleteFile(getReviewSessionFilePath(vaultStore.vaultPath, session.value.id))
  } catch {
    // 删除失败不影响评级返回
  }
}

function ratingLabel(rating: ReviewRating): string {
  return RATINGS.find((item) => item.value === rating)?.label ?? rating
}

/** 解析 AI 反馈首行的正误判定（判定：正确/部分正确/错误）；未命中返回 null（如历史消息无判定行） */
function extractJudgment(text: string): 'correct' | 'partial' | 'wrong' | null {
  const match = text.match(/^判定[:：]\s*(正确|部分正确|错误)/)
  if (!match) return null
  return match[1] === '正确' ? 'correct' : match[1] === '部分正确' ? 'partial' : 'wrong'
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

/* AI 正误判定徽章（P5-6） */
.review-chat-page__judgment {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  padding: 10px 20px;
  border-top: 1px solid var(--line);
  background: var(--surface);
}

.review-chat-page__judgment-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 650;
  color: #fff;
}

.review-chat-page__judgment.is-correct .review-chat-page__judgment-badge {
  background: var(--state-success);
}

.review-chat-page__judgment.is-partial .review-chat-page__judgment-badge {
  background: var(--state-warning);
}

.review-chat-page__judgment.is-wrong .review-chat-page__judgment-badge {
  background: var(--state-error);
}

.review-chat-page__judgment-note {
  font-size: 11px;
  color: var(--ink-3);
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

/* ---- 结构化答题卡片容器 ---- */
.review-chat-page__answer {
  flex-shrink: 0;
  margin: 8px 20px 0;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  background: var(--surface);
  box-shadow: var(--shadow-1);
}

/* ---- AI 等待提示（防重复提交）---- */
.review-chat-page__waiting {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  margin: 8px 20px 0;
  padding: 9px 14px;
  border: 1px solid #c3d6cb;
  border-radius: var(--r-md);
  background: var(--brand-soft);
  color: var(--brand-strong);
  font-size: 12px;
  font-weight: 600;
}

.review-chat-page__waiting-spinner {
  flex-shrink: 0;
  width: 13px;
  height: 13px;
  border: 2px solid rgba(36, 92, 77, 0.25);
  border-top-color: var(--brand);
  border-radius: 50%;
  animation: review-waiting-spin 0.8s linear infinite;
}

@keyframes review-waiting-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ---- 评级按钮（四档配色）---- */
.review-chat-page__rate {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  flex: 1;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
  color: var(--ink-2);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.review-chat-page__rate-name {
  font-size: 13px;
  font-weight: 700;
}

.review-chat-page__rate-hint {
  font-size: 10px;
  font-weight: 450;
  line-height: 1.4;
}

.review-chat-page__rate:hover {
  border-color: var(--brand);
  color: var(--brand);
  background: var(--brand-soft);
}

.review-chat-page__rate--again {
  border-color: #ecd2cd;
  background: #fbf1ef;
  color: #9c4039;
}

.review-chat-page__rate--again:hover {
  border-color: var(--state-error);
  background: #f6e6e3;
}

.review-chat-page__rate--hard {
  border-color: #ecd9b4;
  background: #faf3e4;
  color: #8a651f;
}

.review-chat-page__rate--hard:hover {
  border-color: var(--state-warning);
  background: #f4ead3;
}

.review-chat-page__rate--good {
  border-color: #c9dfd2;
  background: #edf5f0;
  color: #2f7d5d;
}

.review-chat-page__rate--good:hover {
  border-color: var(--state-success);
  background: #e2efe9;
}

.review-chat-page__rate--easy {
  border-color: #a9c6b8;
  background: var(--brand-soft);
  color: var(--brand-strong);
}

.review-chat-page__rate--easy:hover {
  border-color: var(--brand);
  background: #c9ddd2;
}

.review-chat-page__rate:disabled {
  opacity: 0.55;
  cursor: default;
  border-color: var(--line);
  color: var(--ink-3);
  background: var(--surface);
}

.review-chat-page__progress {
  flex-shrink: 0;
  padding: 3px 10px;
  border: 1px solid var(--line);
  border-radius: var(--r-pill);
  background: var(--surface-2);
  color: var(--ink-2);
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0.02em;
}
</style>
