<template>
  <div class="chat-message" :class="`chat-message--${message.role}`">
    <!-- 用户消息 -->
    <template v-if="message.role === 'user'">
      <div class="chat-message__prompt">
        <span class="chat-message__avatar--user">你</span>
        <div>
          <b>提问</b>
          <br>
          <span class="chat-message__text">{{ message.content }}</span>
        </div>
      </div>
    </template>

    <!-- AI 消息 -->
    <template v-else-if="message.role === 'assistant'">
      <div class="chat-message__answer">
        <p class="chat-message__label">知枝 · 学习伴读</p>
        <ThinkingBlock v-if="message.thinking" :text="message.thinking" />
        <div ref="bodyRef" class="chat-message__body" data-highlightable="true" v-html="renderedContent" @click="handleBodyClick" />
        <div v-if="noteCount > 0" class="chat-message__source">
          <span class="chat-message__source-dot"></span>
          本次回答已生成 {{ noteCount }} 张原子笔记
        </div>
      </div>
    </template>

    <!-- System 消息 -->
    <template v-else>
      <div class="chat-message__system">
        <span>{{ message.content }}</span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted } from 'vue'
import { marked } from 'marked'
import type { Message } from '../../types'
import type { NoteReference } from '../../utils/session-linker'
import { wrapHighlightInDOM, unwrapHighlight, isTableHighlight, wrapTableInDOM } from '../../utils/highlight-dom'
import { preprocessMarkdownForRendering } from '../../utils/markdown-preprocess'
import ThinkingBlock from './ThinkingBlock.vue'

const props = defineProps<{
  message: Message
  noteCount?: number
  /** 该消息上的划线标记（笔记/分支，含划线文本），用于在原消息中渲染虚线跳转链接 */
  marks?: NoteReference[]
}>()

const emit = defineEmits<{
  'navigate-link': [payload: { kind: 'note' | 'branch'; id: string }]
}>()

const noteCount = computed(() => props.noteCount ?? 0)
const bodyRef = ref<HTMLElement | null>(null)

const renderedContent = computed(() => {
  return marked(preprocessMarkdownForRendering(props.message.content), {
    breaks: true,
    gfm: true,
  }) as string
})

/**
 * 在渲染后的 DOM 上把划线文本包裹为虚线跳转链接。
 *
 * 不能直接在 markdown 源中插入标签：当划线文本位于 `**加粗**` / `*斜体*` 等
 * 行内标记内部时，marked 无法让 delimiter 跨 HTML 标签配对，加粗等语法会被破坏
 * （`**` 变成字面文本）。因此先由 marked 渲染出完整 HTML，再借助
 * `wrapHighlightInDOM`（拼接全部文本节点定位起止区间，跨节点切分合并）把划线
 * 文本包进 `<a class="zhizhi-mark">`——划线文本位于单个文本节点内、或跨加粗/斜体
 * 边界（如用户划选了 `名字——**"富贵虾"**` 的视觉范围）都能正确显示虚线。
 */
function applyMarkLinks() {
  const body = bodyRef.value
  if (!body) return
  // 先清除上一次的标记（unwrap），保证幂等
  unwrapHighlight(body, 'a', 'zhizhi-mark')

  for (const mark of props.marks || []) {
    if (!mark.highlight) continue
    const highlight = mark.highlight.replace(/\s+/g, ' ')
    if (!highlight) continue
    const kind = mark.kind === 'branch' ? 'branch' : 'note'
    let wrapper: HTMLElement | null
    if (isTableHighlight(mark.highlight)) {
      // 表格划线：划线文本为整张表格 Markdown 源码，渲染 DOM 文本无法定位，
      // 整表包裹为可点击虚线链接（不拆分内部节点，避免破坏表格结构）
      wrapper = wrapTableInDOM(body, 'a', 'zhizhi-mark')
    } else {
      // 重复文本出现多次时按出现序号定位到用户实际划的位置（occurrence 缺省第 1 处）
      wrapper = wrapHighlightInDOM(body, highlight, 'a', 'zhizhi-mark', mark.occurrence ?? 1)
    }
    if (!wrapper) continue
    wrapper.dataset.zhizhiKind = kind
    wrapper.dataset.zhizhiId = kind === 'branch' ? mark.path : encodeURIComponent(mark.path)
  }
}

