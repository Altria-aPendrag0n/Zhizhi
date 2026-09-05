<template>
  <div class="main-chat-page">
    <ChatView
      :messages="messages"
      :is-streaming="isStreaming"
      :streaming-text="streamingText"
      :streaming-thinking="streamingThinking"
      :streaming-tool-status="toolStatus"
      :error="displayedError"
      :note-refs="noteRefs"
      @retry="handleRetry"
      @extract-note="handleExtractNote"
      @add-to-note="handleAddToNote"
      @create-branch="handleCreateBranch"
      @navigate-note="handleNavigateNote"
      @navigate-branch="handleNavigateBranch"
    />
    <button
      class="guide-chip"
      :class="{ 'is-active': guideMode }"
      :title="guideMode
        ? '引导模式已开启：AI 先诊断起点、小步讲解、引导你产出（点击关闭）'
        : '开启引导模式：AI 先了解你的基础，小步讲解并引导你思考，而不是直接给完整答案'"
      @click="toggleGuideMode"
    >
      <GraduationCap :size="14" />
      <span class="guide-chip__text">引导模式</span>
    </button>
    <Composer
      :is-streaming="isStreaming"
      :disabled="isStreaming"
      placeholder="继续追问，或粘贴一段想要拆解的概念…"
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
    <LearnerProfileDialog
      :visible="learnerVisible"
      :diff="learnerDiff"
      :loading="learnerLoading"
      @confirm="confirmLearnerUpdate"
      @cancel="cancelLearnerUpdate"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, inject, computed, reactive, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { GraduationCap } from '@lucide/vue'
import type { Message, Session } from '../types'
import { useSettingsStore } from '../stores/settings'
import { useVaultStore } from '../stores/vault'
import { useSessionStore } from '../stores/session'
import { useNoteStore } from '../stores/notes'
import { useChatRunner } from '../stores/chat-runner'
import { useLearnerUpdate } from '../composables/useLearnerUpdate'
import { createProvider } from '../api/provider-factory'
import { extractNote } from '../api/skills/extract-note'
import { chatWithTools } from '../api/chat-loop'
import { CLIENT_TOOLS } from '../api/tools'
import type { NoteReference } from '../utils/session-linker'
import { extractNoteRefsFromSession, filterExistingNoteRefs } from '../utils/session-linker'
import { insertHighlightAt, insertHighlightAtEnd, type AddToNoteTarget } from '../utils/note-insert'
import { useToast } from '../composables/useToast'
import { generateSessionTitle, getSessionFilePath, parseSessionFile, resolveSessionFile } from '../utils/session-serializer'
import { readFile } from '../utils/vault-fs'
import { retrieveKnowledgeContext } from '../utils/knowledge-retrieval'
import { buildSystemPrompt } from '../utils/chat-prompts'
import { resolveMessageIndex } from '../utils/message-locator'
import ChatView from '../components/chat/ChatView.vue'
import Composer from '../components/chat/Composer.vue'
import AddToNoteDialog from '../components/notes/AddToNoteDialog.vue'
import LearnerProfileDialog from '../components/learner/LearnerProfileDialog.vue'

const router = useRouter()
const route = useRoute()
const settingsStore = useSettingsStore()
const vaultStore = useVaultStore()
const noteStore = useNoteStore()
const chatRunner = useChatRunner()
const toast = useToast()
const updateThreadTitle = inject<(id: string, title: string) => void>('updateThreadTitle', () => {})
const {
  diff: learnerDiff,
  loading: learnerLoading,
  visible: learnerVisible,
  trigger: triggerLearnerUpdate,
  confirm: confirmLearnerUpdate,
  cancel: cancelLearnerUpdate,
} = useLearnerUpdate()

const threadId = computed(() => (typeof route.query.thread === 'string' ? route.query.thread : ''))

/**
 * 自动新建会话（/chat 无 thread 直接提问）时，回答进行中/完成后的 job 挂在 new_* id 下，
 * 而 route.query.thread 要等回答完成才写入 URL。用 currentJobThreadId 兜底让组件感知该 job。
 */
const currentJobThreadId = ref('')
const activeThreadId = computed(() => currentJobThreadId.value || threadId.value)

/**
 * 消息/流式状态来源：
 * - 有活跃 job（chat-runner，回答进行中或已完成保留）→ 从 job 读取（后台回答不受组件生命周期影响）；
 * - 无 job → 从磁盘加载（loadedMessages / loadedNoteRefs）。
 */
