<template>
  <div class="branch-chat-page">
    <BranchBreadcrumb
      :breadcrumbs="breadcrumbs"
      @navigate="handleNavigate"
    />

    <div v-if="forkContext" class="fork-context">
      <div class="fork-context__header">
        <span class="fork-context__label">分叉点上下文</span>
      </div>
      <div ref="forkContextRef" class="fork-context__content" v-html="renderedForkContext" />
    </div>

    <div class="branch-chat__body">
      <ChatView
        :messages="messages"
        :is-streaming="isStreaming"
        :streaming-text="streamingText"
        :streaming-thinking="streamingThinking"
        :error="displayedError"
        :note-refs="noteRefs"
        @retry="handleRetry"
        @extract-note="handleExtractNote"
        @add-to-note="handleAddToNote"
        @create-branch="handleCreateBranch"
        @navigate-note="handleNavigateNote"
        @navigate-branch="handleNavigateBranch"
      />
    </div>

    <div class="guide-bar">
      <button
        class="guide-bar__toggle"
        :class="{ 'is-active': guideMode }"
        :title="guideMode
          ? '引导模式已开启：AI 先诊断起点、小步讲解、引导你产出（点击关闭）'
          : '开启引导模式：AI 先了解你的基础，小步讲解并引导你思考，而不是直接给完整答案'"
        @click="toggleGuideMode"
      >
        <GraduationCap :size="14" />
        引导模式
      </button>
      <span v-if="guideMode" class="guide-bar__hint">多轮引导讲解，token 消耗更高；说「直接告诉我」可跳过引导</span>
    </div>

    <Composer
      :is-streaming="isStreaming"
      :disabled="isStreaming"
      @send="handleSend"
      @stop="handleStop"
    />

    <ExtractNoteDialog
      :visible="extractDialog.visible"
      :title="extractDialog.title"
      :highlighted-text="extractDialog.highlightedText"
      :loading="extractDialog.loading"
      :saving="extractDialog.saving"
      :error="extractDialog.error"
      @close="cancelExtract"
      @confirm="confirmExtract"
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
import { ref, computed, onMounted, onUnmounted, watch, reactive, nextTick } from 'vue'
import { marked } from 'marked'
import { useRoute, useRouter } from 'vue-router'
import { GraduationCap } from '@lucide/vue'
import { useSettingsStore } from '../stores/settings'
import { useVaultStore } from '../stores/vault'
import { useSessionStore } from '../stores/session'
import { useNoteStore } from '../stores/notes'
import { useChatRunner } from '../stores/chat-runner'
import { createProvider } from '../api/provider-factory'
import { branchFollowupStream } from '../api/skills/branch-followup'
import { extractNote } from '../api/skills/extract-note'
import type { Message, Session, ExtractedNote } from '../types'
import { loadBranchContext, buildForkContextPreview, stripInheritedContext, extractForkContext } from '../utils/branch-context'
import { parseFrontmatter } from '../parser/frontmatter'
import { parseSessionMessages } from '../utils/session-serializer'
import type { NoteReference } from '../utils/session-linker'
import { extractNoteRefsFromSession, filterExistingNoteRefs } from '../utils/session-linker'
import { insertHighlightAt, insertHighlightAtEnd, type AddToNoteTarget } from '../utils/note-insert'
import { resolveMessageIndex } from '../utils/message-locator'
import { generateSessionTitle, getSessionFilePath, resolveSessionFile } from '../utils/session-serializer'
import { readFile } from '../utils/vault-fs'
import { retrieveKnowledgeContext } from '../utils/knowledge-retrieval'
import { wrapHighlightInDOM, unwrapHighlight, isTableHighlight, wrapTableInDOM } from '../utils/highlight-dom'
import { preprocessMarkdownForRendering } from '../utils/markdown-preprocess'
import { useToast } from '../composables/useToast'
import { useLearnerUpdate } from '../composables/useLearnerUpdate'
import ChatView from '../components/chat/ChatView.vue'
import Composer from '../components/chat/Composer.vue'
import BranchBreadcrumb, { type BreadcrumbItem } from '../components/chat/BranchBreadcrumb.vue'
import ExtractNoteDialog from '../components/notes/ExtractNoteDialog.vue'
import AddToNoteDialog from '../components/notes/AddToNoteDialog.vue'
import LearnerProfileDialog from '../components/learner/LearnerProfileDialog.vue'

