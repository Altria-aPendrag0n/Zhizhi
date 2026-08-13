<template>
  <article
    class="reference-card"
    :class="{ selected: isSelected }"
    @click="$emit('select', reference.path)"
    @contextmenu.prevent="$emit('contextmenu', $event)"
  >
    <div class="ref-top">
      <div class="ref-badges">
        <span class="ref-type" :class="`type-${reference.fileType}`">{{ typeLabel }}</span>
        <span v-if="parseBadge" class="ref-parse" :class="`parse-${reference.parseStatus}`">{{ parseBadge }}</span>
      </div>
      <span v-if="formattedDate" class="ref-updated">{{ formattedDate }}</span>
    </div>
    <h3>{{ reference.title }}</h3>
    <p v-if="reference.description" class="ref-desc">{{ reference.description }}</p>
    <div v-if="reference.parseStatus === 'failed'" class="ref-parse-error">
      <span class="ref-parse-error__text">{{ reference.parseError || '解析失败' }}</span>
      <button class="ref-parse-retry" type="button" @click.stop="$emit('retry-parse', reference.path)">重试</button>
    </div>
    <div v-if="reference.tags.length" class="tags">
      <span v-for="tag in reference.tags" :key="tag" class="tag">{{ tag }}</span>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ReferenceMeta } from '../../types'
import { formatNoteShortDate } from '../../utils/date'

const props = defineProps<{
  reference: ReferenceMeta
  isSelected?: boolean
}>()

defineEmits<{
  select: [path: string]
  contextmenu: [event: MouseEvent]
  'retry-parse': [path: string]
}>()

const typeLabels: Record<string, string> = {
  md: 'MD',
  pdf: 'PDF',
  png: 'PNG',
}

const typeLabel = computed(() => typeLabels[props.reference.fileType] || props.reference.fileType.toUpperCase())

/** 解析状态徽标文本（仅 pdf 显示） */
const parseBadge = computed(() => {
  if (props.reference.fileType !== 'pdf') return ''
  switch (props.reference.parseStatus) {
    case 'pending':
      return '待解析'
    case 'parsing':
      return '解析中…'
    case 'failed':
      return '解析失败'
    case 'parsed':
      return props.reference.pageCount ? `${props.reference.pageCount} 页` : '已解析'
    default:
      return ''
  }
})

const formattedDate = computed(() => formatNoteShortDate(props.reference.updated))
</script>

<style scoped>
.reference-card {
  position: relative;
  padding: 18px 20px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #fffefa;
  box-shadow: 0 1px 2px rgba(20, 39, 33, 0.04);
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
}

.reference-card:hover {
  border-color: #88ad9d;
  box-shadow: 0 4px 12px rgba(25, 49, 43, 0.06);
  transform: translateY(-1px);
}

.reference-card.selected {
  border-color: #88ad9d;
  box-shadow: 0 7px 20px rgba(25, 49, 43, 0.08);
}

.reference-card.selected::before {
  position: absolute;
  top: 20px;
  left: -1px;
  width: 3px;
  height: 46px;
  border-radius: 0 2px 2px 0;
  background: var(--brand);
  content: '';
}

.ref-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.ref-badges {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ref-type {
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
}

/* PDF 解析状态徽标 */
.ref-parse {
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 650;
  letter-spacing: 0.02em;
}

.ref-parse.parse-pending {
  background: #efede7;
  color: var(--ink-3, #87928d);
}

.ref-parse.parse-parsing {
  background: #e3eef9;
  color: #33566e;
  animation: parse-pulse 1.2s ease-in-out infinite;
}

.ref-parse.parse-failed {
  background: #f8e3e0;
  color: #c2413b;
}

.ref-parse.parse-parsed {
  background: var(--brand-soft, #dce9e1);
  color: var(--brand-strong, #174438);
}

@keyframes parse-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.ref-parse-error {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 6px 0 10px;
  padding: 8px 10px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--state-error, #c2413b) 8%, transparent);
}

.ref-parse-error__text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--state-error, #c2413b);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ref-parse-retry {
  flex-shrink: 0;
  padding: 3px 10px;
  border: 1px solid var(--state-error, #c2413b);
  border-radius: 6px;
  background: transparent;
  color: var(--state-error, #c2413b);
  font-size: 11px;
  font-weight: 650;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.ref-parse-retry:hover {
  background: var(--state-error, #c2413b);
  color: #fff;
}

.type-md {
  background: var(--brand-soft, #dce9e1);
  color: var(--brand-strong, #174438);
}

.type-pdf {
  background: #f3e7cf;
  color: #7c5a16;
}

.type-png {
  background: #dde6ef;
  color: #33566e;
}

.ref-updated {
  color: var(--ink-3, #87928d);
  font-size: 10px;
}

.reference-card h3 {
  margin: 0 0 6px;
  font: 600 19px Georgia, 'Songti SC', serif;
  letter-spacing: -0.02em;
  color: var(--ink);
}

.ref-desc {
  margin: 0;
  overflow: hidden;
  color: var(--ink-2, #52635d);
  font-size: 12px;
  line-height: 1.6;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.tag {
  padding: 4px 7px;
  border-radius: 999px;
  background: var(--brand-soft, #dce9e1);
  color: var(--brand-strong, #174438);
  font-size: 10px;
}
</style>
