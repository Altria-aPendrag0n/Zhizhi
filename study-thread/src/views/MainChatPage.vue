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
import { createProvider } from '../api/provider-factory'
import { extractNote } from '../api/skills/extract-note'
import { chatWithTools } from '../api/chat-loop'
import { CLIENT_TOOLS } from '../api/tools'
import type { NoteReference } from '../utils/session-linker'
import { extractNoteRefsFromSession } from '../utils/session-linker'
import { insertHighlightAt, insertHighlightAtEnd, type AddToNoteTarget } from '../utils/note-insert'
import { useToast } from '../composables/useToast'
import { generateSessionTitle, getSessionFilePath } from '../utils/session-serializer'
import { readFile } from '../utils/vault-fs'
import { retrieveKnowledgeContext } from '../utils/knowledge-retrieval'
import { loadStoredValue, saveStoredValue } from '../utils/local-storage'
import { resolveMessageIndex } from '../utils/message-locator'
import ChatView from '../components/chat/ChatView.vue'
import Composer from '../components/chat/Composer.vue'
import AddToNoteDialog from '../components/notes/AddToNoteDialog.vue'

const router = useRouter()
const route = useRoute()
const settingsStore = useSettingsStore()
const vaultStore = useVaultStore()
const noteStore = useNoteStore()
const toast = useToast()
const updateThreadTitle = inject<(id: string, title: string) => void>('updateThreadTitle', () => {})

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
const LOCAL_THREAD_MESSAGES_KEY = 'study-thread-messages'

const dynamicThreadMessages = loadStoredValue<Record<string, Message[]>>(LOCAL_THREAD_MESSAGES_KEY) ?? {}

const noteRefs = computed(() => extractedNotes.value)

// 每个会话的模拟消息数据
const threadMessages: Record<string, Message[]> = {
  '1': [
    {
      role: 'user',
      content: '请不要只给我步骤。费曼学习法究竟在训练什么？我怎样判断自己不是在假装讲懂？',
    },
    {
      role: 'assistant',
      content: `费曼学习法的核心不是"把知识讲得简单"，而是逼迫你把脑中的**熟悉感**转换成可检验的**因果结构**。当你只能复述术语，却说不清它为什么如此、在什么条件下失效，你拥有的往往是识别，不是理解。

## 它真正训练的，是三次来回

1. **压缩：** 从材料里拿走定义与结论，再用自己的语言重新组织。你必须决定什么是骨架，什么只是装饰。
2. **暴露：** 一旦向一个没有背景的人解释，模糊处会立即出现。卡住不是失败，而是知识地图上最有价值的标记。
3. **修补：** 回到原始材料，只补缺口，不整段重读。之后再讲一遍，直到逻辑能独立站立。

可以把它想成一次小型的教学设计：你不是要证明自己会背，而是要让对方在没有你替他跳步的情况下，仍能跟上推理。

> 好解释不是删掉复杂性；好解释是保留复杂性的关系，同时降低进入它的门槛。

## 怎样识别"假装讲懂"

试着不用关键词讲一分钟，并在讲完后回答三个追问：**它解决什么问题？它靠什么机制起作用？它的边界条件是什么？** 如果你只能回到定义，或者把"因为它就是这样"换成更长的句子，那么该回去补的不是措辞，而是连接。`,
    },
  ],
  '2': [
    {
      role: 'user',
      content: '工作记忆的容量有限，这对学习策略有什么影响？',
    },
    {
      role: 'assistant',
      content: `工作记忆是认知科学中一个核心概念。它的容量限制——通常认为**4±1个组块**——直接决定了我们在学习时能同时处理多少信息。

## 对学习策略的三个关键影响

1. **分块策略**：将相关信息组织成有意义的组块，能有效扩展工作记忆的容量。例如，把一串数字"19491001"记成"1949年10月1日"。
2. **避免认知过载**：同时呈现过多信息会导致学习效率急剧下降。好的教学设计应该**逐步引入**新概念。
3. **间隔学习**：给工作记忆留出"消化"时间，让信息从工作记忆转入长时记忆。

> 工作记忆不是瓶颈，而是过滤器——它决定了什么信息能进入更深层的加工。

理解这一点，你就能设计出更符合大脑工作机制的学习计划。`,
    },
  ],
  '3': [
    {
      role: 'user',
      content: '什么是间隔重复？它为什么有效？',
    },
    {
      role: 'assistant',
      content: `间隔重复是一种基于**遗忘曲线**的学习策略。核心思想很简单：在即将遗忘的时间点进行复习，能最大化记忆巩固效果。

## 为什么有效

1. **利用遗忘的自然节律**：每次复习都重置了遗忘曲线，让记忆变得更牢固。
2. **减少总复习时间**：相比集中复习，间隔重复的总时间投入更少，但长期记忆效果更好。
3. **促进深度加工**：每次重新提取记忆，都会强化神经通路。

## 实践建议

- 使用闪卡工具（如 Anki）自动安排复习间隔
- 初始间隔短（1天），逐渐拉长（3天、7天、30天）
- 对于容易遗忘的内容，缩短间隔

> 记忆不是"存进去就完事"——它需要在合适的时间被重新唤醒。`,
    },
  ],
  '4': [
    {
      role: 'user',
      content: '如何设计一个有效的形成性测验？',
    },
    {
      role: 'assistant',
      content: `形成性测验的核心目的不是打分，而是**暴露知识缺口**。好的形成性测验应该让学生和教师都能看清"哪里还不会"。

## 设计原则

1. **高频低风险**：每次测验只覆盖少量知识点，不计入最终成绩。
2. **即时反馈**：答完后立即显示正确答案和解释。
3. **覆盖关键概念**：重点测试核心概念的理解，而非细枝末节。

## 题型建议

- **选择题**：快速筛查常见误解
- **简答题**：检验深层理解
- **概念图**：让学生画出知识间的关系

> 测验不是学习的终点，而是学习的路标。`,
    },
  ],
  '5': [
    {
      role: 'user',
      content: '认知科学领域有哪些经典论文值得阅读？',
    },
    {
      role: 'assistant',
      content: `以下是认知科学领域几篇具有里程碑意义的论文，按主题分类：

## 工作记忆与认知负荷

- **Baddeley & Hitch (1974)** — 工作记忆模型的奠基之作
- **Sweller (1988)** — 认知负荷理论

## 学习与记忆

- **Ebbinghaus (1885)** — 遗忘曲线的经典研究
- **Karpicke & Roediger (2008)** — 测试效应：提取练习对长期记忆的关键作用

## 专家与新手差异

- **Chase & Simon (1973)** — 国际象棋大师的组块化记忆
- **Chi, Feltovich & Glaser (1981)** — 专家与新手在物理问题表征上的差异

> 阅读经典论文的关键不是记住结论，而是理解研究者是如何提出问题和设计实验的。`,
    },
  ],
  '6': [
    {
      role: 'user',
      content: '机器学习入门需要哪些数学基础？',
    },
    {
      role: 'assistant',
      content: `机器学习的学习路径通常需要以下数学基础，按优先级排列：

## 核心数学领域

1. **线性代数**：矩阵运算、特征值分解、SVD——几乎所有 ML 算法的底层语言
2. **概率论与统计**：贝叶斯定理、最大似然估计、分布
3. **微积分**：梯度、偏导数、链式法则——理解反向传播的关键
4. **优化理论**：梯度下降、凸优化

## 学习建议

- 不必先学完所有数学再开始 ML
- 边学边补，遇到不懂的数学概念再回头查
- 用代码实现数学概念，加深理解

> 数学不是门槛，而是理解 ML 为何有效的语言。`,
    },
  ],
}

