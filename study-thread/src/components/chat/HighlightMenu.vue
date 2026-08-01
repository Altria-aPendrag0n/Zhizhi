<template>
  <Teleport to="body">
    <div
      v-if="visible"
      ref="menuRef"
      class="highlight-menu"
      :style="menuStyle"
      @click.stop
    >
      <div class="highlight-menu__arrow" />
      <button class="highlight-menu__item" @click="handleExtractNote">
        <FileText :size="15" />
        <span>摘录为笔记</span>
      </button>
      <button class="highlight-menu__item" @click="handleCreateBranch">
        <GitBranch :size="15" />
        <span>创建分支</span>
      </button>
      <button class="highlight-menu__item" @click="handleCopy">
        <Copy :size="15" />
        <span>复制</span>
      </button>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { FileText, GitBranch, Copy } from '@lucide/vue'

const props = defineProps<{
  visible: boolean
  x: number
  y: number
  highlightedText: string
}>()

const emit = defineEmits<{
  close: []
  'extract-note': [text: string]
  'create-branch': [text: string]
  copy: [text: string]
}>()

const menuRef = ref<HTMLElement | null>(null)

const menuStyle = computed(() => ({
  left: `${props.x}px`,
  top: `${props.y}px`,
}))

function handleExtractNote() {
  if (props.highlightedText) emit('extract-note', props.highlightedText)
  emit('close')
}

function handleCreateBranch() {
  if (props.highlightedText) emit('create-branch', props.highlightedText)
  emit('close')
}

function handleCopy() {
  if (props.highlightedText) {
    navigator.clipboard.writeText(props.highlightedText).catch(console.error)
    emit('copy', props.highlightedText)
  }
  emit('close')
}

function handleClickOutside(e: MouseEvent) {
  if (menuRef.value && !menuRef.value.contains(e.target as Node)) {
    emit('close')
  }
}

function handleEsc(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('close')
  }
}

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside)
  document.addEventListener('keydown', handleEsc)
})

onUnmounted(() => {
  document.removeEventListener('mousedown', handleClickOutside)
  document.removeEventListener('keydown', handleEsc)
})
</script>

<style scoped>
.highlight-menu {
  position: fixed;
  z-index: 1000;
  display: flex;
  gap: 2px;
  padding: 4px;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 10px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  transform: translate(-50%, -120%);
  animation: fadeIn 0.15s ease;
}

.highlight-menu__arrow {
  position: absolute;
  bottom: -6px;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-top: 6px solid var(--line);
}

.highlight-menu__arrow::after {
  content: '';
  position: absolute;
  top: -7px;
  left: -5px;
  width: 0;
  height: 0;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-top: 5px solid #fff;
}

.highlight-menu__item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--ink);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.1s;
}

.highlight-menu__item:hover {
  background: var(--brand-soft);
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translate(-50%, -110%);
  }
  to {
    opacity: 1;
    transform: translate(-50%, -120%);
  }
}
</style>
