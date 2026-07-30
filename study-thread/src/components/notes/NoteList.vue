<template>
  <div class="note-list-container">
    <!-- 工具栏 -->
    <div class="notes-toolbar">
      <span>{{ filteredNotes.length }} 张笔记</span>
      <div class="toolbar-actions">
        <select v-model="sortBy" class="filter-select">
          <option value="updated">按最近更新</option>
          <option value="created">按创建时间</option>
          <option value="title">按标题</option>
        </select>
        <select v-model="filterType" class="filter-select">
          <option value="">全部类型</option>
          <option value="concept">概念卡</option>
          <option value="method">方法卡</option>
          <option value="fact">事实卡</option>
          <option value="question">问题卡</option>
        </select>
      </div>
    </div>

    <!-- 搜索框 -->
    <div class="search-bar">
      <input
        v-model="searchQuery"
        type="text"
        class="search-input"
        placeholder="搜索笔记标题或标签..."
      />
    </div>

    <!-- 笔记列表 -->
    <div v-if="filteredNotes.length > 0" class="note-stack">
      <NoteCard
        v-for="note in filteredNotes"
        :key="note.path"
        :note="note"
        :is-selected="selectedPath === note.path"
        @select="$emit('select', $event)"
        @open-source="$emit('openSource', $event)"
      />
    </div>

    <!-- 空状态 -->
    <div v-else class="empty-state">
      <p v-if="notes.length === 0">还没有笔记，从学习对话中摘录你的第一条笔记吧</p>
      <p v-else>没有匹配的笔记，试试调整搜索条件</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { NoteMeta } from '../../types'
import NoteCard from './NoteCard.vue'

const props = defineProps<{
  notes: NoteMeta[]
  selectedPath?: string
}>()

defineEmits<{
  select: [path: string]
  openSource: [source: NonNullable<NoteMeta['source']>]
}>()

const sortBy = ref<'updated' | 'created' | 'title'>('updated')
const filterType = ref('')
const searchQuery = ref('')

const filteredNotes = computed(() => {
  let result = [...props.notes]

  // 类型筛选
  if (filterType.value) {
    result = result.filter((n) => n.type === filterType.value)
  }

  // 搜索
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.trim().toLowerCase()
    result = result.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.tags.some((t) => t.toLowerCase().includes(q)),
    )
  }

  // 排序
  result.sort((a, b) => {
    switch (sortBy.value) {
      case 'created':
        return a.created.localeCompare(b.created)
      case 'title':
        return a.title.localeCompare(b.title)
      case 'updated':
      default:
        return b.updated.localeCompare(a.updated)
    }
  })

  return result
})
</script>

<style scoped>
.note-list-container {
  max-width: 830px;
  margin: 0 auto;
}

.notes-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 0;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  color: var(--ink-2);
  font-size: 11px;
}

.toolbar-actions {
  display: flex;
  gap: 8px;
}

.filter-select {
  padding: 5px 9px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--brand);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  outline: none;
}

.search-bar {
  margin: 14px 0;
}

.search-input {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  color: var(--ink);
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s;
}

.search-input:focus {
  border-color: var(--brand);
}

.search-input::placeholder {
  color: var(--ink-3);
}

.note-stack {
  display: grid;
  gap: 14px;
  margin-top: 18px;
}

.empty-state {
  padding: 60px 0;
  text-align: center;
  color: var(--ink-2);
  font-size: 13px;
  line-height: 1.8;
}
</style>