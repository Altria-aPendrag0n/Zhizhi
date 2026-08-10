<template>
  <div class="note-detail-page">
    <div class="detail-layout">
      <!-- 主体 -->
      <main class="detail-main">
        <NoteDetail
          :note="currentNote"
          :loading="isLoading"
          @update="handleNoteUpdate"
          @open-source="handleOpenSource"
          @extract-note="handleExtractNote"
          @create-branch="handleCreateBranch"
        />
        <button v-if="currentNote" class="delete-note-button" type="button" @click="handleDeleteNote">
          删除笔记
        </button>
      </main>

      <!-- 侧边栏：反链面板 -->
      <aside class="detail-sidebar">
        <Backlinks
          :backlinks="backlinks"
          :loading="loadingBacklinks"
          @navigate="handleNavigate"
        />
      </aside>
    </div>

    <!-- 关系图：展示所有笔记节点与全部联系（全量模式，不限制深度） -->
    <div v-if="currentNote && noteStore.notes.length > 0" class="detail-graph">
      <LocalGraph :note-id="currentNote.path" :depth="Infinity" />
    </div>

    <ExtractNoteDialog
      :visible="extractDialog.visible"
      :title="extractDialog.title"
      :highlighted-text="extractDialog.highlightedText"
      :loading="extractDialog.loading"
      :saving="extractDialog.saving"
      :error="extractDialog.error"
      @close="cancelExtract"
      @confirm="confirmExtract"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, onBeforeUnmount, inject, reactive } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useNoteStore } from '../stores/notes'
import { useVaultStore } from '../stores/vault'
import { useSessionStore } from '../stores/session'
import { useSettingsStore } from '../stores/settings'
import { extractNote } from '../api/skills/extract-note'
import { createProvider } from '../api/provider-factory'
import { useToast } from '../composables/useToast'
import { useBusyStore } from '../stores/busy'
import type { Note, Session, ExtractedNote } from '../types'
import { getSessionFilePath } from '../utils/session-serializer'
import { loadBranchContext, parseMessages } from '../utils/branch-context'
import { resolveMessageIndex } from '../utils/message-locator'
import { readFile } from '../utils/vault-fs'
import { parseFrontmatter } from '../parser/frontmatter'
import { parseWikiLinks, resolveWikiLinkTarget } from '../parser/wikilink'
import NoteDetail from '../components/notes/NoteDetail.vue'
import Backlinks, { type BacklinkEntry } from '../components/editor/Backlinks.vue'
import LocalGraph from '../components/graph/LocalGraph.vue'
import ExtractNoteDialog from '../components/notes/ExtractNoteDialog.vue'

const route = useRoute()
const router = useRouter()
const noteStore = useNoteStore()
const vaultStore = useVaultStore()
const sessionStore = useSessionStore()
const settingsStore = useSettingsStore()
const toast = useToast()
const busyStore = useBusyStore()
const updateNoteBreadcrumbTitle = inject<(title: string) => void>('updateNoteBreadcrumbTitle')

const isLoading = ref(false)
const currentNote = ref<Note | null>(null)
const backlinks = ref<BacklinkEntry[]>([])
const loadingBacklinks = ref(false)

/** 摘录为笔记弹窗状态 */
const extractDialog = reactive({
  visible: false,
  loading: false,
  saving: false,
  title: '',
  highlightedText: '',
  error: '',
  draft: null as ExtractedNote | null,
})

const noteId = computed(() => {
  return decodeURIComponent((route.params.id as string) || '')
})

async function loadNote() {
  if (!noteId.value) return
  isLoading.value = true
  try {
    const note = await noteStore.loadNote(noteId.value)
    currentNote.value = note
    if (note) updateNoteBreadcrumbTitle?.(note.title)
    await loadBacklinks()
  } catch (e) {
    console.error('加载笔记失败:', e)
  } finally {
    isLoading.value = false
  }
}

