<template>
  <Teleport to="body">
    <div v-if="visible" class="imd-mask" @click.self="handleCancel">
      <div class="imd" role="dialog" aria-modal="true">
        <div class="imd__header">
          <h3>{{ titleText }}</h3>
          <p class="imd__sub">{{ subtitleText }}</p>
        </div>

        <div class="imd__body">
          <!-- 选图阶段（note/insert 模式；reference 模式自动读取图片文件） -->
          <div v-if="phase === 'pick'" class="imd__pick">
            <button class="imd__select" type="button" @click="triggerFileInput">
              选择图片
            </button>
            <input ref="fileInput" type="file" accept="image/*" class="imd__file" @change="handleFileChange" />
            <p class="imd__hint">支持 JPG / PNG 等图片，将识别文字与表格并生成 Markdown</p>
          </div>

          <!-- 已载入图片：缩略图 + 状态 -->
          <template v-else>
            <div class="imd__preview-row">
              <img v-if="thumbUrl" :src="thumbUrl" class="imd__thumb" alt="图片预览" />
              <div class="imd__status">
                <span v-if="phase === 'recognizing'" class="imd__status-text">AI 正在识别图片…</span>
                <span v-else-if="error" class="imd__error-text">{{ error }}</span>
              </div>
            </div>

            <!-- 识别结果预览 -->
            <template v-if="result">
              <label class="imd__label" for="imd-title">笔记标题</label>
              <input
                id="imd-title"
                v-model="localTitle"
                class="imd__input"
                maxlength="60"
                placeholder="输入笔记标题…"
                :disabled="saving"
              />
              <label class="imd__label" for="imd-tags">标签（逗号或空格分隔）</label>
              <input
                id="imd-tags"
                v-model="tagsText"
                class="imd__input"
                placeholder="输入标签…"
                :disabled="saving"
              />
              <label class="imd__label">Markdown 预览</label>
              <div class="imd__md" v-html="renderedMarkdown"></div>
            </template>
          </template>
        </div>

        <div class="imd__footer">
          <button class="imd__btn imd__btn--ghost" type="button" :disabled="saving" @click="handleCancel">
            取消
          </button>
          <template v-if="phase === 'pick' || phase === 'ready'">
            <button
              class="imd__btn imd__btn--primary"
              type="button"
              :disabled="phase === 'pick' || !compressed"
              @click="handleRecognize"
            >
              识别图片
            </button>
          </template>
          <template v-else-if="result">
            <button
              class="imd__btn imd__btn--primary"
              type="button"
              :disabled="saving || !canSave"
              @click="handleConfirm"
            >
              {{ saving ? '保存中…' : saveLabel }}
            </button>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { marked } from 'marked'
import type { ReferenceMeta, ExtractedNote } from '../../types'
import { useNoteStore } from '../../stores/notes'
import { useReferenceStore } from '../../stores/references'
import { useSettingsStore } from '../../stores/settings'
import { useVaultStore } from '../../stores/vault'
import { useToast } from '../../composables/useToast'
import { readFileBytes } from '../../utils/vault-fs'
import { compressImageFile, type CompressedImage } from '../../utils/image-compress'
import { imageToMarkdown, type ImageNoteResult } from '../../api/skills/image-to-note'
import { createVisionProvider } from '../../api/provider-factory'

/** base64 体积上限（约 20MB 原始字节），超出提示图片过大 */
const MAX_BASE64_LENGTH = 27 * 1024 * 1024

const props = defineProps<{
  visible: boolean
  mode: 'note' | 'insert' | 'reference'
  /** reference 模式使用：待识别的 PNG 参考资料 */
  reference?: ReferenceMeta | null
}>()

const emit = defineEmits<{
  close: []
  saved: [path: string]
  insert: [markdown: string]
}>()

const noteStore = useNoteStore()
const referenceStore = useReferenceStore()
const settingsStore = useSettingsStore()
const vaultStore = useVaultStore()
const toast = useToast()

const fileInput = ref<HTMLInputElement | null>(null)
const phase = ref<'pick' | 'ready' | 'recognizing' | 'preview'>('pick')
const error = ref('')
const compressed = ref<CompressedImage | null>(null)
const thumbUrl = ref('')
const result = ref<ImageNoteResult | null>(null)
const localTitle = ref('')
const tagsText = ref('')
const saving = ref(false)

