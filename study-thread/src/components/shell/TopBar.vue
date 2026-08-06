<template>
  <div class="top-bar">
    <div class="top-bar__crumbs">
      <button
        v-if="showBack"
        class="top-bar__back-btn"
        type="button"
        aria-label="返回"
        @click="$emit('back')"
      >
        <ArrowLeft :size="18" :stroke-width="1.75" />
      </button>
      <button
        v-else-if="showThreadsToggle"
        class="top-bar__back-btn"
        type="button"
        aria-label="展开会话列表"
        @click="$emit('toggle-threads')"
      >
        <PanelLeft :size="18" :stroke-width="1.75" />
      </button>
      <PanelLeft v-else :size="18" :stroke-width="1.75" class="top-bar__crumb-icon" />
      <template v-for="(crumb, index) in breadcrumbs" :key="index">
        <span v-if="index > 0" aria-hidden="true" class="top-bar__separator">/</span>
        <span
          v-if="index !== breadcrumbs.length - 1"
          class="top-bar__crumb"
        >
          {{ crumb }}
        </span>
        <span v-else class="top-bar__crumb top-bar__crumb--current">
          <input
            v-if="isEditing"
            ref="titleInput"
            v-model="draftTitle"
            class="top-bar__title-input"
            aria-label="会话标题"
            @blur="saveTitle"
            @keydown.enter.prevent="saveTitle"
            @keydown.escape.prevent="cancelEditing"
          />
          <template v-else>
            <span class="top-bar__title-text">{{ crumb }}</span>
            <button
              class="top-bar__edit-btn"
              type="button"
              aria-label="编辑会话标题"
              @click="startEditing"
            >
              <Pencil :size="14" :stroke-width="1.9" />
            </button>
          </template>
        </span>
      </template>
    </div>
    <div class="top-bar__actions">
      <button class="top-bar__icon-btn" type="button" aria-label="搜索" @click="$emit('search')">
        <Search :size="18" :stroke-width="1.75" />
      </button>
      <button class="top-bar__icon-btn" type="button" aria-label="更多操作" @click="$emit('settings')">
        <Ellipsis :size="18" :stroke-width="1.75" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { ArrowLeft, PanelLeft, Search, Ellipsis, Pencil } from '@lucide/vue'

const props = defineProps<{
  breadcrumbs: string[]
  /** 是否显示返回按钮（笔记/会话/设置界面） */
  showBack?: boolean
  /** 小窗口模式下是否显示"展开会话列表"按钮（替换装饰性 PanelLeft 图标） */
  showThreadsToggle?: boolean
}>()

const emit = defineEmits<{
  search: []
  settings: []
  back: []
  'toggle-threads': []
  'update-title': [title: string]
}>()

const isEditing = ref(false)
const draftTitle = ref('')
const titleInput = ref<HTMLInputElement>()

const currentTitle = () => props.breadcrumbs[props.breadcrumbs.length - 1] ?? ''

function startEditing() {
  draftTitle.value = currentTitle()
  isEditing.value = true
  nextTick(() => titleInput.value?.select())
}

function saveTitle() {
  const title = draftTitle.value.trim()
  const titleBeforeEditing = currentTitle()
  isEditing.value = false
  if (title && title !== titleBeforeEditing) {
    emit('update-title', title)
  }
}

function cancelEditing() {
  isEditing.value = false
}

watch(
  () => currentTitle(),
  () => {
    if (!isEditing.value) {
      draftTitle.value = currentTitle()
    }
  },
)
</script>

<style scoped>
.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
  width: 100%;
}

.top-bar__crumbs {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  color: var(--ink-2);
  font-size: 13px;
}

.top-bar__crumb-icon {
  color: var(--ink-2);
  flex-shrink: 0;
}

.top-bar__crumb {
  min-width: 0;
}

.top-bar__crumb--current {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--ink);
  font-weight: 590;
}

.top-bar__title-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.top-bar__edit-btn {
  display: inline-grid;
  flex-shrink: 0;
  place-items: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  color: var(--ink-3);
  background: transparent;
  cursor: pointer;
  opacity: 0;
  transition: background 0.18s ease, color 0.18s ease, opacity 0.18s ease;
}

.top-bar__crumb--current:hover .top-bar__edit-btn,
.top-bar__edit-btn:focus-visible {
  opacity: 1;
}

.top-bar__edit-btn:hover {
  color: var(--brand);
  background: var(--brand-soft);
}

.top-bar__title-input {
  width: min(280px, 40vw);
  padding: 4px 7px;
  border: 1px solid var(--brand);
  border-radius: 6px;
  outline: none;
  color: var(--ink);
  background: var(--surface);
  font: inherit;
}

.top-bar__separator {
  color: var(--ink-3);
}

.top-bar__actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.top-bar__back-btn {
  display: inline-grid;
  place-items: center;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  color: var(--ink-2);
  background: transparent;
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease;
}

.top-bar__back-btn:hover {
  color: var(--brand);
  background: var(--brand-soft);
}

.top-bar__icon-btn {
  display: inline-grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 8px;
  color: var(--ink-2);
  background: transparent;
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease;
}

.top-bar__icon-btn:hover {
  color: var(--brand);
  background: var(--brand-soft);
}
</style>
