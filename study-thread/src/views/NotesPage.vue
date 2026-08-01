<template>
  <div class="notes-page">
    <div class="content">
      <section v-if="!vaultStore.vaultPath" class="vault-empty-state">
        <p>请先打开 Vault，资料库会显示其 notes 目录中的笔记。</p>
        <button @click="router.push('/settings')">前往设置</button>
      </section>

      <template v-else>
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
          @select="handleSelectNote"
          @open-source="handleOpenSource"
          @delete="handleDeleteNote"
        />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useNoteStore } from '../stores/notes'
import { useVaultStore } from '../stores/vault'
import { useToast } from '../composables/useToast'
import NoteList from '../components/notes/NoteList.vue'

const router = useRouter()
const noteStore = useNoteStore()
const vaultStore = useVaultStore()
const toast = useToast()
const selectedNotePath = ref<string>()

watch(
  () => vaultStore.vaultPath,
  (vaultPath) => {
    if (vaultPath) noteStore.loadAllNotes(vaultPath)
  },
  { immediate: true },
)

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
</script>

<style scoped>
.notes-page {
  padding: 34px 48px 64px;
  background: var(--surface);
  min-height: 100%;
  overflow-y: auto;
}

.content {
  max-width: 830px;
  margin: 0 auto;
}

.vault-empty-state {
  display: grid;
  justify-items: center;
  gap: 16px;
  padding: 80px 24px;
  color: var(--ink-2);
  text-align: center;
  font-size: 14px;
}

.vault-empty-state button {
  padding: 8px 14px;
  border: 1px solid var(--brand);
  border-radius: 8px;
  background: var(--brand);
  color: #fff;
  cursor: pointer;
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
</style>