async function loadBacklinks() {
  if (!noteId.value) return
  loadingBacklinks.value = true
  try {
    const targetNote = currentNote.value || await noteStore.loadNote(noteId.value)
    if (!targetNote) {
      backlinks.value = []
      return
    }

    const entries = await Promise.all(noteStore.notes
      .filter((note) => note.path !== targetNote.path)
      .map(async (note) => ({ meta: note, note: await noteStore.loadNote(note.path) })))

    backlinks.value = entries.flatMap(({ meta, note }) => {
      if (!note || !parseWikiLinks(note.content).some((link) => resolveWikiLinkTarget(link, noteStore.notes)?.path === targetNote.path)) {
        return []
      }
      const line = note.content.split('\n').find((item) => parseWikiLinks(item).some((link) => resolveWikiLinkTarget(link, noteStore.notes)?.path === targetNote.path)) || ''
      return [{ sourcePath: meta.path, title: meta.title, context: line }]
    })
  } finally {
    loadingBacklinks.value = false
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

function handleNoteUpdate(updated: Note) {
  currentNote.value = updated
  updateNoteBreadcrumbTitle?.(updated.title)
  if (saveTimer) clearTimeout(saveTimer)

  saveTimer = setTimeout(async () => {
    const savedNote = await noteStore.updateNote(updated)
    if (!savedNote) {
      toast.error('保存笔记失败')
      return
    }
    currentNote.value = savedNote
  }, 300)
}

function handleOpenSource(source: NonNullable<Note['source']>) {
  console.log('Open source:', source.session)
}

async function handleDeleteNote() {
  if (!currentNote.value || !window.confirm(`确定要删除“${currentNote.value.title}”吗？此操作无法撤销。`)) return

  if (!(await noteStore.deleteNote(currentNote.value.path))) {
    toast.error('删除 Vault 笔记文件失败，未删除本地数据')
    return
  }

  toast.success('已删除笔记')
  router.replace('/notes')
}

async function handleExtractNote(highlightedText: string) {
  if (!currentNote.value || !vaultStore.vaultPath) {
    toast.error('请先打开 Vault')
    return
  }

  // 标题/标签均不允许 LLM 生成时，摘录完全不调用 LLM，无需 API Key
  const needLLM = settingsStore.autoGenerateNoteTitle || settingsStore.autoGenerateNoteTags
  const config = settingsStore.getProviderConfig()
  if (needLLM && !config.apiKey) {
    toast.error('请先在设置页面配置 API Key')
    router.push('/settings')
    return
  }

  extractDialog.highlightedText = highlightedText
  extractDialog.error = ''
  extractDialog.draft = null
  extractDialog.visible = true
  extractDialog.loading = true

  try {
    // 先由 LLM 生成建议标题与内容，预填到弹窗，用户可修改
    busyStore.start('AI 正在提炼笔记…')
    let draft: ExtractedNote
    try {
      draft = await extractNote(
        highlightedText,
        `笔记标题: ${currentNote.value.title}\n\n${currentNote.value.content}`,
        createProvider(config),
        undefined,
        {
          generateTitle: settingsStore.autoGenerateNoteTitle,
          generateTags: settingsStore.autoGenerateNoteTags,
        },
      )
    } finally {
      busyStore.stop()
    }
    extractDialog.draft = draft
    extractDialog.title = draft.title
  } catch (e) {
    extractDialog.visible = false
    toast.error(e instanceof Error ? e.message : '笔记提炼失败')
  } finally {
    extractDialog.loading = false
  }
}

async function confirmExtract(title: string) {
  if (!extractDialog.draft || !currentNote.value) return
  extractDialog.saving = true
  extractDialog.error = ''
  try {
    const config = settingsStore.getProviderConfig()
    const highlightedText = extractDialog.highlightedText

    let note = extractDialog.draft
    if (title.trim() !== extractDialog.draft.title.trim()) {
      // 用户修改了标题：用用户标题重新生成，确保描述等内容与标题一致
      busyStore.start('AI 正在重新提炼笔记…')
      try {
        note = await extractNote(
          highlightedText,
          `笔记标题: ${currentNote.value.title}\n\n${currentNote.value.content}`,
          createProvider(config),
          title,
          {
            generateTitle: settingsStore.autoGenerateNoteTitle,
            generateTags: settingsStore.autoGenerateNoteTags,
          },
        )
      } finally {
        busyStore.stop()
      }
    } else {
      note = { ...extractDialog.draft, title: title.trim() }
    }

    const path = await noteStore.saveNote(vaultStore.vaultPath, note, currentNote.value.path, highlightedText)
    if (!path) throw new Error('笔记保存失败')

    extractDialog.visible = false
    extractDialog.draft = null
    toast.success('已提炼并保存为原子笔记')
  } catch (e) {
    extractDialog.error = e instanceof Error ? e.message : '笔记提炼失败'
  } finally {
    extractDialog.saving = false
  }
}

function cancelExtract() {
  extractDialog.visible = false
  extractDialog.draft = null
}

async function handleCreateBranch(highlightedText: string) {
  if (!currentNote.value || !vaultStore.vaultPath) {
    toast.error('请先打开 Vault')
    return
  }

  const branchTitle = highlightedText.replace(/\s+/g, ' ').trim().slice(0, 30) || '笔记分支'
  const sourceSession = currentNote.value.source?.session
  let parentSessionFile: string | undefined
  let parentSession: Session
  let forkMessageIndex = 0

  if (sourceSession) {
    try {
      const sourceContent = await readFile(sourceSession)
      const { meta, body } = parseFrontmatter(sourceContent)
      const sourceMessages = parseMessages(body, Number.MAX_SAFE_INTEGER)
      const sessionId = typeof meta.session_id === 'string' ? meta.session_id : ''
      if (!sessionId || sourceMessages.length === 0) throw new Error('无效来源会话')

      forkMessageIndex = resolveMessageIndex(highlightedText, sourceMessages, null)
      // 文本匹配失败时沿用旧行为：定位到来源会话最后一条消息
      if (forkMessageIndex === -1) {
        forkMessageIndex = sourceMessages.length - 1
      }
      parentSessionFile = sourceSession
      parentSession = {
        id: sessionId,
        title: typeof meta.title === 'string' ? meta.title : currentNote.value.title,
        created: typeof meta.created === 'string' ? meta.created : new Date().toISOString(),
        parent_session: typeof meta.parent_session === 'string' ? meta.parent_session : null,
        fork_point: typeof meta.fork_point === 'string' ? meta.fork_point : null,
        tags: Array.isArray(meta.tags) ? meta.tags.filter((tag): tag is string => typeof tag === 'string') : [],
        messages: await loadBranchContext(sourceSession, forkMessageIndex),
      }
    } catch {
      toast.error('无法读取笔记来源会话')
      return
    }
  } else {
    const rootSessionId = `note_root_${Date.now()}`
    parentSessionFile = getSessionFilePath(vaultStore.vaultPath, rootSessionId)
    parentSession = {
      id: rootSessionId,
      title: `笔记根会话：${currentNote.value.title}`,
      created: new Date().toISOString(),
      parent_session: null,
      fork_point: null,
      tags: [],
      messages: [{
        role: 'assistant',
        content: `来源笔记：[[${currentNote.value.path}|${currentNote.value.title}]]\n\n划线内容：\n> ${highlightedText}`,
      }],
    }
  }

  const branchId = await sessionStore.createBranchInVault(
    vaultStore.vaultPath,
    parentSession,
    forkMessageIndex,
    branchTitle,
    parentSessionFile,
    highlightedText,
  )
  if (!branchId) {
    toast.error('创建分支失败')
    return
  }

  await vaultStore.refreshFileTree()
  router.push({
    name: 'branch-chat',
    params: { sessionId: parentSession.id, branchId },
    query: { fork_index: '0' },
  })
}

function handleNavigate(path: string) {
  router.push(`/notes/${encodeURIComponent(path)}`)
}

watch(
  () => route.params.id,
  () => {
    loadNote()
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  if (saveTimer) clearTimeout(saveTimer)
})
</script>

<style scoped>
.note-detail-page {
  height: 100%;
  overflow-y: auto;
  background: var(--surface);
}

.detail-layout {
  display: flex;
  min-height: 100%;
}

.detail-main {
  flex: 1;
  min-width: 0;
  padding: 34px 48px 64px;
}

.delete-note-button {
  display: block;
  margin: 24px auto 0;
  padding: 8px 12px;
  border: 1px solid #d66a63;
  border-radius: 7px;
  background: transparent;
  color: #c2413b;
  font-size: 12px;
  cursor: pointer;
}

.delete-note-button:hover {
  background: #fff0ee;
}

.detail-sidebar {
  width: 310px;
  flex-shrink: 0;
  background: #f0eee7;
  border-left: 1px solid var(--line);
  overflow-y: auto;
}

.detail-graph {
  padding: 24px 48px 48px;
  border-top: 1px solid var(--line);
  background: var(--surface);
}

@media (max-width: 860px) {
  .detail-main {
    padding: 24px 20px 56px;
  }

  .detail-layout {
    flex-direction: column;
  }

  .detail-sidebar {
    width: 100%;
    flex-shrink: 0;
    border-left: 0;
    border-top: 1px solid var(--line);
  }
}
</style>