const route = useRoute()
const router = useRouter()
const settingsStore = useSettingsStore()
const vaultStore = useVaultStore()
const sessionStore = useSessionStore()
const noteStore = useNoteStore()
const chatRunner = useChatRunner()
const toast = useToast()
const {
  diff: learnerDiff,
  loading: learnerLoading,
  visible: learnerVisible,
  trigger: triggerLearnerUpdate,
  confirm: confirmLearnerUpdate,
  cancel: cancelLearnerUpdate,
} = useLearnerUpdate()

/**
 * 消息/流式状态来源：
 * - 有活跃 job（chat-runner，回答进行中或已完成保留）→ 从 job 读取（后台回答不受组件生命周期影响）；
 * - 无 job → 从磁盘加载（loadedMessages / loadedNoteRefs）。
 */
const activeJob = computed(() => (branchId.value ? chatRunner.getJob(branchId.value) : null))
const loadedMessages = ref<Message[]>([])
const loadedNoteRefs = ref<NoteReference[]>([])
const messages = computed(() => activeJob.value?.messages ?? loadedMessages.value)
const extractedNotes = computed(() => activeJob.value?.noteRefs ?? loadedNoteRefs.value)
const isStreaming = computed(() => activeJob.value?.isStreaming ?? false)
const streamingText = computed(() => activeJob.value?.streamingText ?? '')
const streamingThinking = computed(() => activeJob.value?.streamingThinking ?? '')
const error = ref<string | null>(null)
const displayedError = computed(() => activeJob.value?.error ?? error.value)
/** 分叉点上下文（父会话中划线内容附近的原文），来自父会话文件解析 */
const forkMessages = ref<Message[]>([])
const forkContext = ref<string>('')
const forkContextRef = ref<HTMLElement | null>(null)
/** 划线文本（frontmatter fork_highlight），用于分叉点上下文渲染后 DOM 高亮定位 */
const forkHighlight = ref<string>('')
/** 划线文本在消息中的出现序号（frontmatter fork_highlight_occ），重复文本时按序号定位 */
const forkHighlightOcc = ref(1)
/** 引导模式（会话级）：加载分支时从 frontmatter 恢复，新分支取设置页全局默认（v0.3.1） */
const guideMode = ref(settingsStore.guideModeDefault)

/** 切换引导模式：状态随下次会话落盘写入 frontmatter */
function toggleGuideMode() {
  guideMode.value = !guideMode.value
}

/** 追加笔记引用（有活跃 job 时写入 job，否则写入本地加载列表） */
function pushNoteRef(noteRef: NoteReference) {
  const job = activeJob.value
  if (job) job.noteRefs.push(noteRef)
  else loadedNoteRefs.value.push(noteRef)
}

/** 分叉点上下文用 markdown 渲染（划线内容本身可能含 markdown 标记） */
const renderedForkContext = computed(() => {
  if (!forkContext.value) return ''
  return marked.parse(preprocessMarkdownForRendering(forkContext.value), {
    breaks: true,
    gfm: true,
  }) as string
})

