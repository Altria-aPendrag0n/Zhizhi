<template>
  <AppShell
    :hide-threads="hideThreads"
    :compact="isCompact"
    :drawer-open="drawerOpen"
    @close-drawer="drawerOpen = false"
  >
    <template #rail>
      <ProjectRail
        :projects="projects"
        :active-id="isHome ? null : activeProjectId"
        :brand-active="isHome"
        @select="handleProjectSelect"
        @add="handleProjectAdd"
        @brand="handleBrand"
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
        :show-back="showBack"
        :show-threads-toggle="isCompact"
        :show-collapse-threads="showCollapseThreads"
        :threads-collapsed="threadsCollapsed"
        :menu-items="contextMenuItems"
        :editable="titleEditable"
        @update-title="handleActiveThreadTitleUpdate"
        @settings="handleSettings"
        @back="handleBack"
        @toggle-threads="handleToggleThreads"
        @toggle-collapse-threads="threadsCollapsed = !threadsCollapsed"
        @menu-action="handleMenuAction"
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
import TopBar, { type TopBarMenuItem } from './components/shell/TopBar.vue'
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
  // 学习地图（项目3）为纯视图切换界面，不含会话；
  // 旧版 /hub?thread=7（知识图谱总览）/thread=8（概念关系网络）的示例会话已废弃移除
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

/** 小窗口模式：会话列表不占主网格列，以抽屉形式从左侧滑出 */
const COMPACT_BREAKPOINT = 860
/** 当前是否处于小窗口（compact）模式 */
const isCompact = ref(false)
/** 小窗口模式下会话列表抽屉是否展开 */
const drawerOpen = ref(false)
/** 用户手动收起的会话栏（顶栏图标切换，再点展开） */
const threadsCollapsed = ref(false)

function updateViewport() {
  isCompact.value = window.innerWidth < COMPACT_BREAKPOINT
  // 恢复大窗口时自动收起抽屉
  if (!isCompact.value) drawerOpen.value = false
}

function handleToggleThreads() {
  drawerOpen.value = !drawerOpen.value
}

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

  // 学习地图（项目3）是纯视图切换界面，不包含会话；
  // 旧版 /hub?thread=7/8 的示例会话（知识图谱总览/概念关系网络）已废弃，加载时清理持久化残留
  if (projectThreads['3']?.length) {
    projectThreads['3'] = []
    migrated = true
  }

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

/** 主界面（/home）：品牌按钮高亮、隐藏会话栏 */
const isHome = computed(() => route.path === '/home')

/** 资料库（/notes*）、设置页、认知地图（/hub）、复习会话（/review*）隐藏会话列：左侧只保留项目栏 */
const hideThreadsByRoute = computed(() =>
  route.path.startsWith('/notes') || route.path === '/settings' || route.path === '/hub' || route.path.startsWith('/review') || route.path === '/home',
)
/** 会话栏是否隐藏：路由隐藏（资料库/设置）或用户手动收起 */
const hideThreads = computed(() => threadsCollapsed.value || hideThreadsByRoute.value)
/** 会话界面显示"收起/展开会话栏"按钮（路由未隐藏且非小窗口模式） */
const showCollapseThreads = computed(() => !hideThreadsByRoute.value && !isCompact.value)
/** 笔记/会话/设置/认知地图/复习会话界面显示顶部返回按钮 */
const showBack = computed(() =>
  route.path.startsWith('/chat') || route.path.startsWith('/notes') || route.path === '/settings' || route.path === '/hub' || route.path.startsWith('/review'),
)
const displayedBreadcrumbs = computed(() => {
  if (route.path === '/home') return ['主界面']
  if (route.path === '/settings') return ['设置']
  if (route.path === '/hub') return ['学习地图']
  if (route.path === '/notes') return ['资料库']
  if (route.path.startsWith('/notes/')) {
    return ['资料库', noteDetailTitle.value || decodeURIComponent((route.params?.id as string) || '')]
  }
  return breadcrumbs.value
})
/** 顶栏当前标题是否可编辑：仅主会话/分支会话（会话标题可重命名），静态界面名称不可编辑 */
const titleEditable = computed(() => route.name === 'chat' || route.name === 'branch-chat')
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
/** 学习地图等页面"开始新会话"入口：默认在知枝学习（项目1）下新建会话 */
provide('createNewThread', handleNewThread)

watch(
  () => route.path,
  (path) => {
    if (!path.startsWith('/notes/')) noteDetailTitle.value = ''
    // 按路由同步左侧项目栏高亮：资料库（/notes*）→ 项目2；学习地图（/hub）→ 项目3
    // （划线跳转、wikilink、图谱节点等从会话/其他页面直接进入笔记详情时，activeProjectId 需随页面同步，
    //   否则左侧项目栏仍高亮来源项目，与当前页面不符）
    if (path.startsWith('/notes') && activeProjectId.value !== '2') {
      activeProjectId.value = '2'
    } else if (path === '/hub' && activeProjectId.value !== '3') {
      activeProjectId.value = '3'
    } else if (path.startsWith('/review') && activeProjectId.value !== '1') {
      activeProjectId.value = '1'
    }
  },
)