const activeJob = computed(() => (activeThreadId.value ? chatRunner.getJob(activeThreadId.value) : null))
const loadedMessages = ref<Message[]>([])
const loadedNoteRefs = ref<NoteReference[]>([])
/** 加载会话的种类与计划关联：重存会话时回写，避免侧边栏分组（kind）在续聊后漂移 */
const loadedSessionKind = ref<Session['kind']>(undefined)
const loadedSessionPlanId = ref<string | undefined>(undefined)
/** 引导模式（会话级）：加载会话时从 frontmatter 恢复，新会话取设置页全局默认（v0.3.1） */
const guideMode = ref(settingsStore.guideModeDefault)

/** 切换引导模式：状态随下次会话落盘写入 frontmatter */
function toggleGuideMode() {
  guideMode.value = !guideMode.value
}
const messages = computed(() => activeJob.value?.messages ?? loadedMessages.value)
const isStreaming = computed(() => activeJob.value?.isStreaming ?? false)
const streamingText = computed(() => activeJob.value?.streamingText ?? '')
const streamingThinking = computed(() => activeJob.value?.streamingThinking ?? '')
/** 工具调用状态提示（如"正在查阅参考资料"） */
const toolStatus = computed(() => activeJob.value?.toolStatus ?? '')
const extractedNotes = computed(() => activeJob.value?.noteRefs ?? loadedNoteRefs.value)
/** 局部错误（API Key 缺失等非回答错误）；回答错误来自 job.error */
const error = ref<string | null>(null)
const displayedError = computed(() => activeJob.value?.error ?? error.value)
/** 加入笔记弹窗状态 */
const addToNoteDialog = reactive({
  visible: false,
  highlightedText: '',
  saving: false,
  error: '',
})

const noteRefs = computed(() => extractedNotes.value)

/** 追加笔记引用（有活跃 job 时写入 job，否则写入本地加载列表） */
function pushNoteRef(noteRef: NoteReference) {
  const job = activeJob.value
  if (job) job.noteRefs.push(noteRef)
  else loadedNoteRefs.value.push(noteRef)
}

/**
 * 从磁盘加载会话消息（仓库即真相：会话以 md 保存在 vault，无本地缓存）。
 * 会话文件缺失（新会话尚未落盘）时为空列表。
 * 有活跃 job（后台回答进行中/已完成）时跳过磁盘加载，由 job 提供消息。
 */
async function loadThreadMessages(threadId: string) {
  if (chatRunner.hasJob(threadId)) return
  if (!vaultStore.vaultPath) {
    loadedMessages.value = []
    loadedNoteRefs.value = []
    return
  }
  try {
    const sessionPath = await resolveSessionFile(vaultStore.vaultPath, threadId)
      ?? getSessionFilePath(vaultStore.vaultPath, threadId)
    const session = parseSessionFile(await readFile(sessionPath), sessionPath)
    loadedMessages.value = session.messages
    loadedSessionKind.value = session.kind
    loadedSessionPlanId.value = session.plan_id
    guideMode.value = session.guide ?? settingsStore.guideModeDefault
  } catch {
    loadedMessages.value = []
    loadedSessionKind.value = undefined
    loadedSessionPlanId.value = undefined
    guideMode.value = settingsStore.guideModeDefault
  }
  await refreshNoteRefs(threadId)
}

/** 从磁盘重新解析当前会话的笔记引用（删除笔记后同步刷新，避免残留已删除笔记） */
async function refreshNoteRefs(threadId: string) {
  if (chatRunner.hasJob(threadId)) return
  if (!vaultStore.vaultPath) {
    loadedNoteRefs.value = []
    return
  }
  try {
    const sessionPath = await resolveSessionFile(vaultStore.vaultPath, threadId)
      ?? getSessionFilePath(vaultStore.vaultPath, threadId)
    // 过滤已删除笔记的悬空引用（会话文件引用行可能因旧版本/路径差异未被清理）
    loadedNoteRefs.value = await filterExistingNoteRefs(extractNoteRefsFromSession(await readFile(sessionPath)))
  } catch {
    loadedNoteRefs.value = []
  }
}

// 监听路由变化，切换会话内容（消息从 vault md 文件解析加载）
watch(
  () => route.query.thread,
  (newThreadId) => {
    if (newThreadId && typeof newThreadId === 'string') {
      loadThreadMessages(newThreadId)
    }
  },
  { immediate: true },
)

// 删除笔记后同步刷新当前会话的"已生成笔记"引用
// （组件实例可能因路由 key 相同而复用，不会重新挂载解析；磁盘会话文件已被 removeSessionReferences 清理）
watch(
  () => noteStore.lastDeletedNotePath,
  () => {
    const threadId = typeof route.query.thread === 'string' ? route.query.thread : ''
    if (threadId) void refreshNoteRefs(threadId)
  },
)

