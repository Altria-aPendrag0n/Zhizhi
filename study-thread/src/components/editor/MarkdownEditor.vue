<template>
  <div class="markdown-editor" ref="containerRef">
    <!-- 工具栏 -->
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
    <!-- CodeMirror 容器 -->
    <div ref="editorRef" class="editor-container"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, onBeforeUnmount, nextTick } from 'vue'
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  drawSelection,
} from '@codemirror/view'
import { EditorState, type Extension, Compartment } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
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

const props = defineProps<{
  modelValue: string
  readonly?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const containerRef = ref<HTMLDivElement>()
const editorRef = ref<HTMLDivElement>()
let editorView: EditorView | null = null
const editableCompartment = new Compartment()

// 工具栏按钮
const tools = [
  {
    label: '加粗',
    icon: Bold,
    action: () => wrapSelection('**', '**'),
  },
  {
    label: '斜体',
    icon: Italic,
    action: () => wrapSelection('*', '*'),
  },
  {
    label: '标题',
    icon: Heading,
    action: () => prefixLine('## '),
  },
  {
    label: '列表',
    icon: List,
    action: () => prefixLine('- '),
  },
  {
    label: '引用',
    icon: Quote,
    action: () => prefixLine('> '),
  },
  {
    label: '代码块',
    icon: Code2,
    action: () => wrapSelection('\n```\n', '\n```\n'),
  },
]

/**
 * 在选区前后包裹文本
 */
function wrapSelection(before: string, after: string) {
  if (!editorView) return
  const { from, to } = editorView.state.selection.main
  const selected = editorView.state.sliceDoc(from, to)
  editorView.dispatch({
    changes: {
      from,
      to,
      insert: `${before}${selected}${after}`,
    },
    selection: {
      anchor: from + before.length,
      head: from + before.length + selected.length,
    },
  })
  editorView.focus()
}

/**
 * 在选中行前添加前缀
 */
function prefixLine(prefix: string) {
  if (!editorView) return
  const { from } = editorView.state.selection.main
  const line = editorView.state.doc.lineAt(from)
  editorView.dispatch({
    changes: {
      from: line.from,
      insert: prefix,
    },
  })
  editorView.focus()
}

/**
 * 自定义高亮样式（匹配设计 Token）
 */
const customTheme = EditorView.theme(
  {
    '&': {
      height: '100%',
      fontSize: '14px',
      fontFamily:
        '"HarmonyOS Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
      color: 'var(--ink, #19312b)',
      backgroundColor: 'transparent',
    },
    '.cm-content': {
      padding: '16px',
      lineHeight: '1.8',
      caretColor: 'var(--brand, #245c4d)',
    },
    '.cm-activeLine': {
      backgroundColor: 'var(--surface-2, rgba(237, 240, 233, 0.4))',
    },
    '.cm-selectionBackground': {
      backgroundColor: 'var(--brand-soft, rgba(220, 233, 225, 0.6))',
    },
    '.cm-gutters': {
      border: 'none',
      backgroundColor: 'transparent',
      color: 'var(--ink-3, #87928d)',
      fontSize: '12px',
    },
    '&.cm-focused .cm-cursor': {
      borderLeftColor: 'var(--brand, #245c4d)',
    },
    '&.cm-focused': {
      outline: 'none',
    },
    '.cm-matchingBracket': {
      backgroundColor: 'var(--brand-soft, rgba(220, 233, 225, 0.4))',
    },
  },
  { dark: false },
)

function createEditor() {
  if (!editorRef.value) return

  const extensions: Extension[] = [
    lineNumbers(),
    highlightActiveLine(),
    drawSelection(),
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    markdown({
      base: markdownLanguage,
      codeLanguages: languages,
    }),
    syntaxHighlighting(defaultHighlightStyle),
    customTheme,
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const value = update.state.doc.toString()
        emit('update:modelValue', value)
      }
    }),
    editableCompartment.of(EditorView.editable.of(!props.readonly)),
  ]

  const state = EditorState.create({
    doc: props.modelValue,
    extensions,
  })

  editorView = new EditorView({
    state,
    parent: editorRef.value,
  })
}

function updateContent(value: string) {
  if (!editorView) return
  const currentValue = editorView.state.doc.toString()
  if (value !== currentValue) {
    editorView.dispatch({
      changes: {
        from: 0,
        to: currentValue.length,
        insert: value,
      },
    })
  }
}

watch(
  () => props.modelValue,
  (newVal) => {
    updateContent(newVal)
  },
)

watch(
  () => props.readonly,
  (val) => {
    if (editorView) {
      editorView.dispatch({
        effects: editableCompartment.reconfigure(EditorView.editable.of(!val)),
      })
    }
  },
)

onMounted(async () => {
  await nextTick()
  createEditor()
})

onBeforeUnmount(() => {
  editorView?.destroy()
  editorView = null
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
</style>