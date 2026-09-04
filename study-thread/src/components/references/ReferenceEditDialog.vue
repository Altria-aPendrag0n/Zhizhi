<template>
  <Teleport to="body">
    <div v-if="visible && reference" class="ref-edit__mask" @click.self="handleClose">
      <div class="ref-edit" role="dialog" aria-modal="true">
        <div class="ref-edit__header">
          <h3>编辑参考资料</h3>
          <p class="ref-edit__sub">{{ reference.fileName }} · {{ typeLabel }}</p>
        </div>

        <div class="ref-edit__body">
          <div class="ref-edit__field">
            <label class="ref-edit__label" for="ref-edit-title">标题</label>
            <input
              id="ref-edit-title"
              v-model="title"
              class="ref-edit__input"
              type="text"
              maxlength="80"
              placeholder="输入参考资料标题…"
            />
          </div>

          <div class="ref-edit__field">
            <label class="ref-edit__label" for="ref-edit-desc">描述</label>
            <textarea
              id="ref-edit-desc"
              v-model="description"
              class="ref-edit__textarea"
              rows="3"
              placeholder="一句话描述这份参考资料…"
            ></textarea>
          </div>

          <div class="ref-edit__field">
            <label class="ref-edit__label" for="ref-edit-tags">标签</label>
            <input
              id="ref-edit-tags"
              v-model="tagsText"
              class="ref-edit__input"
              type="text"
              placeholder="多个标签用逗号或顿号分隔，如：认知科学, 综述"
            />
          </div>

          <div class="ref-edit__field">
            <div class="ref-edit__preview">
              <div class="ref-edit__preview-title">预览</div>
              <pre v-if="previewState === 'md'" class="ref-edit__pre">{{ previewText }}</pre>
              <img
                v-else-if="previewState === 'png'"
                class="ref-edit__img"
                :src="previewText"
                alt="参考资料图片预览"
              />
              <p v-else-if="previewState === 'pdf'" class="ref-edit__hint">
                PDF 文件请点击「打开原文件」查看
              </p>
              <p v-else-if="previewState === 'loading'" class="ref-edit__hint">正在加载预览…</p>
              <p v-else class="ref-edit__hint">预览加载失败</p>
            </div>
          </div>
        </div>

        <div class="ref-edit__footer">
          <button class="ref-edit__btn ref-edit__btn--danger" type="button" @click="handleDelete">
            删除
          </button>
          <div class="ref-edit__footer-actions">
            <button class="ref-edit__btn ref-edit__btn--ghost" type="button" @click="handleClose">
              取消
            </button>
            <button class="ref-edit__btn ref-edit__btn--ghost" type="button" @click="handleOpen">
              打开原文件
            </button>
            <button
              class="ref-edit__btn ref-edit__btn--primary"
              type="button"
              :disabled="!canSave"
              @click="handleSave"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ReferenceMeta } from '../../types'
import { useReferenceStore } from '../../stores/references'
import { useToast } from '../../composables/useToast'
import { openPath } from '@tauri-apps/plugin-opener'

const props = defineProps<{
  visible: boolean
  reference: ReferenceMeta | null
}>()

const emit = defineEmits<{
  close: []
  save: [meta: ReferenceMeta]
  delete: [path: string]
}>()

const referenceStore = useReferenceStore()
const toast = useToast()

const title = ref('')
const description = ref('')
const tagsText = ref('')
const previewText = ref('')
const previewState = ref<'loading' | 'md' | 'png' | 'pdf' | 'error'>('loading')

const typeLabels: Record<string, string> = { md: 'MD', pdf: 'PDF', png: 'PNG' }

const typeLabel = computed(() => {
  if (!props.reference) return ''
  return typeLabels[props.reference.fileType] ?? props.reference.fileType.toUpperCase()
})

const canSave = computed(() => title.value.trim().length > 0)

watch(
  () => [props.visible, props.reference] as const,
  ([visible, reference]) => {
    if (!visible || !reference) return
    initForm(reference)
    loadPreview(reference)
  },
  { immediate: true },
)

function initForm(reference: ReferenceMeta) {
  title.value = reference.title
  description.value = reference.description ?? ''
  tagsText.value = reference.tags.join('，')
}

