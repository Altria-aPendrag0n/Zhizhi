<template>
  <AppShell :hide-threads="isNotesRoute">
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
        :project-name="activeProject?.name ?? '知枝学习'"
        :threads="threads"
        :active-id="activeThreadId"
        :thread-count="threadCount"
        :note-count="noteCount"
        :branches="branchesByThread"
        :active-branch-id="activeBranchId"
        @select="handleThreadSelect"
        @rename="handleThreadRename"
        @delete="handleThreadDelete"
        @new-thread="handleNewThread"
        @open-branch="handleOpenBranch"
        @delete-branch="handleDeleteBranch"
      />
    </template>
    <template #toolbar>
      <TopBar
        :breadcrumbs="displayedBreadcrumbs"
        @update-title="handleActiveThreadTitleUpdate"
        @settings="handleSettings"
      />
    </template>
    <template #main>
      <router-view :key="$route.fullPath" />
    </template>
  </AppShell>
  <Toast />
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, provide, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { loadStoredValue, saveStoredValue } from './utils/local-storage'
import AppShell from './components/shell/AppShell.vue'
import ProjectRail from './components/shell/ProjectRail.vue'
import ThreadList from './components/shell/ThreadList.vue'
import TopBar from './components/shell/TopBar.vue'
import Toast from './components/common/Toast.vue'
import { useToast } from './composables/useToast'
import type { Project } from './components/shell/ProjectRail.vue'
import type { Thread } from './components/shell/ThreadList.vue'
import { getEmbeddingEngine } from './embedding/engine'
import { useVaultStore } from './stores/vault'
import { useSessionStore } from './stores/session'
import type { SessionTreeNode } from './utils/session-tree'

const router = useRouter()
const route = useRoute()
const toast = useToast()
const vaultStore = useVaultStore()
const sessionStore = useSessionStore()
const LOCAL_SESSION_LIST_KEY = 'study-thread-session-list'
const LOCAL_THREAD_MESSAGES_KEY = 'study-thread-messages'

const defaultProjects: Project[] = [
  { id: '1', name: '知枝学习' },
  { id: '2', name: '资料库' },
  { id: '3', name: '学习地图' },
]

const defaultProjectThreads: Record<string, Thread[]> = {
  '1': [
    { id: '1', title: '用费曼法拆解一个概念', meta: '12:40' },
    { id: '2', title: '工作记忆的边界', meta: '09:15' },
    { id: '3', title: '间隔重复笔记', meta: '昨天 16:20' },
    { id: '4', title: '形成性测验设计', meta: '7月24日 14:30' },
  ],
  '2': [
    { id: '5', title: '认知科学论文索引', meta: '11:20' },
    { id: '6', title: '机器学习基础', meta: '昨天 09:40' },
  ],
  '3': [
    { id: '7', title: '知识图谱总览', meta: '10:05' },
    { id: '8', title: '概念关系网络', meta: '昨天 18:30' },
  ],
}

type StoredSessionList = {
  projects: Project[]
  projectThreads: Record<string, Thread[]>
  activeProjectId: string
  activeThreadId?: string | null
}

const storedSessionList = loadStoredValue<StoredSessionList>(LOCAL_SESSION_LIST_KEY)
const projectThreads: Record<string, Thread[]> = storedSessionList?.projectThreads ?? defaultProjectThreads
const storedProjects = storedSessionList?.projects?.length ? storedSessionList.projects : defaultProjects
const didMigrateSessionMeta = migrateSessionMeta(projectThreads, loadStoredValue<Record<string, unknown[]>>(LOCAL_THREAD_MESSAGES_KEY) ?? {})
const initialProjectId = '1'
const initialThreads = projectThreads[initialProjectId] ?? []
const initialThreadId = initialThreads[0]?.id ?? null

const projects = ref<Project[]>(storedProjects)
const activeProjectId = ref(initialProjectId)
const threads = ref<Thread[]>([...initialThreads])
const activeThreadId = ref<string | null>(initialThreadId)
const breadcrumbs = ref(initialThreadId ? ['学习会话', initialThreads.find((thread) => thread.id === initialThreadId)?.title ?? ''] : ['学习会话'])
const noteDetailTitle = ref('')

if (didMigrateSessionMeta) {
  saveStoredValue(LOCAL_SESSION_LIST_KEY, {
    projects: storedProjects,
    projectThreads,
    activeProjectId: initialProjectId,
    activeThreadId: initialThreadId,
  })
}

function migrateSessionMeta(projectThreads: Record<string, Thread[]>, threadMessages: Record<string, unknown[]>): boolean {
  let migrated = false

  for (const threads of Object.values(projectThreads)) {
    for (const thread of threads) {
      const normalizedMeta = normalizeThreadMeta(thread.meta)
      if (normalizedMeta !== thread.meta) {
        thread.meta = normalizedMeta
        migrated = true
      }
      if (thread.id.startsWith('new_') && thread.title === '新会话' && !threadMessages[thread.id]?.length) {
        thread.title = '知枝学习'
        migrated = true
      }
    }
  }

  return migrated
}