const titleText = computed(() => {
  if (props.mode === 'insert') return '导入图片内容'
  if (props.mode === 'reference') return '识别图片为 Markdown'
  return '从图片导入笔记'
})

const subtitleText = computed(() => {
  if (props.mode === 'insert') return '识别图片中的文字与表格，生成 Markdown 插入当前笔记'
  if (props.mode === 'reference') return '识别为参考资料 Markdown（一次识别，后续可全文检索）'
  return '识别图片中的文字与表格，生成 Markdown 并保存为笔记'
})

const saveLabel = computed(() => {
  if (props.mode === 'insert') return '插入笔记'
  if (props.mode === 'reference') return '保存识别结果'
  return '保存为笔记'
})

const renderedMarkdown = computed(() => {
  if (!result.value) return ''
  return marked(result.value.markdown, { breaks: true, gfm: true }) as string
})

const canSave = computed(() => {
  if (props.mode === 'insert') return true
  return localTitle.value.trim().length > 0
})

watch(
  () => props.visible,
  async (visible) => {
    if (!visible) return
    reset()
    if (props.mode === 'reference') {
      await loadReferenceImage()
    }
  },
  { immediate: true },
)

function reset() {
  phase.value = 'pick'
  error.value = ''
  compressed.value = null
  thumbUrl.value = ''
  result.value = null
  localTitle.value = ''
  tagsText.value = ''
  saving.value = false
}

function triggerFileInput() {
  fileInput.value?.click()
}

async function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) await handleImage(file)
  input.value = ''
}

/** reference 模式：从参考资料文件读取图片字节并载入 */
async function loadReferenceImage() {
  const ref = props.reference
  if (!ref) return
  try {
    const bytes = await readFileBytes(ref.filePath)
    const file = new File([bytes], ref.fileName, { type: 'image/png' })
    await handleImage(file)
  } catch {
    error.value = '读取图片文件失败'
    phase.value = 'ready'
  }
}

async function handleImage(file: File) {
  error.value = ''
  try {
    const img = await compressImageFile(file)
    if (img.base64.length > MAX_BASE64_LENGTH) {
      error.value = '图片过大，请更换更小的图片后重试'
      return
    }
    compressed.value = img
    thumbUrl.value = `data:${img.mimeType};base64,${img.base64}`
    phase.value = 'ready'
  } catch {
    error.value = '图片压缩失败，请更换图片后重试'
  }
}

async function handleRecognize() {
  const config = settingsStore.getVisionProviderConfig()
  if (!config) {
    error.value = '尚未配置图片转笔记模型，请先到设置页配置'
    return
  }
  if (!compressed.value) return

  phase.value = 'recognizing'
  error.value = ''
  try {
    const provider = createVisionProvider(config)
    const intent = props.mode === 'reference' ? 'reference' : 'note'
    const res = await imageToMarkdown(compressed.value, provider, intent)
    result.value = res
    localTitle.value = res.title
    tagsText.value = res.tags.join(', ')
    phase.value = 'preview'
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
    phase.value = 'ready'
  }
}

function parseTags(text: string): string[] {
  return text
    .split(/[,，、\s]+/)
    .map((tag) => tag.trim())
    .filter(Boolean)
}

async function handleConfirm() {
  if (!result.value || saving.value) return
  saving.value = true
  try {
    if (props.mode === 'insert') {
      emit('insert', result.value.markdown)
      emit('close')
      return
    }

    const vaultPath = vaultStore.vaultPath
    if (!vaultPath) {
      toast.error('请先打开 Vault 再保存')
      return
    }

    if (props.mode === 'reference') {
      const ref = props.reference
      if (!ref) {
        toast.error('参考资料信息缺失')
        return
      }
      const ok = await referenceStore.recognizePngReference(ref, vaultPath, result.value)
      if (!ok) {
        toast.error('保存识别结果失败')
        return
      }
      emit('saved', ref.path)
    } else {
      const note: ExtractedNote = {
        title: localTitle.value.trim(),
        description: result.value.description,
        proposition: '',
        explanation: '',
        type: 'concept',
        tags: parseTags(tagsText.value),
        confidence: 0.5,
      }
      const path = await noteStore.saveNote(vaultPath, note, '', result.value.markdown, result.value.markdown)
      if (!path) {
        toast.error('保存笔记失败')
        return
      }
      emit('saved', path)
    }
    emit('close')
  } finally {
    saving.value = false
  }
}

