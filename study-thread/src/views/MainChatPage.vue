<template>
  <div class="main-chat-page">
    <ChatView
      :messages="messages"
      :is-streaming="isStreaming"
      :streaming-text="streamingText"
      :error="error"
      @retry="handleRetry"
    />
    <Composer
      :is-streaming="isStreaming"
      :disabled="false"
      placeholder="继续追问，或粘贴一段想要拆解的概念…"
      @send="handleSend"
      @stop="handleStop"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import type { Message, Session } from '../types'
import { useSettingsStore } from '../stores/settings'
import { useVaultStore } from '../stores/vault'
import { createProvider } from '../api/provider-factory'
import { generateSessionTitle } from '../utils/session-serializer'
import ChatView from '../components/chat/ChatView.vue'
import Composer from '../components/chat/Composer.vue'

const router = useRouter()
const settingsStore = useSettingsStore()
const vaultStore = useVaultStore()

const messages = ref<Message[]>([])
const isStreaming = ref(false)
const streamingText = ref('')
const error = ref<string | null>(null)
let abortController: AbortController | null = null
let sessionId = crypto.randomUUID()

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

  // 添加用户消息
  messages.value.push({ role: 'user', content })

  // 创建 AI 消息占位
  const aiMessage: Message = { role: 'assistant', content: '' }
  messages.value.push(aiMessage)

  isStreaming.value = true
  streamingText.value = ''

  try {
    const provider = createProvider(config)
    abortController = new AbortController()

    // 构建消息列表（system prompt + 历史消息）
    const chatMessages = [
      { role: 'system' as const, content: SYSTEM_PROMPT },
      ...messages.value.slice(0, -1), // 不包括刚创建的 AI 占位
    ]

    for await (const chunk of provider.chat(chatMessages, {
      model: config.model,
      signal: abortController.signal,
    })) {
      switch (chunk.type) {
        case 'text':
        case 'thinking':
          aiMessage.content += chunk.content
          streamingText.value = aiMessage.content
          break
        case 'stop':
          isStreaming.value = false
          streamingText.value = ''
          // 保存会话到 vault
          saveCurrentSession()
          break
        case 'error':
          error.value = chunk.content
          // 移除失败的 AI 消息
          messages.value.pop()
          isStreaming.value = false
          streamingText.value = ''
          break
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('abort') || msg.includes('AbortError')) {
      // 用户主动停止
    } else {
      error.value = `请求失败: ${msg}`
      messages.value.pop()
    }
    isStreaming.value = false
    streamingText.value = ''
  }
}

async function saveCurrentSession() {
  if (!vaultStore.vaultPath || messages.value.length === 0) return
  const session: Session = {
    id: sessionId,
    title: generateSessionTitle(messages.value),
    created: new Date().toISOString(),
    parent_session: null,
    fork_point: null,
    tags: [],
    messages: messages.value,
  }
  await vaultStore.saveCurrentSession(session)
}

function handleStop() {
  if (abortController) {
    abortController.abort()
    abortController = null
  }
  isStreaming.value = false
  streamingText.value = ''
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