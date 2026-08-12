<template>
  <div class="main-chat-page">
    <ChatView
      :messages="messages"
      :is-streaming="isStreaming"
      :streaming-text="streamingText"
      :streaming-thinking="streamingThinking"
      :streaming-tool-status="toolStatus"
      :error="error"
      :note-refs="noteRefs"
      @retry="handleRetry"
      @extract-note="handleExtractNote"
      @add-to-note="handleAddToNote"
      @create-branch="handleCreateBranch"
      @navigate-note="handleNavigateNote"
      @navigate-branch="handleNavigateBranch"
    />
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
import { ref, watch, inject, computed, reactive } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import type { Message, Session } from '../types'
import { useSettingsStore } from '../stores/settings'
import { useVaultStore } from '../stores/vault'
import { useSessionStore } from '../stores/session'
import { useNoteStore } from '../stores/notes'
import { useLearnerUpdate } from '../composables/useLearnerUpdate'
import { createProvider } from '../api/provider-factory'
import { extractNote } from '../api/skills/extract-note'
import { chatWithTools } from '../api/chat-loop'
import { CLIENT_TOOLS } from '../api/tools'
import type { NoteReference } from '../utils/session-linker'
import { extractNoteRefsFromSession, filterExistingNoteRefs } from '../utils/session-linker'
import { insertHighlightAt, insertHighlightAtEnd, type AddToNoteTarget } from '../utils/note-insert'
import { useToast } from '../composables/useToast'
import { generateSessionTitle, getSessionFilePath, parseSessionFile } from '../utils/session-serializer'
import { readFile } from '../utils/vault-fs'
import { retrieveKnowledgeContext } from '../utils/knowledge-retrieval'
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

const messages = ref<Message[]>([])
const isStreaming = ref(false)
const streamingText = ref('')
const streamingThinking = ref('')
/** 工具调用状态提示（如"正在查阅参考资料"） */
const toolStatus = ref('')
const error = ref<string | null>(null)
const extractedNotes = ref<NoteReference[]>([])
/** 加入笔记弹窗状态 */
const addToNoteDialog = reactive({
  visible: false,
  highlightedText: '',
  saving: false,
  error: '',
})
let abortController: AbortController | null = null

const noteRefs = computed(() => extractedNotes.value)

/**
 * 从磁盘加载会话消息（仓库即真相：会话以 md 保存在 vault，无本地缓存）。
 * 会话文件缺失（新会话尚未落盘）时为空列表。
 */
async function loadThreadMessages(threadId: string) {
  if (!vaultStore.vaultPath) {
    messages.value = []
    extractedNotes.value = []
    return
  }
  try {
    const sessionPath = getSessionFilePath(vaultStore.vaultPath, threadId)
    const session = parseSessionFile(await readFile(sessionPath), sessionPath)
    messages.value = session.messages
  } catch {
    messages.value = []
  }
  await refreshNoteRefs(threadId)
}

/** 从磁盘重新解析当前会话的笔记引用（删除笔记后同步刷新，避免残留已删除笔记） */
async function refreshNoteRefs(threadId: string) {
  if (!vaultStore.vaultPath) {
    extractedNotes.value = []
    return
  }
  try {
    const sessionPath = getSessionFilePath(vaultStore.vaultPath, threadId)
    // 过滤已删除笔记的悬空引用（会话文件引用行可能因旧版本/路径差异未被清理）
    extractedNotes.value = await filterExistingNoteRefs(extractNoteRefsFromSession(await readFile(sessionPath)))
  } catch {
    extractedNotes.value = []
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

const SYSTEM_PROMPT = `你是知枝，一位学习伴读助手。你的职责是帮助用户深入理解概念、拆解知识点、建立知识关联。

回答要求：
- 使用中文回复
- 结构清晰，善用标题、列表、引用
- 对复杂概念进行白话解释
- 鼓励用户深入思考和追问
- 保持友好、耐心的语气`

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

  // 用户消息携带时间戳：serializer 持久化为「## 用户 · <timestamp>」，供主界面按天统计问答
  messages.value.push({ role: 'user', content, timestamp: new Date().toISOString() })

  await saveCurrentSession(threadId)

  // 如果是新会话（第一条消息），更新会话标题为用户问题的摘要
  if (threadId.startsWith('new_') && messages.value.length === 1) {
    const title = content.length > 20 ? content.slice(0, 20) + '…' : content
    updateThreadTitle(threadId, title)
  }

  const aiMessage: Message = { role: 'assistant', content: '' }
  let responseFinalized = false

  messages.value.push(aiMessage)
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
    } else if (messages.value[messages.value.length - 1] === aiMessage) {
      messages.value.pop()
    }

    streamingText.value = ''
    streamingThinking.value = ''
    toolStatus.value = ''
    await saveCurrentSession(threadId)
    // 回答完成后触发学习者画像更新建议（每会话一次，P3）
    void maybeTriggerLearnerUpdate()
  }

  try {
    const provider = createProvider(config)
    const controller = new AbortController()
    abortController = controller

    // 构建消息列表（system prompt + 历史消息，不包括空的 AI 占位）
    // 检索知识库内容注入系统提示（失败不影响聊天）
    let knowledgeContext = ''
    try {
      knowledgeContext = await retrieveKnowledgeContext(content)
    } catch {
      knowledgeContext = ''
    }
    const systemPrompt = knowledgeContext ? `${SYSTEM_PROMPT}\n\n${knowledgeContext}` : SYSTEM_PROMPT

    // 构建历史消息（不含 system；systemPrompt 单独传给 provider）
    const chatMessages: Message[] = messages.value.slice(0, -1).map(m => ({ role: m.role, content: m.content }))

    for await (const chunk of chatWithTools({
      provider,
      messages: chatMessages,
      systemPrompt,
      tools: CLIENT_TOOLS,
      toolContext: { vaultPath: vaultStore.vaultPath || '' },
      model: config.model,
      signal: controller.signal,
      enableWebSearch: config.enableWebSearch,
    })) {
      switch (chunk.type) {
        case 'text':
          streamingText.value += chunk.content
          break
        case 'thinking':
          streamingThinking.value += chunk.content
          break
        case 'tool_call':
          toolStatus.value = '正在查阅参考资料…'
          break
        case 'tool_result':
          toolStatus.value = '正在整理答案…'
          break
        case 'stop':
          await finalizeResponse()
          break
        case 'error':
          error.value = chunk.content
          messages.value.pop()
          isStreaming.value = false
          streamingText.value = ''
          streamingThinking.value = ''
          toolStatus.value = ''
          break
      }
    }

    await finalizeResponse()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('abort') || msg.includes('AbortError')) {
      await finalizeResponse()
    } else {
      error.value = `请求失败: ${msg}`
      messages.value.pop()
      isStreaming.value = false
      streamingText.value = ''
      streamingThinking.value = ''
    }
  } finally {
    abortController = null
  }

  // 自动新建的会话：回答结束后跳转到该会话路由（会话 id 进入 URL，后续追问复用）；
  // 若用户中途已切换到其他会话/页面，则不再强制跳转
  if (isAutoNewThread && !route.query.thread) {
    await router.replace({ path: '/chat', query: { thread: threadId } })
  }
}

