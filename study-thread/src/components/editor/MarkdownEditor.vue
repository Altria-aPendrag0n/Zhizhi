<template>
  <div class="markdown-editor">
    <div v-if="!readonly" class="editor-toolbar">
      <button
        v-for="tool in tools"
        :key="tool.label"
        class="tool-btn"
        :title="tool.label"
        @click="tool.action"
      >
        <component :is="tool.icon" :size="16" />
      </button>
    </div>
    <div ref="editorRef" class="editor-container"></div>
    <LinkHint
      v-if="showSuggestions"
      :suggestions="suggestions"
      @close="showSuggestions = false"
      @select="handleLinkSelect"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, onBeforeUnmount, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import {
  Decoration,
  EditorView,
  WidgetType,
  keymap,
  lineNumbers,
  drawSelection,
} from '@codemirror/view'
import { EditorState, type Extension, Compartment, StateField, type Range } from '@codemirror/state'
import { autocompletion } from '@codemirror/autocomplete'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { createWikiLinkCompletionSource } from './wikilinkAutocomplete'
import { languages } from '@codemirror/language-data'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import {
  Bold,
  Italic,
  Heading,
  List,
  Quote,
  Code2,
} from '@lucide/vue'
import LinkHint from './LinkHint.vue'
import type { LinkSuggestion } from '../../embedding/linker'
import { NoteLinker } from '../../embedding/linker'
import { getNoteIndexer } from '../../embedding/indexer'
import { getEmbeddingEngine } from '../../embedding/engine'
import { parseWikiLinks, resolveWikiLinkTarget } from '../../parser/wikilink'
import { useNoteStore } from '../../stores/notes'

const props = defineProps<{
  modelValue: string
  readonly?: boolean
  /** 当前笔记路径（补全时排除自身） */
  currentNotePath?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const router = useRouter()
const noteStore = useNoteStore()

const editorRef = ref<HTMLDivElement>()
let editorView: EditorView | null = null
const editableCompartment = new Compartment()

const showSuggestions = ref(false)
const suggestions = ref<LinkSuggestion[]>([])
let linkDebounceTimer: ReturnType<typeof setTimeout> | null = null
const linker = new NoteLinker(getNoteIndexer(), getEmbeddingEngine())

const tools = [
  { label: '加粗', icon: Bold, action: () => wrapSelection('**', '**') },
  { label: '斜体', icon: Italic, action: () => wrapSelection('*', '*') },
  { label: '标题', icon: Heading, action: () => prefixLine('## ') },
  { label: '列表', icon: List, action: () => prefixLine('- ') },
  { label: '引用', icon: Quote, action: () => prefixLine('> ') },
  { label: '代码块', icon: Code2, action: () => wrapSelection('\n```\n', '\n```\n') },
]

// ---------- Markdown 行渲染（非光标行的预览） ----------

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character] || character))
}

function renderText(value: string) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
    .replace(/(?<!_)_([^_]+)_(?!_)/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
}

