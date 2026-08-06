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
        :error="error"
        :note-refs="noteRefs"
        @retry="handleRetry"
        @extract-note="handleExtractNote"
        @add-to-note="handleAddToNote"
        @create-branch="handleCreateBranch"
        @navigate-note="handleNavigateNote"
        @navigate-branch="handleNavigateBranch"
      />
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, reactive, nextTick } from 'vue'
import { marked } from 'marked'
import { useRoute, useRouter } from 'vue-router'
import { useSettingsStore } from '../stores/settings'
import { useVaultStore } from '../stores/vault'
import { useSessionStore } from '../stores/session'
import { useNoteStore } from '../stores/notes'
import { createProvider } from '../api/provider-factory'
import { branchFollowupStream } from '../api/skills/branch-followup'
import { extractNote } from '../api/skills/extract-note'
import type { Message, Session, ExtractedNote } from '../types'
import { loadBranchContext, buildForkContextPreview, stripInheritedContext, extractForkContext, parseMessages } from '../utils/branch-context'
import { parseFrontmatter } from '../parser/frontmatter'
import type { NoteReference } from '../utils/session-linker'
import { extractNoteRefsFromSession } from '../utils/session-linker'
import { insertHighlightAt, insertHighlightAtEnd, type AddToNoteTarget } from '../utils/note-insert'
import { resolveMessageIndex } from '../utils/message-locator'
import { generateSessionTitle, getSessionFilePath } from '../utils/session-serializer'
import { readFile } from '../utils/vault-fs'
import { retrieveKnowledgeContext } from '../utils/knowledge-retrieval'
import { wrapHighlightInDOM, unwrapHighlight } from '../utils/highlight-dom'
import { preprocessMarkdownForRendering } from '../utils/markdown-preprocess'
import { useToast } from '../composables/useToast'
import ChatView from '../components/chat/ChatView.vue'
import Composer from '../components/chat/Composer.vue'
import BranchBreadcrumb, { type BreadcrumbItem } from '../components/chat/BranchBreadcrumb.vue'
import ExtractNoteDialog from '../components/notes/ExtractNoteDialog.vue'
import AddToNoteDialog from '../components/notes/AddToNoteDialog.vue'

const route = useRoute()
const router = useRouter()
const settingsStore = useSettingsStore()
const vaultStore = useVaultStore()
const sessionStore = useSessionStore()
const noteStore = useNoteStore()
const toast = useToast()

const messages = ref<Message[]>([])
const forkMessages = ref<Message[]>([])
const extractedNotes = ref<NoteReference[]>([])
const isStreaming = ref(false)
const streamingText = ref('')
const streamingThinking = ref('')
const error = ref<string | null>(null)
const forkContext = ref<string>('')
const forkContextRef = ref<HTMLElement | null>(null)
/** 划线文本（frontmatter fork_highlight），用于分叉点上下文渲染后 DOM 高亮定位 */
const forkHighlight = ref<string>('')

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
  wrapHighlightInDOM(body, forkHighlight.value, 'mark', 'fork-highlight')
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

  const parentFile = getSessionFilePath(vaultStore.vaultPath, sessionId.value, isBranchSession(sessionId.value))
  const currentFile = getSessionFilePath(vaultStore.vaultPath, branchId.value, true)

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
    forkContextFromFile = extractForkContext(body)
    savedMessages = parseMessages(body, Number.MAX_SAFE_INTEGER)
  } catch {
    // 新分支：下方为干净的新对话界面，不显示主会话历史
    currentRaw = ''
    savedMessages = []
  }

  const context = await loadBranchContext(parentFile, forkIndex.value)
  forkMessages.value = context
  // 分叉点上下文：优先展示分支文件持久化的区块（划线内容及附近文本）；旧文件回退到实时构建
  forkContext.value = forkContextFromFile || buildForkContextPreview(context, forkIndex.value)

  // 剥离旧版本分支文件内嵌的继承上下文副本，只保留分支自身对话
  messages.value = stripInheritedContext(savedMessages, forkMessages.value)
  extractedNotes.value = currentRaw ? extractNoteRefsFromSession(currentRaw) : []
}

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
  }
}

async function saveCurrentSession(): Promise<string | null> {
  if (!vaultStore.vaultPath || messages.value.length === 0) return null
  return vaultStore.saveCurrentSession(getCurrentSession(), true, extractedNotes.value)
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
  messages.value.push({ role: 'user', content })
  await saveCurrentSession()

  const aiMessage: Message = { role: 'assistant', content: '' }
  let responseFinalized = false
  isStreaming.value = true
  streamingText.value = ''
  streamingThinking.value = ''

  const finalizeResponse = async () => {
    if (responseFinalized) return
    responseFinalized = true
    isStreaming.value = false

    if (streamingText.value) {
      aiMessage.content = streamingText.value
      aiMessage.thinking = streamingThinking.value || undefined
      messages.value.push(aiMessage)
    }

    streamingText.value = ''
    streamingThinking.value = ''
    await saveCurrentSession()
  }

  try {
    const provider = createProvider(providerConfig)
    // 检索知识库内容注入分支追问（失败不影响聊天）
    let knowledgeContext = ''
    try {
      knowledgeContext = await retrieveKnowledgeContext(content)
    } catch {
      knowledgeContext = ''
    }
    // 分支会话自身的对话历史（不含当前问题）：messages 只含分支自身多轮对话
    const branchHistory = messages.value.slice(0, -1)
    for await (const chunk of branchFollowupStream(
      content,
      forkMessages.value,
      branchHistory,
      [],
      provider,
      knowledgeContext,
      { vaultPath: vaultStore.vaultPath || '' },
    )) {
      if (chunk.type === 'text') {
        streamingText.value += chunk.content
      } else if (chunk.type === 'thinking') {
        streamingThinking.value += chunk.content
      } else if (chunk.type === 'stop') {
        await finalizeResponse()
      } else if (chunk.type === 'error') {
        error.value = chunk.content
        isStreaming.value = false
        streamingText.value = ''
        streamingThinking.value = ''
      }
    }
    await finalizeResponse()
  } catch (e) {
    error.value = `发送失败: ${e instanceof Error ? e.message : String(e)}`
    isStreaming.value = false
    streamingText.value = ''
    streamingThinking.value = ''
  }
}

function handleStop() {
  isStreaming.value = false
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
  if (lastUserMessage) void handleSend(lastUserMessage.content)
}

async function handleExtractNote(highlightedText: string, domMessageIndex: number | null = null) {
  const config = settingsStore.getProviderConfig()
  if (!config.apiKey) {
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
      )
    } else {
      note = { ...extractDialog.draft, title: title.trim() }
    }

    const path = await noteStore.saveNote(vaultStore.vaultPath, note, sourceSession, highlightedText)
    if (!path) throw new Error('笔记保存失败')

    // 优先用划线时 DOM 定位的消息索引；文本匹配仅作回退
    const messageIndex = resolveMessageIndex(highlightedText, messages.value, extractDialog.messageIndex, 'assistant')
    // 记录划线文本，供分支会话消息中以虚线标记并跳转笔记
    extractedNotes.value.push({ path, title: note.title, messageIndex, kind: 'note', highlight: highlightedText })
    await saveCurrentSession()
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
  extractedNotes.value.push({
    path: nestedBranchId,
    title: branchTitle,
    messageIndex: forkMessageIndex,
    kind: 'branch',
    highlight: highlightedText,
  })
  await saveCurrentSession()

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
</script>

<style scoped>
.branch-chat-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--surface);
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