function getProjectRoute(projectId: string, threadId: string | null) {
  if (projectId === '2') {
    return { path: '/notes' }
  }
  if (projectId === '3') {
    // 学习地图：左侧为视图切换管理栏，不关联具体会话
    return { path: '/hub' }
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
  if (targetRoute.path === '/notes') {
    // 资料库目标路由（/notes）会隐藏会话栏：不提前切换 threads，
    // 否则会在 /chat 上先闪现一帧资料库项目的会话栏（如 知枝学习/认知科学论文索引/机器学习基础）再跳转
    router.push(targetRoute)
    // 会话激活状态与持久化在导航发起后同步（threads 列表保持原样，/notes 隐藏会话栏）
    syncActiveThread(nextThreadId)
    return
  }
  if (targetRoute.path === '/hub') {
    // 学习地图为纯视图切换界面（无会话）：同步空会话列表并清空激活会话，
    // 避免 /hub 异步加载期间在 /chat 上闪现旧版废弃的会话栏（知识图谱总览/概念关系网络）
    threads.value = []
    syncActiveThread(null)
    router.push(targetRoute)
    return
  }
  threads.value = [...currentThreads]
  syncActiveThread(nextThreadId)
  router.push(targetRoute)
}

function handleProjectAdd() {
  toast.info('新建项目功能即将上线')
}

/** 左上角知枝按钮：跳转到主界面（数据总览） */
function handleBrand() {
  router.push('/home')
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

function handleNewThread(projectId = activeProjectId.value) {
  // 学习地图为纯视图切换界面，不支持新建会话（/hub 隐藏会话栏，此处为兜底保护）
  if (projectId === '3') {
    toast.info('学习地图为视图界面，不支持新建会话')
    return
  }
  const newId = `new_${Date.now()}`
  const newThread: Thread = {
    id: newId,
    title: '新会话',
    meta: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }),
  }
  projectThreads[projectId] = [newThread, ...(projectThreads[projectId] ?? [])]
  threads.value = [...projectThreads[projectId]]
  syncActiveThread(newId)
  router.push(getProjectRoute(projectId, newId))
  toast.success('已创建新会话')
}

function handleSettings() {
  router.push('/settings')
}

/** 顶栏"更多操作"菜单项：按当前界面提供相关拓展操作 */
const contextMenuItems = computed<TopBarMenuItem[]>(() => {
  const path = route.path

  // 学习会话界面：会话相关操作 + 跨界面跳转
  if (path.startsWith('/chat')) {
    const items: TopBarMenuItem[] = [
      { id: 'new-thread', label: '新建会话', shortcut: 'Ctrl+N' },
      { id: 'notes', label: '打开资料库', shortcut: 'Ctrl+B' },
      { id: 'hub', label: '打开学习地图', shortcut: 'Ctrl+H' },
    ]
    // 非小窗口模式可在此收起/展开会话栏
    if (showCollapseThreads.value) {
      items.push({ id: 'sep', separator: true })
      items.push({
        id: 'toggle-threads',
        label: threadsCollapsed.value ? '展开会话栏' : '收起会话栏',
      })
    }
    return items
  }

  // 资料库：切换笔记/参考资料视图 + 跨界面跳转
  if (path.startsWith('/notes')) {
    return [
      { id: 'tab-notes', label: '查看笔记' },
      { id: 'tab-references', label: '查看参考资料' },
      { id: 'sep', separator: true },
      { id: 'hub', label: '打开学习地图' },
      { id: 'chat', label: '返回学习会话' },
    ]
  }

  // 主界面 / 学习地图 / 设置：跨界面跳转
  if (path === '/home' || path === '/hub' || path === '/settings') {
    return [
      { id: 'notes', label: '打开资料库' },
      { id: 'hub', label: '打开学习地图' },
      { id: 'chat', label: '返回学习会话' },
    ]
  }

  return [
    { id: 'notes', label: '打开资料库' },
    { id: 'hub', label: '打开学习地图' },
  ]
})

function handleMenuAction(id: string) {
  switch (id) {
    case 'new-thread':
      handleNewThread()
      break
    case 'notes':
      router.push('/notes')
      break
    case 'hub':
      router.push('/hub')
      break
    case 'chat':
      router.push('/chat')
      break
    case 'toggle-threads':
      threadsCollapsed.value = !threadsCollapsed.value
      break
    case 'tab-notes':
      router.push({ path: '/notes' })
      break
    case 'tab-references':
      router.push({ path: '/notes', query: { tab: 'references' } })
      break
  }
}

/** 顶部返回按钮：退回上一界面；无站内历史（如直达 URL）时回退到会话页 */
function handleBack() {
  if (window.history.state?.back) {
    router.back()
  } else {
    router.push('/chat')
  }
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
  updateViewport()
  window.addEventListener('resize', updateViewport)
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
  window.removeEventListener('resize', updateViewport)
})
</script>
