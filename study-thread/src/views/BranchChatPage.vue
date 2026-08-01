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
      <div class="fork-context__content">
        {{ forkContext }}
      </div>
    </div>

    <div class="branch-chat__body">
      <ChatView
        :messages="messages"
        :is-streaming="isStreaming"
        :streaming-text="streamingText"
        :error="error"
        :note-refs="noteRefs"
        @retry="handleRetry"
        @extract-note="handleExtractNote"
        @create-branch="handleCreateBranch"
        @navigate-note="handleNavigateNote"
      />
    </div>

    <Composer
      :is-streaming="isStreaming"
      :disabled="isStreaming"
      @send="handleSend"
      @stop="handleStop"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSettingsStore } from '../stores/settings'
import { useVaultStore } from '../stores/vault'
import { useSessionStore } from '../stores/session'
import { useNoteStore } from '../stores/notes'
import { createProvider } from '../api/provider-factory'
import { branchFollowupStream } from '../api/skills/branch-followup'
import { extractNote } from '../api/skills/extract-note'
import type { Message, Session } from '../types'
import { loadBranchContext } from '../utils/branch-context'
import type { NoteReference } from '../utils/session-linker'
import { extractNoteRefsFromSession } from '../utils/session-linker'
import { generateSessionTitle, getSessionFilePath } from '../utils/session-serializer'
import { readFile } from '../utils/vault-fs'
import { useToast } from '../composables/useToast'
import ChatView from '../components/chat/ChatView.vue'
import Composer from '../components/chat/Composer.vue'
import BranchBreadcrumb, { type BreadcrumbItem } from '../components/chat/BranchBreadcrumb.vue'

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
const error = ref<string | null>(null)
const forkContext = ref<string>('')
const noteRefs = computed(() => extractedNotes.value)

const sessionId = computed(() => route.params.sessionId as string)
const branchId = computed(() => route.params.branchId as string)
const forkIndex = computed(() => Number(route.query.fork_index || 0))

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
  const context = await loadBranchContext(parentFile, forkIndex.value)
  forkMessages.value = context
  forkContext.value = context.length > 0
    ? `${context[context.length - 1].content.slice(0, 200)}${context[context.length - 1].content.length > 200 ? '...' : ''}`
    : ''

  const currentFile = getSessionFilePath(vaultStore.vaultPath, branchId.value, true)
  try {
    const savedMessages = await loadBranchContext(currentFile, Number.MAX_SAFE_INTEGER)
    messages.value = savedMessages.length > 0 ? savedMessages : context
    extractedNotes.value = extractNoteRefsFromSession(await readFile(currentFile))
  } catch {
    messages.value = context
    extractedNotes.value = []
  }
}

onMounted(loadContext)
watch(
  () => [vaultStore.vaultPath, sessionId.value, branchId.value, forkIndex.value],
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

  const finalizeResponse = async () => {
    if (responseFinalized) return
    responseFinalized = true
    isStreaming.value = false

    if (streamingText.value) {
      aiMessage.content = streamingText.value
      messages.value.push(aiMessage)
    }

    streamingText.value = ''
    await saveCurrentSession()
  }

  try {
    const provider = createProvider(providerConfig)
    for await (const chunk of branchFollowupStream(content, forkMessages.value, [], provider)) {
      if (chunk.type === 'text' || chunk.type === 'thinking') {
        streamingText.value += chunk.content
      } else if (chunk.type === 'stop') {
        await finalizeResponse()
      } else if (chunk.type === 'error') {
        error.value = chunk.content
        isStreaming.value = false
        streamingText.value = ''
      }
    }
    await finalizeResponse()
  } catch (e) {
    error.value = `发送失败: ${e instanceof Error ? e.message : String(e)}`
    isStreaming.value = false
    streamingText.value = ''
  }
}

function handleStop() {
  isStreaming.value = false
}

function handleRetry() {
  error.value = null
  const lastUserMessage = [...messages.value].reverse().find((message) => message.role === 'user')
  if (lastUserMessage) void handleSend(lastUserMessage.content)
}

async function handleExtractNote(highlightedText: string) {
  const config = settingsStore.getProviderConfig()
  if (!config.apiKey) {
    toast.error('请先在设置页面配置 API Key')
    router.push('/settings')
    return
  }

  try {
    const sourceSession = await saveCurrentSession()
    if (!sourceSession) throw new Error('请先在设置中选择本地 Vault')
    const note = await extractNote(
      highlightedText,
      messages.value.map((message) => `${message.role}: ${message.content}`).join('\n\n'),
      createProvider(config),
    )
    const path = await noteStore.saveNote(vaultStore.vaultPath, note, sourceSession, highlightedText)
    if (!path) throw new Error('笔记保存失败')

    const messageIndex = messages.value.map((message) => message.role === 'assistant' && message.content.includes(highlightedText)).lastIndexOf(true)
    extractedNotes.value.push({ path, title: note.title, messageIndex })
    await saveCurrentSession()
    toast.success('已提炼并保存为原子笔记')
  } catch (e) {
    toast.error(e instanceof Error ? e.message : '笔记提炼失败')
  }
}

async function handleCreateBranch(highlightedText: string) {
  if (!vaultStore.vaultPath) {
    toast.error('请先选择 Vault 并打开一个会话')
    return
  }

  const forkMessageIndex = messages.value.map((message) => message.content.includes(highlightedText)).lastIndexOf(true)
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
  )
  if (!nestedBranchId) {
    toast.error('创建分支失败')
    return
  }

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
}

.branch-chat__body {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
</style>
