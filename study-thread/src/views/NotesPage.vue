<template>
  <div class="notes-page">
    <div class="notes-layout">
      <aside class="sidebar">
        <nav class="sidebar-nav" aria-label="资料库分类">
          <button
            class="sidebar-item"
            :class="{ active: activeTab === 'notes' }"
            type="button"
            @click="goNotes"
          >
            笔记
          </button>
          <button
            class="sidebar-item"
            :class="{ active: activeTab === 'references' }"
            type="button"
            @click="goReferences"
          >
            参考资料
          </button>
          <button
            class="sidebar-item"
            :class="{ active: activeTab === 'reviews' }"
            type="button"
            @click="goReviews"
          >
            复习会话
          </button>
        </nav>
      </aside>

      <div class="content">
        <section v-if="!vaultStore.vaultReady" class="vault-loading-state">
          <span class="vault-loading-state__dot" />
          <p>正在打开资料库…</p>
        </section>

        <template v-else>
          <div v-if="!vaultStore.vaultPath" class="vault-offline-banner">
            <span>未连接 Vault，当前展示本地缓存的笔记；打开 Vault 后可编辑与同步。</span>
            <button type="button" @click="router.push('/settings')">打开 Vault</button>
          </div>

          <template v-if="activeTab === 'notes'">
            <section class="intro">
              <div>
                <div class="eyebrow">Source-linked knowledge</div>
                <h2>让每个判断都能回到来处</h2>
              </div>
              <p>
                原子笔记只保留一个能够独立成立的观点；它同时保留来源、原文划线与对话中的追问。
              </p>
            </section>

            <NoteList
              :notes="noteStore.notes"
              :selected-path="selectedNotePath"
              :loading="noteStore.isLoading"
              @select="handleSelectNote"
              @open-source="handleOpenSource"
              @delete="handleDeleteNote"
              @create-from-image="openImageDialog('note')"
            />
          </template>

          <template v-else-if="activeTab === 'references'">
            <section class="intro">
              <div>
                <div class="eyebrow">Reference library</div>
                <h2>让每个依据都有处可查</h2>
              </div>
              <p>
                上传 md / pdf / png 文件作为参考资料，作为学习判断的原始依据。
              </p>
            </section>

            <ReferenceList
              :references="referenceStore.references"
              :selected-path="selectedReferencePath"
              @select="handleSelectReference"
              @upload="handleUploadReference"
              @delete="handleDeleteReference"
              @retry-parse="handleRetryParse"
              @recognize="handleRecognizeReference"
            />

            <ReferenceEditDialog
              :visible="editVisible"
              :reference="selectedReference"
              @close="handleEditClose"
              @save="handleEditSave"
              @delete="handleEditDelete"
            />
          </template>

          <template v-else>
            <section class="intro">
              <div>
                <div class="eyebrow">Review history</div>
                <h2>复习过的会话都在这里</h2>
              </div>
              <p>
                完成复习后会话不再删除，随时回来重看错题、反馈与缺口笔记。
              </p>
            </section>

            <ReviewSessionList
              :sessions="reviewSessions"
              :loading="reviewSessionsLoading"
              @open="handleOpenReviewSession"
            />
          </template>

          <ImageToMarkdownDialog
            :visible="imageDialogVisible"
            :mode="imageDialogMode"
            :reference="imageDialogReference"
            @close="handleImageDialogClose"
            @saved="handleImageDialogSaved"
          />
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useNoteStore } from '../stores/notes'
import { useReferenceStore } from '../stores/references'
import { useVaultStore } from '../stores/vault'
import { useToast } from '../composables/useToast'
import NoteList from '../components/notes/NoteList.vue'
import ReferenceList from '../components/references/ReferenceList.vue'
import ReferenceEditDialog from '../components/references/ReferenceEditDialog.vue'
import ReviewSessionList from '../components/review/ReviewSessionList.vue'
import ImageToMarkdownDialog from '../components/notes/ImageToMarkdownDialog.vue'
import { listReviewSessions, type ReviewSessionMeta } from '../utils/review-session'
import type { ReferenceMeta } from '../types'

