<template>
  <AppShell>
    <template #rail>
      <ProjectRail
        :projects="projects"
        :active-id="activeProjectId"
        @select="handleProjectSelect"
        @add="handleProjectAdd"
      />
    </template>
    <template #threads>
      <ThreadList
        project-name="知枝学习"
        :threads="threads"
        :active-id="activeThreadId"
        :thread-count="threadCount"
        :note-count="noteCount"
        @select="handleThreadSelect"
        @new-thread="handleNewThread"
      />
    </template>
    <template #toolbar>
      <TopBar
        :breadcrumbs="breadcrumbs"
        @settings="handleSettings"
      />
    </template>
    <template #main>
      <router-view />
    </template>
  </AppShell>
  <!-- 全局 Toast -->
  <Toast />
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import AppShell from './components/shell/AppShell.vue'
import ProjectRail from './components/shell/ProjectRail.vue'
import ThreadList from './components/shell/ThreadList.vue'
import TopBar from './components/shell/TopBar.vue'
import Toast from './components/common/Toast.vue'
import { useToast } from './composables/useToast'
import type { Project } from './components/shell/ProjectRail.vue'
import type { Thread } from './components/shell/ThreadList.vue'
import { getEmbeddingEngine } from './embedding/engine'

const router = useRouter()
const toast = useToast()

const projects = ref<Project[]>([
  { id: '1', name: '知枝学习' },
  { id: '2', name: '资料库' },
])
const activeProjectId = ref('1')

const threads = ref<Thread[]>([
  { id: '1', title: '工作记忆的边界', meta: '正在学习' },
  { id: '2', title: '间隔重复笔记', meta: '昨天' },
  { id: '3', title: '形成性测验', meta: '7月24日' },
])
const activeThreadId = ref<string | null>('1')

const threadCount = computed(() => threads.value.length)
const noteCount = computed(() => 0)

const breadcrumbs = ref(['学习会话', '工作记忆的边界'])

function handleProjectSelect(id: string) {
  activeProjectId.value = id
}

function handleProjectAdd() {
  toast.info('新建项目功能即将上线')
}

function handleThreadSelect(id: string) {
  activeThreadId.value = id
  router.push('/chat')
}

function handleNewThread() {
  router.push('/chat')
  toast.success('已创建新会话')
}

function handleSettings() {
  router.push('/settings')
}

/** 键盘快捷键处理 */
function handleKeydown(e: KeyboardEvent) {
  const isCtrl = e.ctrlKey || e.metaKey

  // Ctrl+N: 新建会话
  if (isCtrl && e.key === 'n') {
    e.preventDefault()
    handleNewThread()
  }
  // Ctrl+, 或 Ctrl+Shift+S: 打开设置
  if (isCtrl && e.key === ',') {
    e.preventDefault()
    handleSettings()
  }
  // Ctrl+H: 学习总览
  if (isCtrl && e.key === 'h') {
    e.preventDefault()
    router.push('/hub')
  }
  // Ctrl+B: 查看笔记
  if (isCtrl && e.key === 'b') {
    e.preventDefault()
    router.push('/notes')
  }
}

// 后台初始化 Embedding 引擎（不阻塞 UI）
onMounted(() => {
  const engine = getEmbeddingEngine()
  engine.initialize().catch((e) => {
    console.warn('Embedding 引擎初始化失败（非关键功能）:', e)
  })

  // 注册全局键盘快捷键
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>