/** v-html 更新后在 DOM 上把划线文本高亮（跨标记/跨节点均可定位，先 unwrap 旧标记保证幂等） */
watch(renderedForkContext, async () => {
  await nextTick()
  const body = forkContextRef.value
  if (!body || !forkHighlight.value) return
  unwrapHighlight(body, 'mark', 'fork-highlight')
  if (isTableHighlight(forkHighlight.value)) {
    // 表格划线：划线文本为整张表格的 Markdown 源码，渲染 DOM 文本无 `|` 分隔符，
    // 无法定位；且跨单元格切分文本节点会破坏 `<table>` 结构，直接整表包裹高亮
    wrapTableInDOM(body, 'mark', 'fork-highlight')
    return
  }
  // 重复文本出现多次时按出现序号定位（forkHighlightOcc 缺省第 1 处）
  wrapHighlightInDOM(body, forkHighlight.value, 'mark', 'fork-highlight', forkHighlightOcc.value)
})

/** 摘录为笔记弹窗状态 */
const extractDialog = reactive({
  visible: false,
  loading: false,
  saving: false,
  title: '',
  highlightedText: '',
  /** 划线时 DOM 定位的消息索引（渲染文本与 markdown 源不一致时仍可靠） */
  messageIndex: null as number | null,
  error: '',
  draft: null as ExtractedNote | null,
})

/** 加入笔记弹窗状态 */
const addToNoteDialog = reactive({
  visible: false,
  highlightedText: '',
  saving: false,
  error: '',
})

const noteRefs = computed(() => extractedNotes.value)

const sessionId = computed(() => route.params.sessionId as string)
const branchId = computed(() => route.params.branchId as string)
/** 分叉点消息索引：以分支文件 frontmatter 的 fork_point 为准（左侧目录进入时路由无该参数） */
const forkIndex = ref(0)

const breadcrumbs = computed<BreadcrumbItem[]>(() => [
  { id: sessionId.value, title: '主会话' },
  { id: branchId.value, title: '分支追问' },
])

function isBranchSession(id: string) {
  return id.startsWith('branch_')
}

async function loadContext() {
  error.value = null
  if (!vaultStore.vaultPath) await vaultStore.restoreLastVault()
  if (!vaultStore.vaultPath) {
    error.value = '请先打开包含该会话的 Vault'
    return
  }

  const parentFile = await resolveSessionFile(vaultStore.vaultPath, sessionId.value)
    ?? getSessionFilePath(vaultStore.vaultPath, sessionId.value, isBranchSession(sessionId.value))
  const currentFile = await resolveSessionFile(vaultStore.vaultPath, branchId.value)
    ?? getSessionFilePath(vaultStore.vaultPath, branchId.value, true)

  // 分叉点索引与上下文优先来自分支文件本身：
  // 划线创建分支时路由带 fork_index，但左侧目录/深链接进入时没有，只能依赖文件持久化内容
  let currentRaw = ''
  let savedMessages: Message[] = []
  let forkContextFromFile = ''
  try {
    currentRaw = await readFile(currentFile)
    const { meta, body } = parseFrontmatter(currentRaw)
    const storedForkIndex = Number(meta.fork_point)
    if (meta.fork_point && !Number.isNaN(storedForkIndex)) {
      forkIndex.value = storedForkIndex
    }
    forkHighlight.value = typeof meta.fork_highlight === 'string' ? meta.fork_highlight : ''
    const storedOcc = Number(meta.fork_highlight_occ)
    forkHighlightOcc.value = storedOcc > 1 ? storedOcc : 1
    forkContextFromFile = extractForkContext(body)
    // 引导模式：frontmatter 显式记录时恢复，否则取设置页全局默认
    guideMode.value = typeof meta.guide === 'boolean' ? meta.guide : settingsStore.guideModeDefault
    // 用带时间戳的消息解析器加载分支自身对话：重存会话时不丢失消息级时间戳（主界面统计依赖）
    savedMessages = parseSessionMessages(body)
  } catch {
    // 新分支：下方为干净的新对话界面，不显示主会话历史
    currentRaw = ''
    savedMessages = []
    guideMode.value = settingsStore.guideModeDefault
  }

  const context = await loadBranchContext(parentFile, forkIndex.value)
  forkMessages.value = context
  // 分叉点上下文：优先展示分支文件持久化的区块（划线内容及附近文本）；旧文件回退到实时构建
  forkContext.value = forkContextFromFile || buildForkContextPreview(context, forkIndex.value)

  // 剥离旧版本分支文件内嵌的继承上下文副本，只保留分支自身对话
  loadedMessages.value = stripInheritedContext(savedMessages, forkMessages.value)
  loadedNoteRefs.value = currentRaw ? extractNoteRefsFromSession(currentRaw) : []
}

