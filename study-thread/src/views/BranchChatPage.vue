<template>
  <div class="branch-chat-page">
    <!-- 面包屑 -->
    <BranchBreadcrumb
      :breadcrumbs="breadcrumbs"
      @navigate="handleNavigate"
    />

    <!-- 分叉引用 -->
    <div class="fork-context" v-if="forkContext">
      <div class="fork-context__header">
        <span class="fork-context__label">分叉点上下文</span>
      </div>
      <div class="fork-context__content">
        {{ forkContext }}
      </div>
    </div>

    <!-- 对话区域 -->
    <div class="branch-chat__body">
      <ChatView
        :messages="messages"
        :is-streaming="isStreaming"
        :streaming-text="streamingText"
        :error="error"
        @retry="handleRetry"
        @extract-note="handleExtractNote"
        @create-branch="handleCreateBranch"
        @navigate-note="handleNavigateNote"
      />
    </div>

    <!-- 输入框 -->
    <Composer
      :is-streaming="isStreaming"
      :disabled="isStreaming"
      @send="handleSend"
      @stop="handleStop"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSettingsStore } from '../stores/settings'
import { createProvider } from '../api/provider-factory'
import { branchFollowupStream } from '../api/skills/branch-followup'
import type { Message } from '../types'
import { loadBranchContext } from '../utils/branch-context'
import ChatView from '../components/chat/ChatView.vue'
import Composer from '../components/chat/Composer.vue'
import BranchBreadcrumb, { type BreadcrumbItem } from '../components/chat/BranchBreadcrumb.vue'

const route = useRoute()
const router = useRouter()
const settingsStore = useSettingsStore()

const messages = ref<Message[]>([])
const forkMessages = ref<Message[]>([])
const isStreaming = ref(false)
const streamingText = ref('')
const error = ref<string | null>(null)
const forkContext = ref<string>('')

const breadcrumbs = computed<BreadcrumbItem[]>(() => {
  const sessionId = route.params.sessionId as string
  const branchId = route.params.branchId as string
  return [
    { id: sessionId, title: '主会话' },
    { id: branchId, title: '分支追问' },
  ]
})

onMounted(async () => {
  const sessionId = route.params.sessionId as string
  const forkIndex = Number(route.query.fork_index || 0)

  // 加载分叉前的上下文
  // 实际项目中，sessionFile 应从 vault 读取
  const sessionFile = `sessions/${sessionId}.md`
  const context = await loadBranchContext(sessionFile, forkIndex)
  forkMessages.value = context
  messages.value = context

  // 提取最后一条消息作为分叉引用
  if (context.length > 0) {
    const lastMsg = context[context.length - 1]
    forkContext.value = lastMsg.content.slice(0, 200) + (lastMsg.content.length > 200 ? '...' : '')
  }
})

async function handleSend(content: string) {
  if (!content.trim() || isStreaming.value) return

  error.value = null
  messages.value.push({ role: 'user', content })

  const providerConfig = settingsStore.getProviderConfig()
  if (!providerConfig.apiKey) {
    error.value = '请先在设置中配置 API Key'
    return
  }

  isStreaming.value = true
  streamingText.value = ''
  const aiMessage: Message = { role: 'assistant', content: '' }

  try {
    const provider = createProvider(providerConfig)

    // 使用分支追问 Skill，注入分叉上下文和相关笔记
    for await (const chunk of branchFollowupStream(
      content,
      forkMessages.value,
      [], // 相关笔记暂时为空，后续可集成笔记搜索
      provider,
    )) {
      if (chunk.type === 'text') {
        streamingText.value += chunk.content
        aiMessage.content += chunk.content
      } else if (chunk.type === 'stop') {
        isStreaming.value = false
        messages.value.push(aiMessage)
        streamingText.value = ''
        // 保存会话（后续完善）
      } else if (chunk.type === 'error') {
        error.value = chunk.content
        isStreaming.value = false
      }
    }
  } catch (e) {
    error.value = `发送失败: ${(e as Error).message}`
    isStreaming.value = false
  }
}

function handleStop() {
  isStreaming.value = false
}

function handleRetry() {
  error.value = null
}

function handleExtractNote(_text: string) {
  // 划线提炼笔记（后续完善）
}

function handleCreateBranch(_text: string) {
  // 创建分支（后续完善）
}

function handleNavigateNote(path: string) {
  router.push(`/notes/${encodeURIComponent(path)}`)
}

function handleNavigate(target: string) {
  if (target === 'home') {
    router.push('/chat')
  } else {
    router.push(`/chat/branch/${route.params.sessionId}/${target}`)
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