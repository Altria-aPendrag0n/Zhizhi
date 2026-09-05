<template>
  <div class="citation-viewer" @click.self="emit('close')">
    <div class="citation-viewer__panel">
      <div class="citation-viewer__head">
        <span class="citation-viewer__title">{{ source.title }}</span>
        <span v-if="pageLabel" class="citation-viewer__page">{{ pageLabel }}</span>
        <button class="citation-viewer__close" title="关闭" @click="emit('close')">×</button>
      </div>
      <div class="citation-viewer__body">
        <p v-if="loading" class="citation-viewer__hint">正在读取原文…</p>
        <p v-else-if="error" class="citation-viewer__hint is-error">{{ error }}</p>
        <pre v-else class="citation-viewer__text">{{ content }}</pre>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { CitationSource } from '../../types'
import { useVaultStore } from '../../stores/vault'
import { executeReadReference } from '../../api/tools/read-reference'

const props = defineProps<{
  /** 参考资料来源（note 来源不走本组件，直接跳笔记详情） */
  source: CitationSource
}>()

const emit = defineEmits<{ close: [] }>()
const vaultStore = useVaultStore()

const content = ref('')
const loading = ref(false)
const error = ref('')

const pageLabel = computed(() => {
  const from = props.source.pageFrom
  const to = props.source.pageTo
  if (from === undefined || to === undefined) return ''
  return from === to ? `第 ${from + 1} 页` : `第 ${from + 1}-${to + 1} 页`
})

async function load() {
  loading.value = true
  error.value = ''
  content.value = ''
  try {
    const args: Record<string, unknown> = { reference_id: props.source.path }
    // pdf 分块命中：读取命中页区间；其余类型默认读全文（工具侧有行数/字符上限）
    const from = props.source.pageFrom
    const to = props.source.pageTo
    if (from !== undefined) args.offset = from
    if (from !== undefined && to !== undefined) {
      args.limit = to - from + 1
    }
    content.value = await executeReadReference(args, { vaultPath: vaultStore.vaultPath || '' })
  } catch {
    error.value = '原文读取失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

watch(() => props.source, load, { immediate: true })
</script>

<style scoped>
.citation-viewer {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: grid;
  place-items: center;
  background: rgba(31, 41, 36, 0.38);
}

.citation-viewer__panel {
  display: flex;
  flex-direction: column;
  width: min(680px, calc(100vw - 80px));
  height: min(76vh, 720px);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  background: #fff;
  overflow: hidden;
}

.citation-viewer__head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 13px 17px;
  border-bottom: 1px solid var(--line);
}

.citation-viewer__title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 650;
  color: var(--ink);
}

.citation-viewer__page {
  flex-shrink: 0;
  color: var(--brand-strong);
  font-size: 12px;
}

.citation-viewer__close {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: var(--ink-2);
  font-size: 17px;
  line-height: 1;
  cursor: pointer;
}

.citation-viewer__close:hover {
  color: var(--ink);
}

.citation-viewer__body {
  flex: 1;
  overflow: auto;
  padding: 16px 20px;
}

.citation-viewer__hint {
  color: var(--ink-2);
  font-size: 13px;
}

.citation-viewer__hint.is-error {
  color: var(--state-error);
}

.citation-viewer__text {
  margin: 0;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.85;
  color: var(--ink);
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