async function handleSend(content: string) {
  error.value = null

  // 检查 API Key 配置
  const config = settingsStore.getProviderConfig()
  if (!config.apiKey) {
    error.value = '请先在设置页面配置 API Key'
    router.push('/settings')
    return
  }

  // 空白界面直接提问：无激活会话（/chat 无 thread）时自动创建新会话。
  // 先用 new_* 占位 id 落盘，回答完成后跳转路由把会话 id 写入 URL（侧边栏高亮、后续追问复用同一会话）
  let threadId = typeof route.query.thread === 'string' ? route.query.thread : ''
  const isAutoNewThread = !threadId
  if (isAutoNewThread) threadId = `new_${Date.now()}`
  // 新会话：让组件立即感知该 job（route 尚未写入 thread），回答完成后 route 更新则不再需要
  if (isAutoNewThread) currentJobThreadId.value = threadId

  // 以当前会话消息为基础追加用户消息（用户消息携带时间戳：serializer 持久化为「## 用户 · <timestamp>」）
  const baseMessages: Message[] = [...messages.value]
  baseMessages.push({ role: 'user', content, timestamp: new Date().toISOString() })

  await saveCurrentSession(threadId, baseMessages, extractedNotes.value)

  // 如果是新会话（第一条消息），更新会话标题为用户问题的摘要
  if (threadId.startsWith('new_') && baseMessages.length === 1) {
    const title = content.length > 20 ? content.slice(0, 20) + '…' : content
    updateThreadTitle(threadId, title)
  }

  // 空 assistant 占位交给 chat-runner：回答完成后填充内容并落盘
  const aiMessage: Message = { role: 'assistant', content: '' }
  baseMessages.push(aiMessage)

  // 构建消息列表（system prompt + 历史消息，不包括空的 AI 占位）
  // 检索知识库内容注入系统提示（失败不影响聊天）
  let knowledgeContext = ''
  try {
    const knowledge = await retrieveKnowledgeContext(content)
    knowledgeContext = knowledge.context
    // 来源锚定：来源映射挂到本条 AI 消息（正文 [n] 角标与末尾来源列表使用，随会话持久化）
    if (knowledge.sources.length > 0) {
      aiMessage.citations = knowledge.sources
    }
  } catch {
    knowledgeContext = ''
  }
  const systemPrompt = knowledgeContext
    ? `${buildSystemPrompt(guideMode.value)}\n\n${knowledgeContext}`
    : buildSystemPrompt(guideMode.value)
  const chatMessages: Message[] = baseMessages.slice(0, -1).map(m => ({ role: m.role, content: m.content }))

  const provider = createProvider(config)
  chatRunner.startChat({
    threadId,
    messages: baseMessages,
    noteRefs: [...extractedNotes.value],
    onFinalize: async ({ messages: finalMessages, noteRefs: finalRefs }) => {
      // 回答完成（含中止保留的半截内容）落盘到会话文件（仓库即真相）
      await saveCurrentSession(threadId, finalMessages, finalRefs)
      // 回答完成后触发学习者画像更新建议（每会话一次，P3）
      void maybeTriggerLearnerUpdate(threadId, finalMessages, finalRefs)
      // 自动新建的会话：回答结束后跳转到该会话路由（会话 id 进入 URL，后续追问复用）；
      // 若用户中途已切换到其他会话/页面，则不再强制跳转
      if (isAutoNewThread && !route.query.thread) {
        await router.replace({ path: '/chat', query: { thread: threadId } })
      }
    },
    run: async (signal, emit) => {
      for await (const chunk of chatWithTools({
        provider,
        messages: chatMessages,
        systemPrompt,
        tools: CLIENT_TOOLS,
        toolContext: { vaultPath: vaultStore.vaultPath || '' },
        model: config.model,
        signal,
        enableWebSearch: config.enableWebSearch,
      })) {
        emit(chunk)
      }
    },
  })
}