function normalizeThreadMeta(meta: string): string {
  const time = meta.match(/(?:(?:\d{1,2}月)?\d{1,2}日\s*|(?:今天|昨天)\s*)?\d{1,2}:\d{2}/)?.[0]
  return time?.trim() || new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function saveSessionList() {
  saveStoredValue(LOCAL_SESSION_LIST_KEY, {
    projects: projects.value,
    projectThreads,
    activeProjectId: activeProjectId.value,
    activeThreadId: activeThreadId.value,
  })
}

function removeThreadMessages(threadId: string) {
  const storedMessages = loadStoredValue<Record<string, unknown>>(LOCAL_THREAD_MESSAGES_KEY)
  if (!storedMessages || !(threadId in storedMessages)) return

  delete storedMessages[threadId]
  saveStoredValue(LOCAL_THREAD_MESSAGES_KEY, storedMessages)
}

function syncActiveThread(id: string | null) {
  activeThreadId.value = id
  const thread = id ? threads.value.find((item) => item.id === id) : null
  breadcrumbs.value = thread ? ['学习会话', thread.title] : ['学习会话']
  saveSessionList()
}

const isNotesRoute = computed(() => route.path === '/notes' || route.path.startsWith('/notes/'))
const displayedBreadcrumbs = computed(() => {
  if (route.path === '/notes') return ['资料库']
  if (route.path.startsWith('/notes/')) {
    return ['资料库', noteDetailTitle.value || decodeURIComponent((route.params?.id as string) || '')]
  }
  return breadcrumbs.value
})
const activeProject = computed(() => projects.value.find((project) => project.id === activeProjectId.value) ?? null)
const threadCount = computed(() => threads.value.length)
const noteCount = computed(() => (activeProjectId.value === '1' ? 2 : 0))

/** 每个主会话 → 其顶层分支列表（来自 vault 会话树） */
const branchesByThread = computed<Record<string, SessionTreeNode[]>>(() => {
  const map: Record<string, SessionTreeNode[]> = {}
  for (const thread of threads.value) {
    const branches = sessionStore.getBranches(thread.id)
    if (branches.length > 0) map[thread.id] = branches
  }
  return map
})

/** 当前激活的分支 id（位于分支会话页时） */
const activeBranchId = computed(() =>
  route.name === 'branch-chat' ? (route.params.branchId as string) : null,
)

function updateThreadTitle(threadId: string, title: string) {
  const normalizedTitle = title.trim()
  const projectList = projectThreads[activeProjectId.value]
  if (!normalizedTitle || !projectList) return

  const thread = projectList.find((item) => item.id === threadId)
  if (!thread) return

  thread.title = normalizedTitle
  thread.meta = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
  threads.value = [...projectList]
  if (activeThreadId.value === threadId) {
    breadcrumbs.value = ['学习会话', normalizedTitle]
  }
  saveSessionList()
}

provide('updateThreadTitle', updateThreadTitle)
provide('updateNoteBreadcrumbTitle', (title: string) => {
  noteDetailTitle.value = title
})

watch(
  () => route.path,
  (path) => {
    if (!path.startsWith('/notes/')) noteDetailTitle.value = ''
  },
)

function getProjectRoute(projectId: string, threadId: string | null) {
  if (projectId === '2') {
    return { path: '/notes' }
  }
  if (projectId === '3') {
    return { path: '/hub', query: threadId ? { thread: threadId } : {} }
  }
  return { path: '/chat', query: threadId ? { thread: threadId } : {} }
}

function handleProjectSelect(id: string) {
  const currentThreads = projectThreads[id] ?? []
  const nextThreadId = currentThreads[0]?.id ?? null
  const targetRoute = getProjectRoute(id, nextThreadId)

  if (activeProjectId.value === id) {
    // 已在此项目：路由偏离目标时修正；资料库（项目2）若残留 tab=references 等 query，
    // 也修正回默认笔记视图，避免点击资料库仍停留在旧视图
    const needsQueryReset = id === '2' && Object.keys(route.query).length > 0
    if (route.path !== targetRoute.path || needsQueryReset) {
      router.push(targetRoute)
    }
    return
  }

  activeProjectId.value = id
  threads.value = [...currentThreads]
  syncActiveThread(nextThreadId)
  router.push(targetRoute)
}

function handleProjectAdd() {
  toast.info('新建项目功能即将上线')
}

function handleThreadSelect(id: string) {
  if (!threads.value.some((thread) => thread.id === id)) return

  syncActiveThread(id)
  router.push(getProjectRoute(activeProjectId.value, id))
}

function handleOpenBranch(sessionId: string, branchId: string) {
  router.push({ name: 'branch-chat', params: { sessionId, branchId } })
}

async function handleDeleteBranch(sessionId: string, branchId: string) {
  // 删除分支会级联删除其下所有子分支，不影响上级与同级会话
  const ok = await sessionStore.deleteSessionNodeFromVault(vaultStore.vaultPath, branchId)
  if (!ok) {
    toast.error('删除分支失败')
    return
  }
  // 若当前正打开被删除的分支，回到其主会话
  if (activeBranchId.value === branchId) {
    router.replace({ path: '/chat', query: { thread: sessionId } })
  }
  toast.success('已删除分支')
}

function handleThreadRename(id: string, title: string) {
  updateThreadTitle(id, title)
}

function handleActiveThreadTitleUpdate(title: string) {
  if (activeThreadId.value) {
    updateThreadTitle(activeThreadId.value, title)
  }
}

async function handleThreadDelete(id: string) {
  const projectList = projectThreads[activeProjectId.value]
  if (!projectList) return

  const deletedIndex = projectList.findIndex((thread) => thread.id === id)
  if (deletedIndex === -1) return

  // 级联删除该会话及其下所有分支的 vault 文件（无 vault 时视为本地会话放行）
  if (!(await sessionStore.deleteSessionNodeFromVault(vaultStore.vaultPath, id))) {
    toast.error('删除 Vault 会话文件失败，未删除本地会话')
    return
  }

  removeThreadMessages(id)
  projectList.splice(deletedIndex, 1)
  threads.value = [...projectList]

  if (activeThreadId.value === id) {
    const nextThread = projectList[deletedIndex] ?? projectList[deletedIndex - 1] ?? null
    syncActiveThread(nextThread?.id ?? null)
    router.replace(getProjectRoute(activeProjectId.value, nextThread?.id ?? null))
  } else {
    saveSessionList()
  }

  toast.success('已删除会话')
}

function handleNewThread() {
  const newId = `new_${Date.now()}`
  const newThread: Thread = {
    id: newId,
    title: '新会话',
    meta: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }),
  }
  const projectId = activeProjectId.value
  projectThreads[projectId] = [newThread, ...(projectThreads[projectId] ?? [])]
  threads.value = [...projectThreads[projectId]]
  syncActiveThread(newId)
  router.push(getProjectRoute(projectId, newId))
  toast.success('已创建新会话')
}

