<template>
  <div class="chat-view" ref="containerRef" @mouseup="handleMouseUp">
    <!-- 空状态 -->
    <div v-if="!messages.length && !isStreaming" class="chat-view__empty">
      <div class="chat-view__eyebrow">Conceptual study</div>
      <h1 class="chat-view__hero-title">把「费曼学习法」从口诀变成一次真的理解</h1>
      <p class="chat-view__hero-desc">
        向知枝提问，或粘贴一段想要拆解的概念
      </p>
    </div>

    <!-- 对话区域 -->
    <div v-else class="chat-view__conversation">
      <div class="chat-view__eyebrow">Conceptual study</div>
      <div v-for="(msg, index) in displayMessages" :key="index" :data-message-index="index">
        <ChatMessage
          :message="msg"
          :note-count="getNoteCountForMessage(index)"
          :marks="getMarksForMessage(index)"
          @navigate-link="handleNavigateLink"
        />
        <div v-if="getNotesForMessage(index).length > 0" class="chat-view__note-refs">
          <span class="note-refs-label">已生成笔记：</span>
          <button
            v-for="ref in getNotesForMessage(index)"
            :key="ref.path"
            class="note-ref-link"
            @click="emit('navigate-note', ref.path)"
          >
            [[{{ ref.title }}]]
          </button>
        </div>
      </div>

      <!-- 流式文本 -->
      <div v-if="isStreaming" class="chat-view__streaming">
        <div class="chat-view__streaming-answer">
          <div v-if="streamingToolStatus" class="chat-view__tool-status">
            <span class="tool-status__dot"></span>
            {{ streamingToolStatus }}
          </div>
          <ThinkingBlock v-if="streamingThinking" :text="streamingThinking" start-expanded />
          <StreamText :text="streamingText" :is-streaming="isStreaming" />
        </div>
      </div>
    </div>

    <!-- 错误提示 -->
    <div v-if="error" class="chat-view__error">
      <AlertCircle :size="16" />
      <span>{{ error }}</span>
      <button class="chat-view__retry-btn" @click="$emit('retry')">重试</button>
    </div>

    <!-- 划线浮动菜单 -->
    <HighlightMenu
      :visible="highlightMenu.visible"
      :x="highlightMenu.x"
      :y="highlightMenu.y"
      :highlighted-text="highlightMenu.text"
      :message-index="highlightMenu.messageIndex"
      show-add-to-note
      @close="closeHighlightMenu"
      @extract-note="handleExtractNote"
      @add-to-note="handleAddToNote"
      @create-branch="handleCreateBranch"
      @copy="handleCopy"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, reactive, computed } from 'vue'
import { AlertCircle } from '@lucide/vue'
import type { Message } from '../../types'
import type { NoteReference } from '../../utils/session-linker'
import ChatMessage from './ChatMessage.vue'
import StreamText from './StreamText.vue'
import ThinkingBlock from './ThinkingBlock.vue'
import HighlightMenu from './HighlightMenu.vue'

const props = defineProps<{
  messages: Message[]
  isStreaming: boolean
  streamingText: string
  /** 流式期间的思考过程文本 */
  streamingThinking?: string
  /** 流式期间的工具调用状态提示（如"正在查阅参考资料"） */
  streamingToolStatus?: string
  error: string | null
  noteRefs?: NoteReference[]
}>()

const emit = defineEmits<{
  retry: []
  'extract-note': [text: string, messageIndex: number | null]
  'add-to-note': [text: string]
  'create-branch': [text: string, messageIndex: number | null]
  'navigate-note': [path: string]
  'navigate-branch': [branchId: string]
}>()

const containerRef = ref<HTMLElement | null>(null)

// 流式期间隐藏最后一条空的 assistant 占位消息（由流式区域负责显示）
const displayMessages = computed(() => {
  if (!props.isStreaming) return props.messages
  const msgs = props.messages
  if (msgs.length > 0 && msgs[msgs.length - 1].role === 'assistant' && !msgs[msgs.length - 1].content) {
    return msgs.slice(0, -1)
  }
  return msgs
})

const highlightMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  text: '',
  /** 划线所在的消息索引（DOM 定位）；无则为 null */
  messageIndex: null as number | null,
})

/** 从选区祖先节点向上查找最近的消息容器，读取 data-message-index */
function findHighlightMessageIndex(ancestor: Node): number | null {
  const el = ancestor.nodeType === Node.ELEMENT_NODE
    ? (ancestor as Element)
    : ancestor.parentElement
  const messageEl = el?.closest('[data-message-index]')
  if (!messageEl) return null
  const raw = messageEl.getAttribute('data-message-index')
  if (raw === null) return null
  const value = Number(raw)
  return Number.isNaN(value) ? null : value
}