/** 从磁盘重新解析当前分支的笔记引用（删除笔记后同步刷新，避免残留已删除笔记） */
async function refreshNoteRefs() {
  if (chatRunner.hasJob(branchId.value)) return
  if (!vaultStore.vaultPath) {
    loadedNoteRefs.value = []
    return
  }
  try {
    const currentFile = await resolveSessionFile(vaultStore.vaultPath, branchId.value)
      ?? getSessionFilePath(vaultStore.vaultPath, branchId.value, true)
    const currentRaw = await readFile(currentFile)
    // 过滤已删除笔记的悬空引用（会话文件引用行可能因旧版本/路径差异未被清理）
    loadedNoteRefs.value = await filterExistingNoteRefs(extractNoteRefsFromSession(currentRaw))
  } catch {
    loadedNoteRefs.value = []
  }
}

// 删除笔记后同步刷新当前分支的"已生成笔记"引用
// （组件实例可能因路由 key 相同而复用，不会重新挂载解析；磁盘分支文件已被 removeSessionReferences 清理）
watch(
  () => noteStore.lastDeletedNotePath,
  () => { void refreshNoteRefs() },
)

onMounted(loadContext)
watch(
  () => [vaultStore.vaultPath, sessionId.value, branchId.value, route.query.fork_index],
  () => { void loadContext() },
)

function getCurrentSession(): Session {
  return {
    id: branchId.value,
    title: generateSessionTitle(messages.value),
    created: new Date().toISOString(),
    parent_session: sessionId.value,
    fork_point: String(forkIndex.value),
    tags: [],
    messages: messages.value.map((message) => ({ ...message })),
    // 分叉点上下文随分支文件持久化，重新进入分支会话时前端识别渲染
    fork_context: forkContext.value || undefined,
    fork_highlight: forkHighlight.value || undefined,
    guide: guideMode.value,
  }
}

async function saveCurrentSession(sessionMessages?: Message[], refs?: NoteReference[]): Promise<string | null> {
  if (!vaultStore.vaultPath) return null
  const msgs = sessionMessages ?? messages.value
  const noteRefs = refs ?? extractedNotes.value
  if (msgs.length === 0) return null
  return vaultStore.saveCurrentSession(getCurrentSessionFor(msgs), true, noteRefs)
}

/** 基于指定消息构建分支 Session（保存/学习者画像共用） */
function getCurrentSessionFor(msgs: Message[]): Session {
  return {
    id: branchId.value,
    title: generateSessionTitle(msgs),
    created: new Date().toISOString(),
    parent_session: sessionId.value,
    fork_point: String(forkIndex.value),
    tags: [],
    messages: msgs.map((message) => ({ ...message })),
    fork_context: forkContext.value || undefined,
    fork_highlight: forkHighlight.value || undefined,
    // 引导模式开关随分支文件持久化（显式 true/false，与全局默认区分）
    guide: guideMode.value,
  }
}

/**
 * 分支会话回答结束后触发学习者画像更新建议（P3）
 * 由 chat-runner 的 onFinalize 调用；每会话最多触发一次（useLearnerUpdate 内部去重）
 */