async function saveCurrentSession(threadId: string): Promise<string | null> {
  if (!vaultStore.vaultPath || messages.value.length === 0) return null
  const session: Session = {
    id: threadId,
    title: generateSessionTitle(messages.value),
    created: new Date().toISOString(),
    parent_session: null,
    fork_point: null,
    tags: [],
    messages: messages.value,
  }
  const filePath = await vaultStore.saveCurrentSession(session, false, extractedNotes.value)
  // 会话落盘后刷新侧边栏列表（新会话首条消息后即出现在会话栏；仓库即真相，无本地缓存）
  if (filePath) void useSessionStore().loadSessionsFromVault(vaultStore.vaultPath)
  return filePath
}

/**
 * 会话回答结束后触发学习者画像更新建议（P3）
 * 由 finalizeResponse 调用；每会话最多触发一次（useLearnerUpdate 内部去重）
 */
async function maybeTriggerLearnerUpdate() {
  if (!vaultStore.vaultPath) return
  const config = settingsStore.getProviderConfig()
  if (!config.apiKey) return
  const threadId = typeof route.query.thread === 'string' ? route.query.thread : ''
  if (!threadId || messages.value.length < 3) return

  // 本次会话生成的笔记
  const newNotes = []
  for (const ref of extractedNotes.value) {
    if (ref.kind === 'note') {
      const note = await noteStore.loadNote(ref.path)
      if (note) newNotes.push(note)
    }
  }

  const session: Session = {
    id: threadId,
    title: generateSessionTitle(messages.value),
    created: new Date().toISOString(),
    parent_session: null,
    fork_point: null,
    tags: [],
    messages: [...messages.value],
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
    const sourceSession = threadId ? await saveCurrentSession(threadId) : null
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
    extractedNotes.value.push({ path, title: note.title, messageIndex, kind: 'note', highlight: highlightedText, occurrence })
    if (threadId) await saveCurrentSession(threadId)
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
  extractedNotes.value.push({
    path: branchId,
    title: branchTitle,
    messageIndex: forkMessageIndex,
    kind: 'branch',
    highlight: highlightedText,
  })
  await saveCurrentSession(threadId)

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
  if (abortController) {
    abortController.abort()
    abortController = null
  }
  // 注意：不在这里清除 streamingText 或设置 isStreaming，
  // 让 handleSend 的 catch 块处理中止后的内容保存和状态重置
}

function handleRetry() {
  error.value = null
  // 重试上次发送
  if (messages.value.length > 0) {
    const lastUserMsg = [...messages.value].reverse().find(m => m.role === 'user')
    if (lastUserMsg) {
      // 移除失败的 AI 消息
      if (messages.value[messages.value.length - 1]?.role === 'assistant') {
        messages.value.pop()
      }
      handleSend(lastUserMsg.content)
    }
  }
}
</script>

<style scoped>
.main-chat-page {
  display: flex;
  flex-direction: column;
  height: 100%;
}
</style>