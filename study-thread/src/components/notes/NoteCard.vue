<template>
  <article
    class="note-card"
    :class="{ selected: isSelected }"
    @click="$emit('select', note.path)"
    @contextmenu.prevent="$emit('contextmenu', $event)"
  >
    <div class="note-top">
      <span class="note-kind">{{ typeLabel }}</span>
      <span v-if="formattedDate" class="note-created">{{ formattedDate }}</span>
    </div>
    <h3>{{ note.title }}</h3>
    <p class="note-body">{{ note.proposition }}</p>
    <div class="note-footer">
      <div class="tags">
        <span v-for="tag in note.tags" :key="tag" class="tag">{{ tag }}</span>
      </div>
      <button v-if="note.source" class="branch-link" @click.stop="$emit('openSource', note.source)">
        查看来源会话 →
      </button>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { NoteMeta } from '../../types'
import { formatNoteShortDate } from '../../utils/date'

const props = defineProps<{
  note: NoteMeta
  isSelected?: boolean
}>()

defineEmits<{
  select: [path: string]
  openSource: [source: NonNullable<NoteMeta['source']>]
  contextmenu: [event: MouseEvent]
}>()

const typeLabels: Record<string, string> = {
  concept: '概念卡',
  method: '方法卡',
  fact: '事实卡',
  question: '问题卡',
}

const typeLabel = computed(() => typeLabels[props.note.type] || '笔记')

const formattedDate = computed(() => formatNoteShortDate(props.note.updated))
</script>

<style scoped>
.note-card {
  position: relative;
  padding: 20px 21px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #fffefa;
  box-shadow: 0 1px 2px rgba(20, 39, 33, 0.04);
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
}

.note-card:hover {
  border-color: #88ad9d;
  box-shadow: 0 4px 12px rgba(25, 49, 43, 0.06);
  transform: translateY(-1px);
}

.note-card.selected {
  border-color: #88ad9d;
  box-shadow: 0 7px 20px rgba(25, 49, 43, 0.08);
}

.note-card.selected::before {
  position: absolute;
  top: 20px;
  left: -1px;
  width: 3px;
  height: 54px;
  background: var(--brand);
  border-radius: 0 2px 2px 0;
  content: '';
}

.note-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.note-kind {
  color: var(--brand);
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.12em;
}

.note-created {
  color: var(--ink-3, #87928d);
  font-size: 10px;
}

.note-card h3 {
  margin: 0 0 9px;
  font: 600 21px Georgia, 'Songti SC', serif;
  letter-spacing: -0.02em;
  color: var(--ink);
}

.note-body {
  margin: 0;
  color: var(--ink-2, #52635d);
  font-size: 13px;
  line-height: 1.75;
}

.note-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 12px;
  margin-top: 12px;
  border-top: 1px solid var(--line);
}

.tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.tag {
  padding: 4px 7px;
  border-radius: 999px;
  background: var(--brand-soft, #dce9e1);
  color: var(--brand-strong, #174438);
  font-size: 10px;
}

.branch-link {
  border: 0;
  background: transparent;
  color: var(--brand);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}

.branch-link:hover {
  text-decoration: underline;
}
</style>