async function saveCurrentSession(threadId: string, sessionMessages: Message[], refs: NoteReference[]): Promise<string | null> {
  if (!vaultStore.vaultPath || sessionMessages.length === 0) return null
  const session: Session = {
    id: threadId,
    title: generateSessionTitle(sessionMessages),
    created: new Date().toISOString(),
    parent_session: null,
    fork_point: null,
    tags: [],
    messages: sessionMessages,
    // 保留已落盘会话的种类与计划关联（学习会话两者皆空，与旧文件兼容）
    ...(loadedSessionKind.value ? { kind: loadedSessionKind.value } : {}),
    ...(loadedSessionPlanId.value ? { plan_id: loadedSessionPlanId.value } : {}),
    // 引导模式开关随会话持久化（显式 true/false，与全局默认区分）
    guide: guideMode.value,
  }
  const filePath = await vaultStore.saveCurrentSession(session, false, refs)
  // 会话落盘后刷新侧边栏列表（新会话首条消息后即出现在会话栏；仓库即真相，无本地缓存）
  if (filePath) void useSessionStore().loadSessionsFromVault(vaultStore.vaultPath)
  return filePath
}

/**
 * 会话回答结束后触发学习者画像更新建议（P3）
 * 由 chat-runner 的 onFinalize 调用；每会话最多触发一次（useLearnerUpdate 内部去重）
 */
async function maybeTriggerLearnerUpdate(threadId: string, sessionMessages: Message[], refs: NoteReference[]) {
  if (!vaultStore.vaultPath) return
  const config = settingsStore.getProviderConfig()
  if (!config.apiKey || sessionMessages.length < 3) return
  if (sessionMessages.length === 0) return

  // 本次会话生成的笔记
  const newNotes = []
  for (const ref of refs) {
    if (ref.kind === 'note') {
      const note = await noteStore.loadNote(ref.path)
      if (note) newNotes.push(note)
    }
  }

  const session: Session = {
    id: threadId,
    title: generateSessionTitle(sessionMessages),
    created: new Date().toISOString(),
    parent_session: null,
    fork_point: null,
    tags: [],
    messages: [...sessionMessages],
  }
  await triggerLearnerUpdate(session, newNotes, createProvider(config), vaultStore.vaultPath, noteStore.noteCount)
}

async function handleExtractNote(highlightedText: string, domMessageIndex: number | null = null, occurrence = 1) {
  // 标题/标签均不允许 LLM 生成时，摘录完全不调用 LLM，无需 API Key
  const needLLM = settingsStore.autoGenerateNoteTitle || settingsStore.autoGenerateNoteTags
  const config = settingsStore.getProviderConfig()
  if (needLLM && !config.apiKey) {
    toast.error('请先在设置页面配置 API Key')
    router.push('/settings')
    return
  }

  try {
    const threadId = typeof route.query.thread === 'string' ? route.query.thread : ''
    const sourceSession = threadId ? await saveCurrentSession(threadId, messages.value, extractedNotes.value) : null
    if (!sourceSession) throw new Error('请先在设置中选择本地 Vault')
    const note = await extractNote(
      highlightedText,
      messages.value.map((message) => `${message.role}: ${message.content}`).join('\n\n'),
      createProvider(config),
      undefined,
      {
        generateTitle: settingsStore.autoGenerateNoteTitle,
        generateTags: settingsStore.autoGenerateNoteTags,
      },
    )
    const path = await noteStore.saveNote(vaultStore.vaultPath, note, sourceSession, highlightedText)
    if (!path) throw new Error('笔记保存失败')

    // 优先用划线时 DOM 定位的消息索引；文本匹配仅作回退（渲染文本与 markdown 源可能不一致）
    const messageIndex = resolveMessageIndex(highlightedText, messages.value, domMessageIndex, 'assistant')
    // 记录划线文本与出现序号（重复文本定位），供原会话消息中以虚线标记并跳转笔记
    pushNoteRef({ path, title: note.title, messageIndex, kind: 'note', highlight: highlightedText, occurrence })
    if (threadId) await saveCurrentSession(threadId, messages.value, extractedNotes.value)
    toast.success('已提炼并保存为原子笔记')
  } catch (e) {
    toast.error(e instanceof Error ? e.message : '笔记提炼失败')
  }
}
async function handleAddToNote(highlightedText: string, _occurrence = 1) {
  if (!vaultStore.vaultPath) {
    toast.error('请先在设置中选择本地 Vault')
    return
  }
  if (noteStore.notes.length === 0) {
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
    const note = await noteStore.loadNote(target.notePath)
    if (!note) throw new Error('笔记不存在或无法读取')
    const newBody = target.headingLine === null
      ? insertHighlightAtEnd(target.body, addToNoteDialog.highlightedText)
      : insertHighlightAt(target.body, target.headingLine, addToNoteDialog.highlightedText)
    const saved = await noteStore.updateNote({ ...note, content: newBody })
    if (!saved) throw new Error('写入笔记失败')
    addToNoteDialog.visible = false
    toast.success('已加入笔记')
  } catch (e) {
    addToNoteDialog.error = e instanceof Error ? e.message : '加入笔记失败'
  } finally {
    addToNoteDialog.saving = false
  }
}