async function maybeTriggerLearnerUpdate(sessionMessages: Message[], refs: NoteReference[]) {
  if (!vaultStore.vaultPath) return
  const config = settingsStore.getProviderConfig()
  if (!config.apiKey || sessionMessages.length < 3) return

  // 本次会话生成的笔记
  const newNotes = []
  for (const ref of refs) {
    if (ref.kind === 'note') {
      const note = await noteStore.loadNote(ref.path)
      if (note) newNotes.push(note)
    }
  }

  await triggerLearnerUpdate(
    getCurrentSessionFor(sessionMessages),
    newNotes,
    createProvider(config),
    vaultStore.vaultPath,
    noteStore.noteCount,
  )
}

async function handleSend(content: string) {
  if (!content.trim() || isStreaming.value) return

  const providerConfig = settingsStore.getProviderConfig()
  if (!providerConfig.apiKey) {
    error.value = '请先在设置中配置 API Key'
    router.push('/settings')
    return
  }

  error.value = null
  // 用户消息携带时间戳：serializer 持久化为「## 用户 · <timestamp>」，供主界面按天统计问答
  const baseMessages: Message[] = [...messages.value]
  baseMessages.push({ role: 'user', content, timestamp: new Date().toISOString() })
  await saveCurrentSession(baseMessages, extractedNotes.value)

  // 空 assistant 占位交给 chat-runner：回答完成后填充内容并落盘
  const aiMessage: Message = { role: 'assistant', content: '' }
  baseMessages.push(aiMessage)

  // 检索知识库内容注入分支追问（失败不影响聊天）
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
  // 分支会话自身的对话历史（不含当前问题）：baseMessages 只含分支自身多轮对话
  const branchHistory = baseMessages.slice(0, -1)

  const provider = createProvider(providerConfig)
  chatRunner.startChat({
    threadId: branchId.value,
    messages: baseMessages,
    noteRefs: [...extractedNotes.value],
    onFinalize: async ({ messages: finalMessages, noteRefs: finalRefs }) => {
      // 回答完成（含中止保留的半截内容）落盘到分支会话文件（仓库即真相）
      await saveCurrentSession(finalMessages, finalRefs)
      void maybeTriggerLearnerUpdate(finalMessages, finalRefs)
    },
    run: async (signal, emit) => {
      for await (const chunk of branchFollowupStream(
        content,
        forkMessages.value,
        branchHistory,
        [],
        provider,
        knowledgeContext,
        guideMode.value,
        { vaultPath: vaultStore.vaultPath || '' },
        signal,
      )) {
        emit(chunk)
      }
    },
  })
}

function handleStop() {
  // 交给 chat-runner 中止（已流式的内容保留并落盘；runner 不受组件卸载影响）
  chatRunner.abort(branchId.value)
}