function handleMouseUp() {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    closeHighlightMenu()
    return
  }

  const text = selection.toString().trim()
  if (!text) {
    closeHighlightMenu()
    return
  }

  const range = selection.getRangeAt(0)
  const ancestor = range.commonAncestorContainer
  const highlightableEl = (ancestor.nodeType === Node.ELEMENT_NODE
    ? ancestor as Element
    : ancestor.parentElement)?.closest('[data-highlightable="true"]')
  if (!highlightableEl || !containerRef.value?.contains(highlightableEl)) {
    closeHighlightMenu()
    return
  }

  const rect = range.getBoundingClientRect()
  highlightMenu.x = rect.left + rect.width / 2
  highlightMenu.y = rect.top
  highlightMenu.text = text
  highlightMenu.messageIndex = findHighlightMessageIndex(ancestor)
  highlightMenu.visible = true
}
function closeHighlightMenu() {
  highlightMenu.visible = false
  highlightMenu.text = ''
  highlightMenu.messageIndex = null
  window.getSelection()?.removeAllRanges()
}

function handleExtractNote(text: string, messageIndex: number | null) {
  emit('extract-note', text, messageIndex)
}

function handleAddToNote(text: string) {
  emit('add-to-note', text)
}

function handleCreateBranch(text: string, messageIndex: number | null) {
  emit('create-branch', text, messageIndex)
}

function handleCopy(_text: string) {}

function handleNavigateLink(payload: { kind: 'note' | 'branch'; id: string }) {
  if (payload.kind === 'note') emit('navigate-note', payload.id)
  else emit('navigate-branch', payload.id)
}

function getNotesForMessage(messageIndex: number): NoteReference[] {
  // 仅笔记显示在"已生成笔记"按钮区；分支引用通过消息内划线链接跳转
  return (props.noteRefs || []).filter((ref) => ref.messageIndex === messageIndex && ref.kind !== 'branch')
}

function getMarksForMessage(messageIndex: number): NoteReference[] {
  return (props.noteRefs || []).filter((ref) => ref.messageIndex === messageIndex && !!ref.highlight)
}

function getNoteCountForMessage(messageIndex: number): number {
  return getNotesForMessage(messageIndex).length
}

// 自动滚动
watch(
  () => [props.messages.length, props.streamingText, props.isStreaming],
  async () => {
    await nextTick()
    if (containerRef.value) {
      containerRef.value.scrollTop = containerRef.value.scrollHeight
    }
  },
  { deep: true },
)
</script>

<style scoped>
.chat-view {
  flex: 1;
  overflow-y: auto;
  padding: 50px max(48px, 8vw) 152px;
  background: var(--surface);
}

/* 空状态 */
.chat-view__empty {
  display: flex;
  flex-direction: column;
  justify-content: center;
  height: 100%;
  width: min(760px, 100%);
  margin: 0 auto;
}

.chat-view__eyebrow {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 17px;
  color: var(--brand);
  font-size: 11px;
  font-weight: 750;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.chat-view__eyebrow::before {
  width: 22px;
  height: 1px;
  content: '';
  background: var(--brand);
  flex-shrink: 0;
}

.chat-view__hero-title {
  max-width: 610px;
  margin: 0 0 25px;
  font-family: Georgia, 'Songti SC', serif;
  font-size: 36px;
  font-weight: 600;
  letter-spacing: -0.04em;
  line-height: 1.16;
  color: var(--ink);
}

.chat-view__hero-desc {
  max-width: 500px;
  color: var(--ink-2);
  font-size: 14px;
  line-height: 1.7;
}

/* 对话区域 */
.chat-view__conversation {
  width: min(760px, 100%);
  margin: 0 auto;
}

/* 流式文本 */
.chat-view__streaming-answer {
  padding: 4px 0 0 40px;
  border-left: 1px solid var(--line);
}

/* 工具调用状态 */
.chat-view__tool-status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  padding: 6px 12px;
  border-radius: 999px;
  background: var(--brand-soft);
  color: var(--brand);
  font-size: 12px;
  font-weight: 590;
}

.tool-status__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--brand);
  animation: tool-status-pulse 1.2s ease-in-out infinite;
}

@keyframes tool-status-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}

/* 错误 */
.chat-view__error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  margin: 0 auto;
  width: min(760px, 100%);
  border-radius: 8px;
  background: color-mix(in srgb, var(--state-error) 10%, transparent);
  color: var(--state-error);
}

.chat-view__retry-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 12px;
  border: 0;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 590;
  cursor: pointer;
  color: var(--ink);
  background: var(--surface-2);
  transition: background 0.15s;
}

.chat-view__retry-btn:hover {
  background: var(--line);
}

/* 笔记反链 */
.chat-view__note-refs {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  padding: 6px 0 6px 44px;
  font-size: 12px;
}

.note-refs-label {
  color: var(--ink-2);
}

.note-ref-link {
  border: none;
  background: var(--brand-soft);
  color: var(--brand);
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: background 0.18s, color 0.18s;
}

.note-ref-link:hover {
  background: var(--brand);
  color: #fff;
}

@media (max-width: 1100px) {
  .chat-view {
    padding: 38px 38px 152px;
  }
}
</style>