<template>
  <div class="note-detail">
    <div v-if="loading" class="loading-state">
      <p>加载笔记中...</p>
    </div>

    <div v-else-if="!note" class="empty-state">
      <p>笔记不存在</p>
    </div>

    <template v-else>
      <!-- 头部 -->
      <header class="note-header">
        <div class="note-type-badge">{{ typeLabel }}</div>
        <div class="note-meta">
          <span>创建于 {{ formatDate(note.created) }}</span>
          <span v-if="note.updated !== note.created"> · 更新于 {{ formatDate(note.updated) }}</span>
          <span v-if="note.confidence !== undefined"> · 置信度 {{ Math.round(note.confidence * 100) }}%</span>
        </div>
      </header>

      <!-- 标题 -->
      <div class="note-title-section">
        <input
          v-model="editableTitle"
          class="note-title-input"
          @change="handleTitleChange"
        />
      </div>

      <!-- 标签 -->
      <div class="note-tags-section">
        <div class="tags">
          <span v-for="tag in editableTags" :key="tag" class="tag">
            {{ tag }}
            <button class="tag-remove" @click="removeTag(tag)">×</button>
          </span>
          <button class="tag-add" @click="showTagInput = true">
            <span v-if="!showTagInput">+ 添加标签</span>
          </button>
        </div>
        <input
          v-if="showTagInput"
          ref="tagInputRef"
          v-model="newTag"
          class="tag-input"
          placeholder="输入标签后按回车"
          @keydown.enter="addTag"
          @keydown.escape="cancelTagInput"
          @blur="cancelTagInput"
        />
      </div>

      <!-- 来源信息 -->
      <div v-if="note.source" class="note-source">
        <span class="source-label">来源会话</span>
        <button class="source-link" @click="$emit('openSource', note.source)">
          {{ note.source.session }}
        </button>
        <blockquote v-if="note.source.highlight" class="source-highlight">
          {{ note.source.highlight }}
        </blockquote>
      </div>

      <!-- 编辑器 -->
      <div class="note-editor">
        <MarkdownEditor
          :model-value="content"
          @update:model-value="handleContentChange"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import type { Note } from '../../types'
import MarkdownEditor from '../editor/MarkdownEditor.vue'

const props = defineProps<{
  note: Note | null
  loading?: boolean
}>()

const emit = defineEmits<{
  update: [note: Note]
  openSource: [source: NonNullable<Note['source']>]
}>()

const editableTitle = ref('')
const editableTags = ref<string[]>([])
const content = ref('')
const showTagInput = ref(false)
const newTag = ref('')
const tagInputRef = ref<HTMLInputElement>()

const typeLabels: Record<string, string> = {
  concept: '概念卡',
  method: '方法卡',
  fact: '事实卡',
  question: '问题卡',
}

const typeLabel = computed(() => {
  if (!props.note) return ''
  return typeLabels[props.note.type] || '笔记'
})

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  } catch {
    return dateStr
  }
}

// 同步 note 数据到本地编辑状态
watch(
  () => props.note,
  (newNote) => {
    if (newNote) {
      editableTitle.value = newNote.title
      editableTags.value = [...newNote.tags]
      content.value = newNote.content
    }
  },
  { immediate: true },
)

function handleTitleChange() {
  if (!props.note) return
  emit('update', { ...props.note, title: editableTitle.value })
}

function handleContentChange(newContent: string) {
  content.value = newContent
  if (!props.note) return
  emit('update', { ...props.note, content: newContent })
}

function addTag() {
  const tag = newTag.value.trim()
  if (tag && !editableTags.value.includes(tag)) {
    editableTags.value.push(tag)
    showTagInput.value = false
    newTag.value = ''
    if (props.note) {
      emit('update', { ...props.note, tags: [...editableTags.value] })
    }
  }
}

function removeTag(tag: string) {
  editableTags.value = editableTags.value.filter((t) => t !== tag)
  if (props.note) {
    emit('update', { ...props.note, tags: [...editableTags.value] })
  }
}

function cancelTagInput() {
  showTagInput.value = false
  newTag.value = ''
}

watch(showTagInput, async (val) => {
  if (val) {
    await nextTick()
    tagInputRef.value?.focus()
  }
})
</script>

<style scoped>
.note-detail {
  max-width: 830px;
  margin: 0 auto;
}

.loading-state,
.empty-state {
  padding: 60px 0;
  text-align: center;
  color: var(--ink-2);
  font-size: 13px;
}

.note-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.note-type-badge {
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--brand-soft);
  color: var(--brand);
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.12em;
}

.note-meta {
  color: var(--ink-3);
  font-size: 11px;
}

.note-title-section {
  margin-bottom: 16px;
}

.note-title-input {
  width: 100%;
  padding: 8px 0;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  font: 600 28px Georgia, 'Songti SC', serif;
  letter-spacing: -0.03em;
  color: var(--ink);
  outline: none;
  transition: border-color 0.15s;
}

.note-title-input:focus {
  border-bottom-color: var(--brand);
}

.note-tags-section {
  margin-bottom: 20px;
}

.tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
}

.tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 7px;
  border-radius: 999px;
  background: var(--brand-soft);
  color: var(--brand-strong);
  font-size: 10px;
}

.tag-remove {
  border: none;
  background: transparent;
  color: var(--brand-strong);
  cursor: pointer;
  font-size: 12px;
  padding: 0;
  line-height: 1;
}

.tag-add {
  padding: 4px 7px;
  border: 1px dashed var(--line);
  border-radius: 999px;
  background: transparent;
  color: var(--ink-2);
  font-size: 10px;
  cursor: pointer;
}

.tag-input {
  margin-top: 8px;
  padding: 4px 8px;
  border: 1px solid var(--brand);
  border-radius: 6px;
  font-size: 11px;
  outline: none;
  width: 150px;
}

.note-source {
  margin-bottom: 20px;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface-2);
}

.source-label {
  color: var(--brand);
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.1em;
}

.source-link {
  display: block;
  margin-top: 4px;
  border: none;
  background: transparent;
  color: var(--ink);
  font-size: 13px;
  cursor: pointer;
  text-align: left;
  padding: 0;
}

.source-link:hover {
  text-decoration: underline;
  color: var(--brand);
}

.source-highlight {
  margin: 10px 0 0;
  padding: 10px 13px;
  border-left: 2px solid var(--warn);
  background: #f8f4e8;
  color: #625535;
  font-size: 12px;
  line-height: 1.65;
}

.note-editor {
  min-height: 400px;
}
</style>