async function loadPreview(reference: ReferenceMeta) {
  previewText.value = ''
  if (reference.fileType === 'pdf') {
    previewState.value = 'pdf'
    return
  }
  previewState.value = 'loading'
  try {
    const preview = await referenceStore.loadReferencePreview(reference)
    previewText.value = preview
    previewState.value = reference.fileType
  } catch {
    previewState.value = 'error'
  }
}

function parseTags(text: string): string[] {
  return text
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
}

function handleSave() {
  if (!props.reference || !canSave.value) return
  emit('save', {
    ...props.reference,
    title: title.value.trim(),
    description: description.value.trim(),
    tags: parseTags(tagsText.value),
  })
}

async function handleDelete() {
  if (!props.reference) return
  if (!(await window.confirm(`确定要删除“${props.reference.title}”吗？此操作无法撤销。`))) return
  emit('delete', props.reference.path)
}

async function handleOpen() {
  if (!props.reference) return
  if (typeof openPath !== 'function') {
    toast.error('当前环境不支持打开文件')
    return
  }
  try {
    await openPath(props.reference.filePath)
  } catch {
    toast.error('无法打开文件')
  }
}

function handleClose() {
  emit('close')
}
</script>

<style scoped>
.ref-edit__mask {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: grid;
  place-items: center;
  background: rgba(18, 30, 26, 0.4);
  backdrop-filter: blur(2px);
}

.ref-edit {
  display: flex;
  flex-direction: column;
  width: min(520px, calc(100vw - 48px));
  max-height: calc(100vh - 64px);
  background: #fffefa;
  border: 1px solid var(--line);
  border-radius: 14px;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.18);
  overflow: hidden;
  animation: dialogIn 0.18s ease;
}

.ref-edit__header {
  padding: 18px 20px 0;
}

.ref-edit__header h3 {
  margin: 0;
  font: 650 17px 'HarmonyOS Sans SC', 'PingFang SC', sans-serif;
  color: var(--ink);
}

.ref-edit__sub {
  margin: 4px 0 0;
  overflow: hidden;
  color: var(--ink-3);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ref-edit__body {
  flex: 1;
  min-height: 0;
  padding: 16px 20px 0;
  overflow-y: auto;
}

.ref-edit__field {
  margin-bottom: 14px;
}

.ref-edit__label {
  display: block;
  margin-bottom: 6px;
  font-size: 11px;
  font-weight: 700;
  color: var(--ink-2);
  letter-spacing: 0.05em;
}

.ref-edit__input,
.ref-edit__textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: #fff;
  font: inherit;
  font-size: 13px;
  color: var(--ink);
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.ref-edit__input:focus,
.ref-edit__textarea:focus {
  border-color: var(--brand);
  box-shadow: 0 0 0 3px var(--brand-soft);
}

.ref-edit__textarea {
  min-height: 64px;
  line-height: 1.6;
  resize: vertical;
}

.ref-edit__preview {
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--surface-2);
  overflow: hidden;
}

.ref-edit__preview-title {
  padding: 7px 12px;
  border-bottom: 1px solid var(--line);
  background: #fff;
  font-size: 11px;
  font-weight: 700;
  color: var(--ink-2);
  letter-spacing: 0.05em;
}

.ref-edit__pre {
  margin: 0;
  padding: 10px 12px;
  max-height: 200px;
  overflow-y: auto;
  color: var(--ink-2);
  font-size: 12px;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
}

.ref-edit__img {
  display: block;
  max-width: 100%;
  max-height: 220px;
  margin: 0 auto;
  object-fit: contain;
}

.ref-edit__hint {
  margin: 0;
  padding: 18px 12px;
  color: var(--ink-3);
  font-size: 12px;
  text-align: center;
}

.ref-edit__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 16px 20px 20px;
}

.ref-edit__footer-actions {
  display: flex;
  gap: 8px;
}

.ref-edit__btn {
  padding: 8px 16px;
  border: 1px solid transparent;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.ref-edit__btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.ref-edit__btn--ghost {
  background: transparent;
  border-color: var(--line);
  color: var(--ink-2);
}

.ref-edit__btn--ghost:hover:not(:disabled) {
  background: var(--surface-2);
}

.ref-edit__btn--primary {
  background: var(--brand);
  color: #fff;
}

.ref-edit__btn--primary:hover:not(:disabled) {
  background: var(--brand-strong);
}

.ref-edit__btn--danger {
  background: transparent;
  border-color: transparent;
  color: var(--state-error);
}

.ref-edit__btn--danger:hover {
  background: #fdeceb;
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