async function handleAddToNote(highlightedText: string) {
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

function handleRetry() {
  error.value = null
  const lastUserMessage = [...messages.value].reverse().find((message) => message.role === 'user')
  if (lastUserMessage) {
    // 移除最后一条失败消息（assistant 半截或已发出的 user），再重发，避免消息重复
    const last = messages.value[messages.value.length - 1]
    if (last?.role === 'assistant' || last?.role === 'user') {
      messages.value.pop()
    }
    void handleSend(lastUserMessage.content)
  }
}

async function handleExtractNote(highlightedText: string, domMessageIndex: number | null = null) {
  // 标题/标签均不允许 LLM 生成时，摘录完全不调用 LLM，无需 API Key
  const needLLM = settingsStore.autoGenerateNoteTitle || settingsStore.autoGenerateNoteTags
  const config = settingsStore.getProviderConfig()
  if (needLLM && !config.apiKey) {
    toast.error('请先在设置页面配置 API Key')
    router.push('/settings')
    return
  }
  if (!vaultStore.vaultPath) {
    toast.error('请先在设置中选择本地 Vault')
    return
  }

  extractDialog.highlightedText = highlightedText
  extractDialog.messageIndex = domMessageIndex
  extractDialog.error = ''
  extractDialog.draft = null
  extractDialog.visible = true
  extractDialog.loading = true

  try {
    // 先由 LLM 生成建议标题与内容，预填到弹窗，用户可修改
    const draft = await extractNote(
      highlightedText,
      messages.value.map((message) => `${message.role}: ${message.content}`).join('\n\n'),
      createProvider(config),
      undefined,
      {
        generateTitle: settingsStore.autoGenerateNoteTitle,
        generateTags: settingsStore.autoGenerateNoteTags,
      },
    )
    extractDialog.draft = draft
    extractDialog.title = draft.title
  } catch (e) {
    extractDialog.visible = false
    toast.error(e instanceof Error ? e.message : '笔记提炼失败')
  } finally {
    extractDialog.loading = false
  }
}

async function confirmExtract(title: string) {
  if (!extractDialog.draft) return
  extractDialog.saving = true
  extractDialog.error = ''
  try {
    const config = settingsStore.getProviderConfig()
    const highlightedText = extractDialog.highlightedText
    const sourceSession = await saveCurrentSession()
    if (!sourceSession) throw new Error('请先在设置中选择本地 Vault')
    let note = extractDialog.draft
    if (title.trim() !== extractDialog.draft.title.trim()) {
      // 用户修改了标题：用用户标题重新生成，确保描述等内容与标题一致
      note = await extractNote(
        highlightedText,
        messages.value.map((message) => `${message.role}: ${message.content}`).join('\n\n'),
        createProvider(config),
        title,
        {
          generateTitle: settingsStore.autoGenerateNoteTitle,
          generateTags: settingsStore.autoGenerateNoteTags,
        },
      )
    } else {
      note = { ...extractDialog.draft, title: title.trim() }
    }

    const path = await noteStore.saveNote(vaultStore.vaultPath, note, sourceSession, highlightedText)
    if (!path) throw new Error('笔记保存失败')

    // 优先用划线时 DOM 定位的消息索引；文本匹配仅作回退
    const messageIndex = resolveMessageIndex(highlightedText, messages.value, extractDialog.messageIndex, 'assistant')
    // 记录划线文本，供分支会话消息中以虚线标记并跳转笔记
    pushNoteRef({ path, title: note.title, messageIndex, kind: 'note', highlight: highlightedText })
    await saveCurrentSession(messages.value, extractedNotes.value)
    extractDialog.visible = false
    extractDialog.draft = null
    toast.success('已提炼并保存为原子笔记')
  } catch (e) {
    extractDialog.error = e instanceof Error ? e.message : '笔记提炼失败'
  } finally {
    extractDialog.saving = false
  }
}

function cancelExtract() {
  extractDialog.visible = false
  extractDialog.draft = null
}

async function handleCreateBranch(highlightedText: string, domMessageIndex: number | null = null) {
  if (!vaultStore.vaultPath) {
    toast.error('请先选择 Vault 并打开一个会话')
    return
  }

  // 嵌套分支最多三层（主会话 → 第 1/2/3 层分支）
  if (sessionStore.getNodeBranchDepth(branchId.value) >= sessionStore.MAX_BRANCH_DEPTH) {
    toast.error(`分支最多支持 ${sessionStore.MAX_BRANCH_DEPTH} 层嵌套`)
    return
  }

  // 优先用划线时 DOM 定位的消息索引；文本匹配仅作回退
  const forkMessageIndex = resolveMessageIndex(highlightedText, messages.value, domMessageIndex)
  if (forkMessageIndex === -1) {
    toast.error('未找到划线内容所在的消息')
    return
  }

  const branchTitle = highlightedText.replace(/\s+/g, ' ').trim().slice(0, 30) || '分支追问'
  const nestedBranchId = await sessionStore.createBranchInVault(
    vaultStore.vaultPath,
    getCurrentSession(),
    forkMessageIndex,
    branchTitle,
    undefined,
    highlightedText,
  )
  if (!nestedBranchId) {
    toast.error('创建分支失败')
    return
  }

  // 记录划线文本与分支引用，供分支会话消息中以虚线标记并跳转嵌套分支
  pushNoteRef({
    path: nestedBranchId,
    title: branchTitle,
    messageIndex: forkMessageIndex,
    kind: 'branch',
    highlight: highlightedText,
  })
  await saveCurrentSession(messages.value, extractedNotes.value)

  await vaultStore.refreshFileTree()
  router.push({
    name: 'branch-chat',
    params: { sessionId: branchId.value, branchId: nestedBranchId },
    query: { fork_index: String(forkMessageIndex) },
  })
}

function handleNavigateNote(path: string) {
  router.push(`/notes/${encodeURIComponent(path)}`)
}

function handleNavigateBranch(nestedBranchId: string) {
  router.push({
    name: 'branch-chat',
    params: { sessionId: branchId.value, branchId: nestedBranchId },
  })
}

function handleNavigate(target: string) {
  if (target === 'home') {
    router.push({ name: 'chat', query: { thread: sessionId.value } })
  }
}

onUnmounted(() => {
  // 组件卸载（切换会话/页面）时清理已完成的后台回答 job；进行中的 job 保留，回答继续
  chatRunner.cleanupIdleJob(branchId.value)
})
</script>

<style scoped>
.branch-chat-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--surface);
}

