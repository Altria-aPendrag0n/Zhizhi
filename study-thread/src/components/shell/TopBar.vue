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
      <PanelLeft v-else-if="showCrumbIcon !== false" :size="18" :stroke-width="1.75" class="top-bar__crumb-icon" />
      <template v-for="(crumb, index) in breadcrumbs" :key="index">
        <span v-if="index > 0" aria-hidden="true" class="top-bar__separator">/</span>
        <span
          v-if="index !== breadcrumbs.length - 1"
          class="top-bar__crumb"
        >
          {{ crumb }}
        </span>
        <span
          v-else
          class="top-bar__crumb top-bar__crumb--current"
          :class="{ 'top-bar__crumb--brand': brandTitle }"
        >
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
              v-if="editable"
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
      <button
        v-if="showCollapseThreads"
        class="top-bar__icon-btn"
        type="button"
        :aria-label="threadsCollapsed ? '展开会话栏' : '收起会话栏'"
        :title="threadsCollapsed ? '展开会话栏' : '收起会话栏'"
        @click="$emit('toggle-collapse-threads')"
      >
        <PanelLeft v-if="!threadsCollapsed" :size="18" :stroke-width="1.75" />
        <PanelRight v-else :size="18" :stroke-width="1.75" />
      </button>
      <button class="top-bar__icon-btn" type="button" aria-label="搜索" @click="$emit('search')">
        <Search :size="18" :stroke-width="1.75" />
      </button>
      <button
        class="top-bar__icon-btn"
        type="button"
        aria-label="设置"
        title="设置"
        @click="$emit('settings')"
      >
        <Settings :size="18" :stroke-width="1.75" />
      </button>
      <div ref="menuAnchorRef" class="top-bar__menu-anchor">
        <button
          class="top-bar__icon-btn"
          type="button"
          aria-label="更多操作"
          aria-haspopup="menu"
          :aria-expanded="menuOpen"
          @click="toggleMenu"
        >
          <Ellipsis :size="18" :stroke-width="1.75" />
        </button>
        <Teleport to="body">
          <div
            v-if="menuOpen"
            class="top-bar__dropdown"
            role="menu"
            :style="dropdownStyle"
            @click.stop
          >
            <template v-for="item in menuItems" :key="item.id">
              <div v-if="item.separator" class="top-bar__dropdown-sep" role="separator" />
              <button
                v-else
                type="button"
                role="menuitem"
                class="top-bar__dropdown-item"
                :class="{ 'is-danger': item.danger }"
                @click="handleAction(item.id)"
              >
                <span>{{ item.label }}</span>
                <span v-if="item.shortcut" class="top-bar__dropdown-shortcut">{{ item.shortcut }}</span>
              </button>
            </template>
          </div>
        </Teleport>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowLeft, PanelLeft, PanelRight, Search, Ellipsis, Settings, Pencil } from '@lucide/vue'

/** 顶栏"更多操作"下拉菜单项 */
export interface TopBarMenuItem {
  id: string
  label?: string
  shortcut?: string
  danger?: boolean
  /** 分隔线（忽略 label 等字段） */
  separator?: boolean
}

const props = defineProps<{
  breadcrumbs: string[]
  /** 是否为品牌首标题（主界面）：当前标题以品牌字体/颜色放大展示 */
  brandTitle?: boolean
  /** 是否显示返回按钮（笔记/会话/设置界面） */
  showBack?: boolean
  /** 小窗口模式下是否显示"展开会话列表"按钮（替换装饰性 PanelLeft 图标） */
  showThreadsToggle?: boolean
  /** 是否显示面包屑前置的装饰性 PanelLeft 图标（主界面等无需边栏语义的界面可隐藏） */
  showCrumbIcon?: boolean
  /** 会话界面是否显示"收起/展开会话栏"按钮（路由未隐藏且非小窗口模式） */
  showCollapseThreads?: boolean
  /** 会话栏当前是否被手动收起（决定收起按钮图标方向） */
  threadsCollapsed?: boolean
  /** "更多操作"下拉菜单项（由外层按当前界面提供） */
  menuItems?: TopBarMenuItem[]
  /** 最后一个面包屑（当前标题）是否可编辑（仅会话界面为 true；静态界面名不可编辑） */
  editable?: boolean
}>()

const emit = defineEmits<{
  search: []
  settings: []
  back: []
  'toggle-threads': []
  'toggle-collapse-threads': []
  'update-title': [title: string]
  'menu-action': [id: string]
}>()

const route = useRoute()

/** 下拉菜单开关与定位 */
const menuOpen = ref(false)
const menuAnchorRef = ref<HTMLElement>()
const dropdownStyle = ref<{ top: string; left: string }>({ top: '0px', left: '0px' })

function toggleMenu() {
  if (menuOpen.value) {
    menuOpen.value = false
    return
  }
  const rect = menuAnchorRef.value?.getBoundingClientRect()
  if (rect) {
    // 固定定位对齐按钮右下角：菜单宽 172px，right 与按钮对齐
    dropdownStyle.value = {
      top: `${rect.bottom + 6}px`,
      left: `${rect.right - 172}px`,
    }
  }
  menuOpen.value = true
}

function handleAction(id: string) {
  menuOpen.value = false
  emit('menu-action', id)
}

/** 路由切换后关闭菜单（避免残留到下一界面） */
watch(
  () => route.fullPath,
  () => {
    menuOpen.value = false
  },
)

function handleDocumentPointerDown(event: PointerEvent) {
  const target = event.target
  if (
    menuOpen.value &&
    target instanceof Node &&
    !menuAnchorRef.value?.contains(target) &&
    !(target instanceof Element && target.closest('.top-bar__dropdown'))
  ) {
    menuOpen.value = false
  }
}

function handleDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') menuOpen.value = false
}

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown)
  document.addEventListener('keydown', handleDocumentKeydown)
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
  document.removeEventListener('keydown', handleDocumentKeydown)
})

const isEditing = ref(false)
const draftTitle = ref('')
const titleInput = ref<HTMLInputElement>()

const currentTitle = () => props.breadcrumbs[props.breadcrumbs.length - 1] ?? ''

function startEditing() {
  draftTitle.value = currentTitle()
  isEditing.value = true
  nextTick(() => {
    const el = titleInput.value
    if (el && typeof el.select === 'function') el.select()
  })
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

/* 品牌首标题（主界面「知枝」）：衬线大字 + 品牌绿 + 柔光阴影，呼应页面 hero 标题 */
.top-bar__crumb--brand {
  font-family: Georgia, 'Songti SC', serif;
  font-size: 30px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--brand);
  text-shadow:
    0 2px 16px rgba(36, 92, 77, 0.3),
    0 1px 2px rgba(36, 92, 77, 0.14);
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

.top-bar__menu-anchor {
  display: inline-flex;
}

.top-bar__dropdown {
  position: fixed;
  z-index: 1000;
  width: 172px;
  padding: 5px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface, #fffefa);
  box-shadow: 0 8px 28px rgba(20, 39, 33, 0.16);
}

.top-bar__dropdown-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--ink);
  text-align: left;
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
}

.top-bar__dropdown-item:hover {
  background: var(--surface-2, #f0eee7);
}

.top-bar__dropdown-item.is-danger {
  color: #c2413b;
}

.top-bar__dropdown-shortcut {
  flex-shrink: 0;
  color: var(--ink-3, #9aa39d);
  font-size: 11px;
}

.top-bar__dropdown-sep {
  height: 1px;
  margin: 5px 6px;
  background: var(--line, #e4e0d6);
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