// v-html 更新后（nextTick）在 DOM 上应用划线标记。
// onMounted 兜底保证首次挂载后一定执行（此时 bodyRef 与 v-html 内容均已就绪）；
// watch 处理内容或划线引用后续变化。applyMarkLinks 内部对 bodyRef 空值做了守卫，幂等。
function scheduleApplyMarkLinks() {
  nextTick().then(applyMarkLinks)
}

onMounted(scheduleApplyMarkLinks)
watch(
  [renderedContent, () => props.marks],
  scheduleApplyMarkLinks,
  { immediate: true },
)

function handleBodyClick(event: MouseEvent) {
  const anchor = (event.target as Element).closest?.<HTMLAnchorElement>('a.zhizhi-mark')
  if (!anchor) return
  event.preventDefault()
  const kind = anchor.dataset.zhizhiKind
  let id = anchor.dataset.zhizhiId || ''
  try {
    id = decodeURIComponent(id)
  } catch {
    // 无效的编码序列时保持原样
  }
  if ((kind === 'note' || kind === 'branch') && id) {
    emit('navigate-link', { kind, id })
  }
}
</script>

<style scoped>
.chat-message {
  padding: 0;
}

.chat-message--system {
  text-align: center;
  padding: 4px 0;
}

.chat-message__system span {
  font-size: 12px;
  color: var(--ink-2);
}

/* 用户消息 —— 提示框风格 */
.chat-message__prompt {
  display: flex;
  gap: 12px;
  margin: 0 0 35px;
  padding: 15px 17px;
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  background: #eae4d6;
  color: var(--ink);
  font-size: 15px;
  line-height: 1.7;
}

.chat-message__prompt b {
  color: var(--brand);
}

.chat-message__avatar--user {
  flex: 0 0 28px;
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: #fff;
  font-family: Georgia, 'Songti SC', serif;
  background: var(--brand);
  font-size: 13px;
}

.chat-message__text {
  font-size: 15px;
  line-height: 1.7;
  white-space: pre-wrap;
}

/* AI 消息 —— 左侧边线风格 */
.chat-message__answer {
  padding: 4px 0 0 40px;
  border-left: 1px solid var(--line);
}

.chat-message__label {
  margin: 0 0 18px;
  color: var(--ink-2);
  font-size: 12px;
  font-weight: 700;
}

.chat-message__body {
  font-size: 15px;
  line-height: 1.9;
  color: var(--ink);
}

