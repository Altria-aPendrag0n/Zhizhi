<template>
  <Teleport to="body">
    <div v-if="visible" class="add-note-dialog__mask" @click.self="handleCancel">
      <div class="add-note-dialog" role="dialog" aria-modal="true">
        <header class="add-note-dialog__header">
          <h3>{{ step === 'pick' ? '加入笔记' : '选择插入位置' }}</h3>
          <p class="add-note-dialog__sub">
            {{ step === 'pick' ? '选择要将划线内容加入的笔记' : '选择划线内容插入的标题位置' }}
          </p>
        </header>

        <blockquote class="add-note-dialog__quote">{{ highlightedText }}</blockquote>

        <!-- 第一步：选择笔记 -->
        <div v-if="step === 'pick'" class="add-note-dialog__body">
          <div v-if="sortedNotes.length > 0" class="add-note-list">
            <button
              v-for="note in sortedNotes"
              :key="note.path"
              type="button"
              class="add-note-item"
              :class="{ 'add-note-item--active': selectedNote?.path === note.path }"
              @click="pickNote(note)"
            >
              <span class="add-note-item__title">{{ note.title }}</span>
              <span class="add-note-item__meta">{{ formatUpdated(note.updated) }}</span>
            </button>
          </div>
          <div v-else class="add-note-empty">还没有笔记，先在会话中摘录一条新笔记吧</div>
        </div>

        <!-- 第二步：选择标题位置 -->
        <div v-else class="add-note-dialog__body">
          <div v-if="headingsError" class="add-note-dialog__error">{{ headingsError }}</div>
          <div v-else-if="loadingHeadings" class="add-note-loading">正在读取笔记标题…</div>
          <div v-else class="add-note-headings">
            <button
              type="button"
              class="add-note-heading"
              :class="{ 'add-note-heading--active': selectedHeading === null }"
              @click="selectedHeading = null"
            >
              <span class="add-note-heading__level">#</span>
              <span>文件末尾</span>
            </button>
            <button
              v-for="heading in headings"
              :key="heading.line"
              type="button"
              class="add-note-heading"
              :class="{ 'add-note-heading--active': selectedHeading?.line === heading.line }"
              :style="{ paddingLeft: `${heading.level * 16 + 12}px` }"
              @click="selectedHeading = heading"
            >
              <span class="add-note-heading__level">{{ '#'.repeat(heading.level) }}</span>
              <span class="add-note-heading__text">{{ heading.text }}</span>
            </button>
            <div v-if="headings.length === 0" class="add-note-empty">这篇笔记没有标题层级，可加入文件末尾</div>
          </div>
        </div>

        <div v-if="error" class="add-note-dialog__error">{{ error }}</div>

        <footer class="add-note-dialog__footer">
          <button
            type="button"
            class="add-note-dialog__btn add-note-dialog__btn--ghost"
            :disabled="saving"
            @click="step === 'pick' ? handleCancel() : backToPick()"
          >
            {{ step === 'pick' ? '取消' : '返回' }}
          </button>
          <button
            v-if="step === 'pick'"
            type="button"
            class="add-note-dialog__btn add-note-dialog__btn--primary"
            :disabled="!selectedNote || saving"
            @click="openHeadings"
          >
            下一步
          </button>
          <button
            v-else
            type="button"
            class="add-note-dialog__btn add-note-dialog__btn--primary"
            :disabled="loadingHeadings || saving"
            @click="handleConfirm"
          >
            {{ saving ? '保存中…' : '确认加入' }}
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { NoteMeta } from '../../types'
import { readFile } from '../../utils/vault-fs'
import { parseFrontmatter } from '../../parser/frontmatter'
import { parseHeadings, type MarkdownHeading } from '../../utils/markdown-headings'
import type { AddToNoteTarget } from '../../utils/note-insert'

const props = withDefaults(defineProps<{
  visible: boolean
  highlightedText: string
  notes?: NoteMeta[]
  saving?: boolean
  error?: string
}>(), {
  notes: () => [],
  saving: false,
  error: '',
})

const emit = defineEmits<{
  close: []
  confirm: [target: AddToNoteTarget]
}>()

const step = ref<'pick' | 'headings'>('pick')
const selectedNote = ref<NoteMeta | null>(null)
const headings = ref<MarkdownHeading[]>([])
const selectedHeading = ref<MarkdownHeading | null>(null)
const loadingHeadings = ref(false)
const headingsError = ref('')
const loadedBody = ref('')

/** 笔记按最近编辑排序（updated 降序） */
const sortedNotes = computed(() =>
  [...props.notes].sort((a, b) => b.updated.localeCompare(a.updated)),
)