function handleCancel() {
  if (saving.value) return
  emit('close')
}
</script>

<style scoped>
.imd-mask {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: grid;
  place-items: center;
  background: rgba(18, 30, 26, 0.4);
  backdrop-filter: blur(2px);
}

.imd {
  display: flex;
  flex-direction: column;
  width: min(680px, calc(100vw - 48px));
  max-height: calc(100vh - 96px);
  background: #fffefa;
  border: 1px solid var(--line);
  border-radius: 14px;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.18);
  overflow: hidden;
  animation: imdIn 0.18s ease;
}

.imd__header {
  padding: 18px 20px 0;
}

.imd__header h3 {
  margin: 0;
  font: 650 17px 'HarmonyOS Sans SC', 'PingFang SC', sans-serif;
  color: var(--ink);
}

.imd__sub {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--ink-3);
}

.imd__body {
  padding: 16px 20px 0;
  overflow-y: auto;
}

.imd__pick {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 28px 0 20px;
}

.imd__select {
  padding: 10px 24px;
  border: 1px solid var(--brand);
  border-radius: 9px;
  background: var(--brand);
  color: #fff;
  font-size: 13px;
  font-weight: 590;
  cursor: pointer;
  transition: background 0.15s;
}

.imd__select:hover {
  background: var(--brand-strong);
}

.imd__file {
  display: none;
}

.imd__hint {
  margin: 0;
  font-size: 12px;
  color: var(--ink-3);
}

.imd__preview-row {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.imd__thumb {
  width: 96px;
  height: 96px;
  object-fit: contain;
  flex-shrink: 0;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface-2);
}

.imd__status {
  display: flex;
  align-items: center;
  min-height: 96px;
  flex: 1;
}

.imd__status-text {
  font-size: 13px;
  color: var(--ink-2);
}

.imd__error-text {
  font-size: 12px;
  line-height: 1.5;
  color: #b3362d;
}

.imd__label {
  display: block;
  margin: 14px 0 6px;
  font-size: 11px;
  font-weight: 700;
  color: var(--ink-2);
  letter-spacing: 0.05em;
}

.imd__input {
  width: 100%;
  box-sizing: border-box;
  padding: 9px 12px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: #fff;
  font-size: 14px;
  color: var(--ink);
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.imd__input:focus {
  border-color: var(--brand);
  box-shadow: 0 0 0 3px var(--brand-soft);
}

.imd__md {
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface-2);
  font-size: 13px;
  line-height: 1.7;
  color: var(--ink);
  max-height: 240px;
  overflow-y: auto;
}

.imd__md :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 8px 0;
  font-size: 12px;
}

.imd__md :deep(th),
.imd__md :deep(td) {
  padding: 6px 10px;
  border: 1px solid var(--line);
  text-align: left;
  vertical-align: top;
}

.imd__md :deep(th) {
  background: #fff;
  font-weight: 650;
}

.imd__md :deep(h1),
.imd__md :deep(h2),
.imd__md :deep(h3) {
  margin: 8px 0 4px;
}

.imd__md :deep(p) {
  margin: 6px 0;
}

.imd__md :deep(pre) {
  padding: 10px;
  overflow-x: auto;
  border-radius: 8px;
  background: #fff;
  font-size: 12px;
}

.imd__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 20px 20px;
}

.imd__btn {
  padding: 8px 16px;
  border: 1px solid transparent;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.imd__btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.imd__btn--ghost {
  background: transparent;
  border-color: var(--line);
  color: var(--ink-2);
}

.imd__btn--ghost:hover:not(:disabled) {
  background: var(--surface-2);
}

.imd__btn--primary {
  background: var(--brand);
  color: #fff;
}

.imd__btn--primary:hover:not(:disabled) {
  background: var(--brand-strong);
}

@keyframes imdIn {
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