async function handleCreateBranch(highlightedText: string, domMessageIndex: number | null = null, occurrence = 1) {
  const threadId = typeof route.query.thread === 'string' ? route.query.thread : ''
  if (!threadId || !vaultStore.vaultPath) {
    toast.error('请先选择 Vault 并打开一个会话')
    return
  }

  // 优先用划线时 DOM 定位的消息索引；文本匹配仅作回退
  const forkMessageIndex = resolveMessageIndex(highlightedText, messages.value, domMessageIndex)
  if (forkMessageIndex === -1) {
    toast.error('未找到划线内容所在的消息')
    return
  }

  const parentSession: Session = {
    id: threadId,
    title: generateSessionTitle(messages.value),
    created: new Date().toISOString(),
    parent_session: null,
    fork_point: null,
    tags: [],
    messages: [...messages.value],
  }
  const branchTitle = highlightedText.replace(/\s+/g, ' ').trim().slice(0, 30) || '分支追问'
  const branchId = await useSessionStore().createBranchInVault(
    vaultStore.vaultPath,
    parentSession,
    forkMessageIndex,
    branchTitle,
    undefined,
    highlightedText,
    occurrence,
  )

  if (!branchId) {
    toast.error('创建分支失败')
    return
  }

  // 记录划线文本与分支引用，供原会话消息中以虚线标记并跳转分支
  pushNoteRef({
    path: branchId,
    title: branchTitle,
    messageIndex: forkMessageIndex,
    kind: 'branch',
    highlight: highlightedText,
  })
  await saveCurrentSession(threadId, messages.value, extractedNotes.value)

  await vaultStore.refreshFileTree()
  router.push({
    name: 'branch-chat',
    params: { sessionId: threadId, branchId },
    query: { fork_index: String(forkMessageIndex) },
  })
}
function handleNavigateNote(path: string) {
  router.push(`/notes/${encodeURIComponent(path)}`)
}

function handleNavigateBranch(branchId: string) {
  const threadId = typeof route.query.thread === 'string' ? route.query.thread : ''
  if (!threadId) return
  router.push({ name: 'branch-chat', params: { sessionId: threadId, branchId } })
}

function handleStop() {
  // 交给 chat-runner 中止（已流式的内容保留并落盘；runner 不受组件卸载影响）
  if (activeThreadId.value) chatRunner.abort(activeThreadId.value)
}

function handleRetry() {
  error.value = null
  // 重试上次发送：移除最后一条失败消息（assistant 半截或已发出的 user），再重发，避免消息重复
  if (messages.value.length > 0) {
    const lastUserMsg = [...messages.value].reverse().find(m => m.role === 'user')
    if (lastUserMsg) {
      const last = messages.value[messages.value.length - 1]
      if (last?.role === 'assistant' || last?.role === 'user') {
        messages.value.pop()
      }
      void handleSend(lastUserMsg.content)
    }
  }
}

onUnmounted(() => {
  // 组件卸载（切换会话/页面）时清理已完成的后台回答 job；进行中的 job 保留，回答继续
  if (threadId.value) chatRunner.cleanupIdleJob(threadId.value)
  if (currentJobThreadId.value && currentJobThreadId.value !== threadId.value) {
    chatRunner.cleanupIdleJob(currentJobThreadId.value)
  }
  currentJobThreadId.value = ''
})
</script>

<style scoped>
.main-chat-page {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* 引导模式开关：固定在输入框左侧空隙，与输入框垂直居中（Composer 为 fixed 定位，此处对齐其坐标） */
.guide-chip {
  position: fixed;
  z-index: 2;
  bottom: 32px;
  left: calc(76px + 244px + 8px);
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--ink-2);
  font-size: 12px;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}

.guide-chip:hover {
  color: var(--brand-strong);
  border-color: var(--brand);
}

.guide-chip.is-active {
  border-color: var(--brand);
  background: var(--brand-soft);
  color: var(--brand-strong);
  font-weight: 650;
}

.guide-chip__text {
  white-space: nowrap;
}

/* 窄屏：会话栏与输入框之间的空隙变小，按钮收缩为纯图标 */
@media (max-width: 1100px) {
  .guide-chip {
    left: calc(64px + 218px + 4px);
    padding: 6px;
  }

  .guide-chip__text {
    display: none;
  }
}
</style>