function renderInline(value: string) {
  const wikiLinkPattern = /\[\[([^\]|#]+)(?:[|#]([^\]]+))?\]\]/g
  let html = ''
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = wikiLinkPattern.exec(value)) !== null) {
    html += renderText(value.slice(cursor, match.index))
    const target = match[1].trim()
    const label = (match[2] || target).trim()
    const resolvedPath = resolveWikiLinkTarget({ target }, noteStore.notes)?.path
    const className = resolvedPath ? 'wikilink wikilink--resolved' : 'wikilink wikilink--unresolved'
    const dataPath = resolvedPath ? ` data-path="${escapeHtml(resolvedPath)}"` : ''
    html += `<a class="${className}"${dataPath}>${escapeHtml(label)}</a>`
    cursor = match.index + match[0].length
  }

  return html + renderText(value.slice(cursor))
}

function renderMarkdownLine(line: string) {
  if (!line.trim()) return '<br>'

  const heading = line.match(/^(#{1,6})\s+(.+)$/)
  if (heading) {
    const level = heading[1].length
    return `<h${level}>${renderInline(heading[2])}</h${level}>`
  }

  const quote = line.match(/^>\s?(.*)$/)
  if (quote) return `<blockquote>${renderInline(quote[1])}</blockquote>`

  const unordered = line.match(/^[-*+]\s+(.+)$/)
  if (unordered) return `<div class="markdown-list-item"><span>•</span>${renderInline(unordered[1])}</div>`

  const ordered = line.match(/^(\d+)\.\s+(.+)$/)
  if (ordered) return `<div class="markdown-list-item"><span>${ordered[1]}.</span>${renderInline(ordered[2])}</div>`

  if (/^```/.test(line)) return `<pre><code>${escapeHtml(line)}</code></pre>`

  return `<p>${renderInline(line)}</p>`
}

class MarkdownLineWidget extends WidgetType {
  constructor(
    private readonly line: string,
    private readonly position: number,
  ) {
    super()
  }

  eq(other: MarkdownLineWidget) {
    return this.line === other.line && this.position === other.position
  }

  ignoreEvent() {
    return false
  }

  toDOM() {
    const element = document.createElement('div')
    element.className = 'cm-live-preview-line'
    element.dataset.position = String(this.position)
    element.dataset.highlightable = 'true'
    element.innerHTML = renderMarkdownLine(this.line)
    return element
  }
}

function buildPreviewDecorations(state: EditorState) {
  const activeLine = state.doc.lineAt(state.selection.main.head).number
  const decorations: Range<Decoration>[] = []

  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    if (lineNumber === activeLine) continue
    const line = state.doc.line(lineNumber)
    decorations.push(Decoration.replace({ widget: new MarkdownLineWidget(line.text, line.from), block: true }).range(line.from, line.to))
  }

  return Decoration.set(decorations, true)
}

const livePreviewField = StateField.define({
  create: buildPreviewDecorations,
  update: (decorations, transaction) => {
    if (transaction.docChanged || transaction.selection) return buildPreviewDecorations(transaction.state)
    return decorations
  },
  provide: (field) => EditorView.decorations.from(field),
})

// ---------- 源码行内 wikilink 样式 ----------

function buildWikiLinkDecorations(state: EditorState) {
  const decorations: Range<Decoration>[] = []

  for (const wikiLink of parseWikiLinks(state.doc.toString())) {
    const resolved = resolveWikiLinkTarget(wikiLink, noteStore.notes)
    const className = resolved ? 'cm-wikilink cm-wikilink--resolved' : 'cm-wikilink cm-wikilink--unresolved'
    decorations.push(Decoration.mark({ class: className }).range(wikiLink.start, wikiLink.end))
  }

  return Decoration.set(decorations, true)
}

const wikiLinkField = StateField.define({
  create: buildWikiLinkDecorations,
  update: (decorations, transaction) => transaction.docChanged ? buildWikiLinkDecorations(transaction.state) : decorations,
  provide: (field) => EditorView.decorations.from(field),
})

// ---------- 工具栏 ----------

function wrapSelection(before: string, after: string) {
  if (!editorView) return
  const { from, to } = editorView.state.selection.main
  const selected = editorView.state.sliceDoc(from, to)
  editorView.dispatch({
    changes: { from, to, insert: `${before}${selected}${after}` },
    selection: { anchor: from + before.length, head: from + before.length + selected.length },
  })
  editorView.focus()
}

function prefixLine(prefix: string) {
  if (!editorView) return
  const { from } = editorView.state.selection.main
  const line = editorView.state.doc.lineAt(from)
  editorView.dispatch({ changes: { from: line.from, insert: prefix } })
  editorView.focus()
}

function handleLinkSelect(item: LinkSuggestion) {
  if (!editorView) return
  const { from } = editorView.state.selection.main
  const linkText = `[[${item.title}]]`
  editorView.dispatch({
    changes: { from, insert: linkText },
    selection: { anchor: from + linkText.length, head: from + linkText.length },
  })
  editorView.focus()
  showSuggestions.value = false
}

function triggerLinkSuggestions() {
  if (!editorView) return
  if (linkDebounceTimer) clearTimeout(linkDebounceTimer)

  linkDebounceTimer = setTimeout(async () => {
    if (!editorView) return
    const { from } = editorView.state.selection.main
    // 光标处于未闭合的 [[ 之后时，由 [[ 补全接管，不触发语义检索
    const line = editorView.state.doc.lineAt(from)
    const beforeCursor = line.text.slice(0, from - line.from)
    if (/\[\[[^\[\]]*$/.test(beforeCursor)) {
      showSuggestions.value = false
      return
    }
    const paragraphText = editorView.state.doc.lineAt(from).text.trim()
    if (paragraphText.length < 10) {
      showSuggestions.value = false
      return
    }
    const result = await linker.suggestLinks('', paragraphText, 5)
    suggestions.value = result
    showSuggestions.value = result.length > 0
  }, 500)
}

// ---------- 鼠标交互 ----------

function handleMouseDown(event: MouseEvent) {
  if (!(event.target instanceof Element) || !editorView) return false

  // 预览行内的已解析 wikilink → 跳转
  const previewLink = event.target.closest<HTMLAnchorElement>('a.wikilink[data-path]')
  if (previewLink?.dataset.path) {
    event.preventDefault()
    router.push(`/notes/${encodeURIComponent(previewLink.dataset.path)}`)
    return true
  }

  // 源码行内的已解析 wikilink → 跳转
  if (event.target.closest('.cm-wikilink--resolved')) {
    const position = editorView.posAtDOM(event.target, 0)
    const wikiLink = parseWikiLinks(editorView.state.doc.toString()).find((link) => link.start <= position && position < link.end)
    const resolved = wikiLink && resolveWikiLinkTarget(wikiLink, noteStore.notes)
    if (resolved) {
      event.preventDefault()
      router.push(`/notes/${encodeURIComponent(resolved.path)}`)
      return true
    }
  }

  // 预览行 → 将该行切换为源码并把光标定位到该行
  const previewLine = event.target.closest<HTMLElement>('.cm-live-preview-line')
  const position = previewLine?.dataset.position
  if (previewLine && position !== undefined) {
    event.preventDefault()
    editorView.dispatch({ selection: { anchor: Number(position) }, scrollIntoView: true })
    editorView.focus()
    return true
  }

  return false
}

// ---------- 编辑器创建 ----------

const customTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '14px',
    fontFamily: '"HarmonyOS Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
    color: 'var(--ink, #19312b)',
    backgroundColor: 'transparent',
  },
  '.cm-content': { padding: '16px', lineHeight: '1.8', caretColor: 'var(--brand, #245c4d)' },
  '.cm-selectionBackground': { backgroundColor: 'var(--brand-soft, rgba(220, 233, 225, 0.6))' },
  '.cm-gutters': {
    border: 'none',
    backgroundColor: 'transparent',
    color: 'var(--ink-3, #87928d)',
    fontSize: '12px',
  },
  '&.cm-focused .cm-cursor': { borderLeftColor: 'var(--brand, #245c4d)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-matchingBracket': { backgroundColor: 'var(--brand-soft, rgba(220, 233, 225, 0.4))' },
  '.cm-tooltip.cm-tooltip-autocomplete': {
    border: '1px solid var(--line, #e2e8e4)',
    borderRadius: '10px',
    boxShadow: '0 6px 24px rgba(0, 0, 0, 0.10)',
    overflow: 'hidden',
  },
  '.cm-tooltip-autocomplete ul li[aria-selected]': {
    backgroundColor: 'var(--brand-soft, rgba(220, 233, 225, 0.6))',
    color: 'var(--brand, #245c4d)',
  },
  '.cm-tooltip-autocomplete ul li': {
    padding: '3px 8px',
    fontFamily: '"HarmonyOS Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
  },
  '.cm-completionDetail': { fontStyle: 'normal', color: 'var(--ink-3, #87928d)', fontSize: '11px' },
})

function createEditor() {
  if (!editorRef.value) return

  const extensions: Extension[] = [
    lineNumbers(),
    drawSelection(),
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    markdown({ base: markdownLanguage, codeLanguages: languages }),
    syntaxHighlighting(defaultHighlightStyle),
    EditorView.lineWrapping,
    autocompletion({
      activateOnTyping: true,
      override: [createWikiLinkCompletionSource(noteStore.notes, props.currentNotePath)],
    }),
    livePreviewField,
    wikiLinkField,
    EditorView.domEventHandlers({
      mousedown: handleMouseDown,
    }),
    customTheme,
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        emit('update:modelValue', update.state.doc.toString())
        triggerLinkSuggestions()
      }
    }),
    editableCompartment.of(EditorView.editable.of(!props.readonly)),
  ]

  editorView = new EditorView({
    state: EditorState.create({ doc: props.modelValue, extensions }),
    parent: editorRef.value,
  })
}

function updateContent(value: string) {
  if (!editorView) return
  const currentValue = editorView.state.doc.toString()
  if (value !== currentValue) {
    editorView.dispatch({ changes: { from: 0, to: currentValue.length, insert: value } })
  }
}

watch(() => props.modelValue, updateContent)

watch(() => props.readonly, (value) => {
  editorView?.dispatch({ effects: editableCompartment.reconfigure(EditorView.editable.of(!value)) })
})

onMounted(async () => {
  await nextTick()
  createEditor()
})

onBeforeUnmount(() => {
  editorView?.destroy()
  editorView = null
  if (linkDebounceTimer) clearTimeout(linkDebounceTimer)
})
</script>

<style scoped>
.markdown-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  border: 1px solid var(--line);
  border-radius: 12px;
  overflow: hidden;
  background: var(--surface);
}

.editor-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--line);
  background: var(--surface-2);
}

.tool-btn {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--ink-2);
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s;
}

.tool-btn:hover {
  background: var(--brand-soft);
  color: var(--brand);
}

.editor-container {
  flex: 1;
  overflow: auto;
  min-height: 300px;
}

:deep(.cm-live-preview-line) {
  min-height: 1.8em;
}

:deep(.cm-live-preview-line p),
:deep(.cm-live-preview-line h1),
:deep(.cm-live-preview-line h2),
:deep(.cm-live-preview-line h3),
:deep(.cm-live-preview-line h4),
:deep(.cm-live-preview-line h5),
:deep(.cm-live-preview-line h6),
:deep(.cm-live-preview-line blockquote),
:deep(.cm-live-preview-line pre) {
  margin: 0;
  line-height: 1.8;
}

:deep(.cm-live-preview-line h1) { font-size: 1.65em; }
:deep(.cm-live-preview-line h2) { font-size: 1.4em; }
:deep(.cm-live-preview-line h3) { font-size: 1.2em; }
:deep(.cm-live-preview-line blockquote) {
  padding-left: 12px;
  border-left: 3px solid var(--brand-soft);
  color: var(--ink-2);
}
:deep(.cm-live-preview-line code) {
  padding: 2px 5px;
  border-radius: 4px;
  background: var(--surface-2);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
:deep(.markdown-list-item) { display: flex; gap: 8px; }
:deep(.wikilink--resolved) { color: var(--brand); font-weight: 650; text-decoration: none; cursor: pointer; }
:deep(.wikilink--unresolved) { color: var(--ink-3); border-bottom: 1px dashed currentColor; }
:deep(.cm-wikilink) { font-weight: 650; }
:deep(.cm-wikilink--resolved) { color: var(--brand); cursor: pointer; }
:deep(.cm-wikilink--resolved:hover) { text-decoration: underline; }
:deep(.cm-wikilink--unresolved) { color: var(--ink-3); border-bottom: 1px dashed currentColor; }
</style>