/* 引导模式开关栏：会话级切换，位于对话区与输入框之间 */
.guide-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 16px 0;
}

.guide-bar__toggle {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 11px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--ink-2);
  font-size: 12px;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}

.guide-bar__toggle:hover {
  color: var(--brand-strong);
  border-color: var(--brand);
}

.guide-bar__toggle.is-active {
  border-color: var(--brand);
  background: var(--brand-soft);
  color: var(--brand-strong);
  font-weight: 650;
}

.guide-bar__hint {
  color: var(--ink-2);
  font-size: 11px;
  opacity: 0.85;
}

.fork-context {
  padding: 14px 24px;
  background: var(--surface-2);
  border-bottom: 1px solid var(--line);
}

.fork-context__header {
  margin-bottom: 8px;
}

.fork-context__label {
  color: var(--brand);
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.1em;
}

.fork-context__content {
  padding: 10px 13px;
  border-left: 2px solid var(--brand);
  background: var(--surface);
  color: var(--ink-2);
  font-size: 12px;
  line-height: 1.65;
  border-radius: 0 8px 8px 0;
  /* 划线内容可能较长，限制高度并支持滚动 */
  max-height: 140px;
  overflow-y: auto;
}

.fork-context__content :deep(p) {
  margin: 0 0 8px;
}

.fork-context__content :deep(p:last-child) {
  margin-bottom: 0;
}

.fork-context__content :deep(strong) {
  color: var(--brand-strong);
  font-weight: 650;
}

/* 划线内容以特殊颜色明显凸显，划线处下方渲染虚线 */
.fork-context__content :deep(mark.fork-highlight) {
  background: var(--brand);
  color: #fff;
  padding: 1px 3px;
  border-radius: 3px;
  font-weight: 650;
  /* 划线处下方的虚线（跟随文字，白点在品牌色底上清晰可见） */
  text-decoration: underline dotted;
  text-decoration-color: #fff;
  text-decoration-thickness: 2px;
  text-underline-offset: 3px;
}

.fork-context__content :deep(blockquote) {
  margin: 8px 0;
  padding: 4px 0 4px 10px;
  border-left: 2px solid var(--brand);
  color: var(--brand-strong);
}

.fork-context__content :deep(ul),
.fork-context__content :deep(ol) {
  margin: 0 0 8px;
  padding-left: 18px;
}

.fork-context__content :deep(li) {
  margin: 2px 0;
}

.branch-chat__body {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
</style>
