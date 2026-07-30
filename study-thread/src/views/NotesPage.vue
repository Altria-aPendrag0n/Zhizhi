<template>
  <div class="notes-page">
    <div class="content">
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
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useNoteStore } from '../stores/notes'
import NoteList from '../components/notes/NoteList.vue'

const router = useRouter()
const noteStore = useNoteStore()
const selectedNotePath = ref<string>()

function handleSelectNote(path: string) {
  selectedNotePath.value = path
  router.push(`/notes/${encodeURIComponent(path)}`)
}

function handleOpenSource(source: { session: string; highlight: string }) {
  // 跳转到来源会话（后续任务实现）
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