function handleSettings() {
  router.push('/settings')
}

function handleKeydown(event: KeyboardEvent) {
  const isCtrl = event.ctrlKey || event.metaKey
  if (isCtrl && event.key === 'n') {
    event.preventDefault()
    handleNewThread()
  }
  if (isCtrl && event.key === ',') {
    event.preventDefault()
    handleSettings()
  }
  if (isCtrl && event.key === 'h') {
    event.preventDefault()
    router.push('/hub')
  }
  if (isCtrl && event.key === 'b') {
    event.preventDefault()
    router.push('/notes')
  }
}

watch(
  () => route.query.thread,
  (threadId) => {
    if (typeof threadId !== 'string') return

    const matchingProjectId = Object.entries(projectThreads).find(([, projectList]) =>
      projectList.some((thread) => thread.id === threadId),
    )?.[0]
    if (!matchingProjectId) return

    if (activeProjectId.value !== matchingProjectId) {
      activeProjectId.value = matchingProjectId
      threads.value = [...projectThreads[matchingProjectId]]
    }
    if (activeThreadId.value !== threadId) {
      syncActiveThread(threadId)
    }
  },
  { immediate: true },
)

watch(
  () => vaultStore.vaultPath,
  (path) => {
    // vault 就绪后加载会话树，供左侧会话列表展开分支
    if (path) void sessionStore.initSessionTree(path)
  },
  { immediate: true },
)

onMounted(() => {
  vaultStore.restoreLastVault().catch(() => {})
  const engine = getEmbeddingEngine()
  engine.initialize()
    .then(() => {
      // 引擎就绪后再构建/刷新索引：vault 打开早于引擎就绪时，initIndex 会跳过
      vaultStore.initIndex().catch((e) => {
        console.warn('索引初始化失败（非关键功能）:', e)
      })
    })
    .catch((error) => {
      // 网络被拦截时常见表现为“Unexpected token '<'”(模型请求返回了 HTML 拦截页)，
      // 此时需要开启代理/VPN 后重启应用，成功下载后模型会缓存到本地，之后可离线使用
      console.warn(
        'Embedding 模型加载失败（若报错为 Unexpected token "<" 且返回 HTML，说明模型下载被网络拦截，请开启代理/VPN 后重启应用）:',
        error,
      )
    })
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>