function saveThreadMessages(threadId: string) {
  dynamicThreadMessages[threadId] = messages.value.map(message => ({ ...message }))
  saveStoredValue(LOCAL_THREAD_MESSAGES_KEY, dynamicThreadMessages)
}

async function loadThreadMessages(threadId: string) {
  if (dynamicThreadMessages[threadId]) {
    messages.value = [...dynamicThreadMessages[threadId]]
  } else if (threadMessages[threadId]) {
    messages.value = [...threadMessages[threadId]]
  } else {
    messages.value = []
  }

  extractedNotes.value = []
  if (!vaultStore.vaultPath) return

  try {
    const sessionPath = getSessionFilePath(vaultStore.vaultPath, threadId)
    extractedNotes.value = extractNoteRefsFromSession(await readFile(sessionPath))
  } catch {
    extractedNotes.value = []
  }
}

watch(messages, () => {
  const threadId = route.query.thread
  if (typeof threadId === 'string' && threadId) {
    saveThreadMessages(threadId)
  }
}, { deep: true })

// 监听路由变化，切换会话内容
watch(
  () => route.query.thread,
  (newThreadId) => {
    if (newThreadId && typeof newThreadId === 'string') {
      loadThreadMessages(newThreadId)
    }
  },
  { immediate: true },
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

  messages.value.push({ role: 'user', content })

  const threadId = typeof route.query.thread === 'string' ? route.query.thread : ''
  if (!threadId) {
    error.value = '未找到当前会话'
    messages.value.pop()
    return
  }

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

    saveThreadMessages(threadId)
    streamingText.value = ''
    streamingThinking.value = ''
    toolStatus.value = ''
    await saveCurrentSession(threadId)
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
  return vaultStore.saveCurrentSession(session, false, extractedNotes.value)
}

async function handleExtractNote(highlightedText: string, domMessageIndex: number | null = null) {
  const config = settingsStore.getProviderConfig()
  if (!config.apiKey) {
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
    )
    const path = await noteStore.saveNote(vaultStore.vaultPath, note, sourceSession, highlightedText)
    if (!path) throw new Error('笔记保存失败')

    // 优先用划线时 DOM 定位的消息索引；文本匹配仅作回退（渲染文本与 markdown 源可能不一致）
    const messageIndex = resolveMessageIndex(highlightedText, messages.value, domMessageIndex, 'assistant')
    extractedNotes.value.push({ path, title: note.title, messageIndex })
    if (threadId) await saveCurrentSession(threadId)
    toast.success('已提炼并保存为原子笔记')
  } catch (e) {
    toast.error(e instanceof Error ? e.message : '笔记提炼失败')
  }
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

async function handleCreateBranch(highlightedText: string, domMessageIndex: number | null = null) {
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
  )

  if (!branchId) {
    toast.error('创建分支失败')
    return
  }

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