const route = useRoute()
const router = useRouter()
const noteStore = useNoteStore()
const referenceStore = useReferenceStore()
const vaultStore = useVaultStore()
const toast = useToast()
const selectedNotePath = ref<string>()
const selectedReferencePath = ref<string>()
const editVisible = ref(false)
const reviewSessions = ref<ReviewSessionMeta[]>([])
const reviewSessionsLoading = ref(false)
// 图片转笔记弹窗（三模式：note 新建笔记 / insert 编辑器导入 / reference 参考资料识别）
const imageDialogVisible = ref(false)
const imageDialogMode = ref<'note' | 'insert' | 'reference'>('note')
const imageDialogReference = ref<ReferenceMeta | null>(null)

const selectedReference = computed<ReferenceMeta | null>(
  () => referenceStore.references.find((item) => item.path === selectedReferencePath.value) ?? null,
)

const activeTab = computed(() => {
  const tab = route.query.tab
  return tab === 'references' ? 'references' : tab === 'reviews' ? 'reviews' : 'notes'
})

function loadCurrentTabData() {
  const vaultPath = vaultStore.vaultPath
  if (!vaultPath) return
  if (activeTab.value === 'references') {
    referenceStore.loadAllReferences(vaultPath)
  } else if (activeTab.value === 'reviews') {
    loadReviewSessions(vaultPath)
  } else {
    noteStore.loadAllNotes(vaultPath)
  }
}

async function loadReviewSessions(vaultPath: string) {
  reviewSessionsLoading.value = true
  try {
    reviewSessions.value = await listReviewSessions(vaultPath)
  } catch {
    reviewSessions.value = []
  } finally {
    reviewSessionsLoading.value = false
  }
}

watch(
  () => vaultStore.vaultPath,
  (vaultPath) => {
    if (vaultPath) loadCurrentTabData()
  },
  { immediate: true },
)

// 响应外部跳转（query.tab 变化时切换并加载对应 tab 数据）
watch(
  () => route.query.tab,
  () => {
    loadCurrentTabData()
  },
)

function goNotes() {
  router.push({ query: {} })
}

function goReferences() {
  router.push({ query: { tab: 'references' } })
}

function goReviews() {
  router.push({ query: { tab: 'reviews' } })
}

function handleOpenReviewSession(sessionId: string) {
  router.push(`/review/${encodeURIComponent(sessionId)}`)
}

function handleSelectNote(path: string) {
  selectedNotePath.value = path
  router.push(`/notes/${encodeURIComponent(path)}`)
}

async function handleDeleteNote(path: string) {
  const note = noteStore.notes.find((item) => item.path === path)
  if (!note || !window.confirm(`确定要删除“${note.title}”吗？此操作无法撤销。`)) return

  if (!(await noteStore.deleteNote(path))) {
    toast.error('删除 Vault 笔记文件失败，未删除本地数据')
    return
  }

  if (selectedNotePath.value === path) selectedNotePath.value = undefined
  toast.success('已删除笔记')
}

function handleOpenSource(source: { session: string; highlight: string }) {
  console.log('Open source session:', source.session)
}

function handleSelectReference(path: string) {
  selectedReferencePath.value = path
  editVisible.value = true
}

async function handleUploadReference(files: File[]) {
  const vaultPath = vaultStore.vaultPath
  if (!vaultPath) return
  let uploaded = 0
  let lastPng: ReferenceMeta | null = null
  for (const file of files) {
    const meta = await referenceStore.uploadReference(vaultPath, file)
    if (meta) {
      uploaded++
      if (meta.fileType === 'png') lastPng = meta
    }
  }
  if (uploaded === 0) {
    toast.error('上传参考资料失败')
  } else if (uploaded === files.length) {
    toast.success(`已上传 ${uploaded} 份参考资料`)
  } else {
    toast.success(`成功上传 ${uploaded}/${files.length} 份参考资料`)
  }
  // 上传 PNG 后弹确认框询问是否识别为 Markdown（避免静默消耗 token）
  if (lastPng) {
    openImageDialog('reference', lastPng)
  }
}

function handleRecognizeReference(path: string) {
  const reference = referenceStore.references.find((item) => item.path === path)
  if (reference) openImageDialog('reference', reference)
}

/** 打开图片转笔记弹窗 */
function openImageDialog(mode: 'note' | 'reference', reference: ReferenceMeta | null = null) {
  imageDialogMode.value = mode
  imageDialogReference.value = reference
  imageDialogVisible.value = true
}

function handleImageDialogClose() {
  imageDialogVisible.value = false
}