function formatUpdated(updated: string): string {
  const date = new Date(updated)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('zh-CN')
}

function pickNote(note: NoteMeta) {
  selectedNote.value = note
  void openHeadings()
}

async function openHeadings() {
  if (!selectedNote.value) return
  step.value = 'headings'
  loadingHeadings.value = true
  headingsError.value = ''
  selectedHeading.value = null
  headings.value = []
  loadedBody.value = ''
  try {
    const raw = await readFile(selectedNote.value.path)
    const { body } = parseFrontmatter(raw)
    loadedBody.value = body
    headings.value = parseHeadings(body)
  } catch {
    headingsError.value = '无法读取笔记内容，请重试'
  } finally {
    loadingHeadings.value = false
  }
}

function backToPick() {
  step.value = 'pick'
}

function handleConfirm() {
  if (!selectedNote.value || loadingHeadings.value || props.saving) return
  emit('confirm', {
    notePath: selectedNote.value.path,
    headingLine: selectedHeading.value?.line ?? null,
    headingText: selectedHeading.value?.text ?? '',
    body: loadedBody.value,
  })
}

function handleCancel() {
  if (props.saving) return
  emit('close')
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      step.value = 'pick'
      selectedNote.value = sortedNotes.value[0] ?? null
      selectedHeading.value = null
      headings.value = []
      headingsError.value = ''
      loadedBody.value = ''
    }
  },
  { immediate: true },
)
</script>

<style scoped>
.add-note-dialog__mask {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: grid;
  place-items: center;
  background: rgba(18, 30, 26, 0.4);
  backdrop-filter: blur(2px);
}

.add-note-dialog {
  width: min(460px, calc(100vw - 48px));
  background: #fffefa;
  border: 1px solid var(--line);
  border-radius: 14px;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.18);
  overflow: hidden;
  animation: dialogIn 0.18s ease;
}

.add-note-dialog__header {
  padding: 18px 20px 0;
}

.add-note-dialog__header h3 {
  margin: 0;
  font: 650 17px 'HarmonyOS Sans SC', 'PingFang SC', sans-serif;
  color: var(--ink);
}

.add-note-dialog__sub {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--ink-3);
}

.add-note-dialog__quote {
  margin: 12px 20px 0;
  padding: 10px 12px;
  border-left: 3px solid var(--brand-soft);
  background: var(--surface-2);
  color: var(--ink-2);
  font-size: 12px;
  line-height: 1.7;
  max-height: 80px;
  overflow-y: auto;
  white-space: pre-wrap;
}

.add-note-dialog__body {
  padding: 14px 20px 0;
  max-height: 320px;
  overflow-y: auto;
}

.add-note-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.add-note-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  box-sizing: border-box;
  padding: 9px 12px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: #fff;
  font-size: 13px;
  color: var(--ink);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s, background 0.15s;
}

.add-note-item:hover {
  border-color: var(--brand);
}

.add-note-item--active {
  border-color: var(--brand);
  background: var(--brand-soft);
}

.add-note-item__title {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.add-note-item__meta {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--ink-3);
}

.add-note-headings {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.add-note-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  box-sizing: border-box;
  padding: 7px 12px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  font-size: 12px;
  color: var(--ink);
  cursor: pointer;
  text-align: left;
  transition: background 0.12s, border-color 0.12s;
}

.add-note-heading:hover {
  background: var(--surface-2);
}

.add-note-heading--active {
  border-color: var(--brand);
  background: var(--brand-soft);
}

.add-note-heading__level {
  flex-shrink: 0;
  color: var(--brand-strong);
  font-weight: 800;
  font-size: 12px;
}

.add-note-heading__text {
  font-weight: 650;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.add-note-loading,
.add-note-empty {
  padding: 20px 0;
  text-align: center;
  color: var(--ink-3);
  font-size: 12px;
}

.add-note-dialog__error {
  margin: 10px 20px 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: #fdeceb;
  color: #b3362d;
  font-size: 12px;
}

.add-note-dialog__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 20px 20px;
}

.add-note-dialog__btn {
  padding: 8px 16px;
  border: 1px solid transparent;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.add-note-dialog__btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.add-note-dialog__btn--ghost {
  background: transparent;
  border-color: var(--line);
  color: var(--ink-2);
}

.add-note-dialog__btn--ghost:hover:not(:disabled) {
  background: var(--surface-2);
}

.add-note-dialog__btn--primary {
  background: var(--brand);
  color: #fff;
}

.add-note-dialog__btn--primary:hover:not(:disabled) {
  background: var(--brand-strong);
}

@keyframes dialogIn {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
</style>