.chat-message__body :deep(h2) {
  margin: 30px 0 12px;
  font-family: Georgia, 'Songti SC', serif;
  font-size: 23px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.chat-message__body :deep(h3) {
  margin: 24px 0 10px;
  font-family: Georgia, 'Songti SC', serif;
  font-size: 19px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.chat-message__body :deep(p) {
  margin: 0 0 16px;
  font-size: 15px;
  line-height: 1.9;
}

.chat-message__body :deep(ol) {
  margin: 10px 0 19px;
  padding-left: 22px;
}

.chat-message__body :deep(li) {
  padding-left: 8px;
  margin: 8px 0;
  font-size: 15px;
  line-height: 1.75;
}

.chat-message__body :deep(strong) {
  color: var(--brand-strong);
  font-weight: 650;
}

/* 复习判定徽章（P5-6）：AI 反馈消息首行的正误判定，随消息流渲染在该题下、下一道题前 */
.chat-message__body :deep(.review-verdict) {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 16px;
  padding: 8px 12px;
  border-radius: var(--r-md);
  font-size: 12px;
}

.chat-message__body :deep(.review-verdict b) {
  flex-shrink: 0;
  padding: 2px 10px;
  border-radius: 999px;
  color: #fff;
  font-size: 12px;
  font-weight: 650;
}

.chat-message__body :deep(.review-verdict span) {
  color: var(--ink-2);
  font-size: 11px;
}

.chat-message__body :deep(.review-verdict.is-correct) {
  background: color-mix(in srgb, var(--state-success) 10%, transparent);
}

.chat-message__body :deep(.review-verdict.is-correct b) {
  background: var(--state-success);
}

.chat-message__body :deep(.review-verdict.is-partial) {
  background: color-mix(in srgb, var(--state-warning) 12%, transparent);
}

.chat-message__body :deep(.review-verdict.is-partial b) {
  background: var(--state-warning);
}

.chat-message__body :deep(.review-verdict.is-wrong) {
  background: color-mix(in srgb, var(--state-error) 10%, transparent);
}

.chat-message__body :deep(.review-verdict.is-wrong b) {
  background: var(--state-error);
}

.chat-message__body :deep(blockquote) {
  margin: 24px 0;
  padding: 17px 19px;
  border-left: 3px solid var(--brand);
  background: var(--brand-soft);
  border-radius: 0 var(--r-md) var(--r-md) 0;
  color: var(--brand-strong);
  font-family: Georgia, 'Songti SC', serif;
  font-size: 18px;
  line-height: 1.65;
  font-style: normal;
}

/* 表格：格子间留出间距，独立圆角边框，便于分辨 */
.chat-message__body :deep(table) {
  width: 100%;
  margin: 18px 0;
  border-collapse: separate;
  border-spacing: 4px;
  font-size: 14px;
  line-height: 1.7;
}

.chat-message__body :deep(th),
.chat-message__body :deep(td) {
  padding: 10px 13px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
  text-align: left;
  vertical-align: top;
}

.chat-message__body :deep(th) {
  background: var(--surface-2);
  font-weight: 650;
  color: var(--ink);
  white-space: nowrap;
}

.chat-message__body :deep(.selectable) {
  position: relative;
  padding: 1px 3px 2px;
  color: var(--brand-strong);
  font-weight: 650;
  text-decoration: underline;
  text-decoration-color: rgba(36, 92, 77, 0.55);
  text-decoration-thickness: 2px;
  text-underline-offset: 4px;
  background: linear-gradient(transparent 62%, var(--brand-soft) 0);
  border-radius: 2px;
  cursor: text;
}

.chat-message__body :deep(a) {
  color: var(--brand);
  text-decoration: underline;
  text-underline-offset: 3px;
  transition: color 0.15s;
}

/* 划线标记链接：虚线标明原会话中的划线位置 */
.chat-message__body :deep(a.zhizhi-mark) {
  color: var(--brand-strong);
  font-weight: 650;
  text-decoration: underline dotted;
  text-decoration-color: var(--brand);
  text-decoration-thickness: 2px;
  text-underline-offset: 3px;
  cursor: pointer;
}

.chat-message__body :deep(a.zhizhi-mark:hover) {
  color: var(--brand);
}

.chat-message__body :deep(a:hover) {
  color: var(--brand-strong);
}

.chat-message__body :deep(code) {
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 13px;
  background: var(--surface-2);
  padding: 2px 6px;
  border-radius: 4px;
}

.chat-message__body :deep(pre) {
  background: #f6f4ed;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  padding: 14px 16px;
  overflow-x: auto;
  font-size: 13px;
  line-height: 1.6;
}

.chat-message__body :deep(pre code) {
  background: transparent;
  padding: 0;
}

.chat-message__source {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: 28px;
  color: var(--ink-2);
  font-size: 12px;
}

.chat-message__source-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--brand);
  flex-shrink: 0;
}
</style>