async function handleImageDialogSaved(path: string) {
  imageDialogVisible.value = false
  if (imageDialogMode.value === 'reference') {
    toast.success('图片已识别为 Markdown 参考资料')
    return
  }
  // note 模式：保存成功后跳转到新笔记详情
  toast.success('笔记已保存')
  router.push(`/notes/${encodeURIComponent(path)}`)
}

async function handleRetryParse(path: string) {
  await referenceStore.retryParseReference(path)
}

async function handleDeleteReference(path: string) {
  const reference = referenceStore.references.find((item) => item.path === path)
  if (!reference || !window.confirm(`确定要删除“${reference.title}”吗？此操作无法撤销。`)) return

  if (!(await referenceStore.deleteReference(path))) {
    toast.error('删除参考资料文件失败')
    return
  }

  if (selectedReferencePath.value === path) selectedReferencePath.value = undefined
  toast.success('已删除参考资料')
}

function handleEditClose() {
  editVisible.value = false
}

async function handleEditSave(meta: ReferenceMeta) {
  const saved = await referenceStore.updateReference(meta)
  if (!saved) {
    toast.error('保存参考资料失败')
    return
  }
  toast.success('已保存')
  editVisible.value = false
}

async function handleEditDelete(path: string) {
  const deleted = await referenceStore.deleteReference(path)
  if (!deleted) {
    toast.error('删除参考资料文件失败')
    return
  }
  if (selectedReferencePath.value === path) selectedReferencePath.value = undefined
  toast.success('已删除')
  editVisible.value = false
}
</script>

<style scoped>
.notes-page {
  box-sizing: border-box;
  min-height: 100%;
  padding: 34px 48px 64px;
  background: var(--surface);
  overflow-y: auto;
}

.notes-layout {
  display: flex;
  gap: 40px;
  align-items: flex-start;
}

.sidebar {
  width: 168px;
  flex-shrink: 0;
}

.sidebar-nav {
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sidebar-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--ink-2, #52635d);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.sidebar-item:hover {
  background: var(--surface-2, #f0eee7);
  color: var(--ink);
}

.sidebar-item.active {
  background: var(--brand-soft, #dce9e1);
  color: var(--brand-strong, #174438);
  font-weight: 700;
}

.sidebar-item.active::before {
  width: 3px;
  height: 14px;
  border-radius: 2px;
  background: var(--brand);
  content: '';
}

.content {
  flex: 1;
  min-width: 0;
}

.vault-loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 80px 24px;
  color: var(--ink-2);
  font-size: 14px;
}

.vault-loading-state__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--brand);
  animation: vault-loading-pulse 1s ease-in-out infinite;
}

@keyframes vault-loading-pulse {
  0%,
  100% {
    opacity: 0.35;
    transform: scale(0.85);
  }
  50% {
    opacity: 1;
    transform: scale(1.1);
  }
}

.vault-offline-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 22px;
  padding: 12px 16px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface-2, #f0eee7);
  color: var(--ink-2);
  font-size: 13px;
  line-height: 1.5;
}

.vault-offline-banner button {
  flex-shrink: 0;
  padding: 7px 14px;
  border: 1px solid var(--brand);
  border-radius: 8px;
  background: var(--brand);
  color: #fff;
  font: inherit;
  font-size: 12px;
  font-weight: 590;
  cursor: pointer;
}

.vault-offline-banner button:hover {
  background: var(--brand-strong);
}

.eyebrow {
  display: flex;
  gap: 8px;
  align-items: center;
  color: var(--brand);
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.13em;
}

.eyebrow::before {
  width: 22px;
  height: 1px;
  background: var(--brand);
  content: '';
}

.intro {
  display: flex;
  justify-content: space-between;
  gap: 28px;
  align-items: flex-end;
  margin-bottom: 25px;
}

.intro h2 {
  margin: 10px 0 0;
  font: 600 31px Georgia, 'Songti SC', serif;
  letter-spacing: -0.04em;
  color: var(--ink);
}

.intro p {
  max-width: 355px;
  margin: 0;
  color: var(--ink-2);
  font-size: 12px;
  line-height: 1.65;
}

@media (max-width: 860px) {
  .notes-page {
    padding: 24px 20px 56px;
  }

  .notes-layout {
    gap: 20px;
  }

  .sidebar {
    width: 104px;
  }
}
</style>
