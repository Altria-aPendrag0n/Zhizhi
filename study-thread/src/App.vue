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
        :brand-title="isHome"
        :show-back="showBack"
        :show-threads-toggle="isCompact && !isHome"
        :show-crumb-icon="!isHome"
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
  <AiBusyOverlay />
  <Toast />
  <WelcomeOverlay />
  <UpdatePrompt
    :visible="updatePromptVisible"
    :update="pendingUpdate"
    @close="updatePromptVisible = false"
  />
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, provide, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppShell from './components/shell/AppShell.vue'
import ProjectRail from './components/shell/ProjectRail.vue'
import ThreadList from './components/shell/ThreadList.vue'
import TopBar, { type TopBarMenuItem } from './components/shell/TopBar.vue'
import Toast from './components/common/Toast.vue'
import AiBusyOverlay from './components/common/AiBusyOverlay.vue'
import WelcomeOverlay from './components/common/WelcomeOverlay.vue'
import UpdatePrompt from './components/common/UpdatePrompt.vue'
import { useToast } from './composables/useToast'
import { useBusyStore } from './stores/busy'
import type { Project } from './components/shell/ProjectRail.vue'
import type { Thread } from './components/shell/ThreadList.vue'
import { getEmbeddingEngine } from './embedding/engine'
import { useVaultStore } from './stores/vault'
import { useSessionStore } from './stores/session'
import { useNoteStore } from './stores/notes'
import { useAuthStore } from './stores/auth'
import { usePlanStore } from './stores/plan'
import type { SessionTreeNode } from './utils/session-tree'
import { checkForUpdate, type AppUpdate } from './utils/updater'

const router = useRouter()
const route = useRoute()
const toast = useToast()
const busyStore = useBusyStore()
const vaultStore = useVaultStore()
const sessionStore = useSessionStore()
const noteStore = useNoteStore()
const authStore = useAuthStore()
const planStore = usePlanStore()

const defaultProjects: Project[] = [
  { id: '1', name: '知枝学习' },
  { id: '2', name: '资料库' },
  { id: '3', name: '学习地图' },
]

const projects = ref<Project[]>(defaultProjects)
const activeProjectId = ref('1')
const activeThreadId = ref<string | null>(null)
const noteDetailTitle = ref('')
/** 启动自动检查更新：发现新版本时弹窗提示 */
const updatePromptVisible = ref(false)
const pendingUpdate = ref<AppUpdate | null>(null)

/**
 * 会话栏列表：来自 vault sessions/*.md（仓库即真相，无本地缓存），
 * 仅「知枝学习」项目展示；会话创建时间格式化为侧边栏元信息。
 */
const threads = computed<Thread[]>(() => {
  if (activeProjectId.value !== '1') return []
  const list = sessionStore.sessionList.map((session) => ({
    id: session.id,
    title: session.title,
    meta: formatSessionTime(session.created),
    kind: session.kind,
  }))
  // 新建会话占位：首条消息发送前会话尚未落盘（sessions/*.md 不存在），
  // 会话栏以「新对话」占位展示当前空白会话，发送首条消息落盘后由真实条目替换
  const newId = activeThreadId.value
  if (newId && newId.startsWith('new_') && !list.some((thread) => thread.id === newId)) {
    list.unshift({ id: newId, title: '新对话', meta: '', kind: undefined })
  }
  return list
})
const activeThread = computed(() => threads.value.find((thread) => thread.id === activeThreadId.value) ?? null)
const breadcrumbs = computed(() => activeThread.value ? ['学习会话', activeThread.value.title] : ['学习会话'])

/** 会话创建时间 → 侧边栏元信息：今天显示时刻，昨天显示「昨天 HH:MM」，往年显示完整日期 */
function formatSessionTime(created: string): string {
  const date = new Date(created)
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  if (date.toDateString() === now.toDateString()) return time
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  if (date.toDateString() === yesterday.toDateString()) return `昨天 ${time}`
  if (date.getFullYear() === now.getFullYear()) return `${date.getMonth() + 1}月${date.getDate()}日 ${time}`
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`
}

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

/** 主界面（/home）：品牌按钮高亮、隐藏会话栏 */
const isHome = computed(() => route.path === '/home')

/** 资料库（/notes*）、设置页、认知地图（/hub）、复习会话（/review*）隐藏会话列：左侧只保留项目栏 */
const hideThreadsByRoute = computed(() =>
  route.path.startsWith('/notes') || route.path.startsWith('/settings') || route.path === '/hub' || route.path.startsWith('/review') || route.path === '/home',
)
/** 会话栏是否隐藏：路由隐藏（资料库/设置）或用户手动收起 */
const hideThreads = computed(() => threadsCollapsed.value || hideThreadsByRoute.value)
/** 会话界面显示"收起/展开会话栏"按钮（路由未隐藏且非小窗口模式） */
const showCollapseThreads = computed(() => !hideThreadsByRoute.value && !isCompact.value)
/** 笔记/会话/设置/认知地图/复习会话界面显示顶部返回按钮 */
const showBack = computed(() =>
  route.path.startsWith('/chat') || route.path.startsWith('/notes') || route.path.startsWith('/settings') || route.path === '/hub' || route.path.startsWith('/review'),
)
const displayedBreadcrumbs = computed(() => {
  if (route.path === '/home') return ['知枝']
  if (route.path.startsWith('/settings')) return ['设置']
  if (route.path === '/hub') return ['学习地图']
  if (route.path === '/notes') return ['资料库']
  if (route.path.startsWith('/notes/')) {
    return ['资料库', noteDetailTitle.value || decodeURIComponent((route.params?.id as string) || '')]
  }
  if (route.path.startsWith('/review')) return ['学习地图', '复习']
  return breadcrumbs.value
})
/** 顶栏当前标题是否可编辑：仅主会话/分支会话（会话标题可重命名），静态界面名称不可编辑 */
const titleEditable = computed(() => route.name === 'chat' || route.name === 'branch-chat')
const activeProject = computed(() => projects.value.find((project) => project.id === activeProjectId.value) ?? null)
const threadCount = computed(() => threads.value.length)
const noteCount = computed(() => noteStore.notes.length)

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

/** 重命名会话：改写 vault 会话 md 的 frontmatter title（仓库即真相），并刷新侧边栏列表 */
async function updateThreadTitle(threadId: string, title: string) {
  const normalizedTitle = title.trim()
  if (!normalizedTitle || !vaultStore.vaultPath) return
  const ok = await sessionStore.renameSessionTitle(vaultStore.vaultPath, threadId, normalizedTitle)
  if (!ok) toast.error('重命名会话失败')
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
    } else if (path.startsWith('/review') && activeProjectId.value !== '3') {
      // 复习会话来自学习地图（项目3），项目栏高亮学习地图而非知枝学习
      activeProjectId.value = '3'
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
  const nextThreadId = id === '1' ? (sessionStore.sessionList[0]?.id ?? null) : null
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
    // 资料库目标路由（/notes）会隐藏会话栏：不切换会话激活状态（threads 为计算属性，
    // 会话栏始终展示 vault 会话，/notes 下隐藏不显示）
    router.push(targetRoute)
    return
  }
  if (targetRoute.path === '/hub') {
    // 学习地图为纯视图切换界面（无会话）：清空激活会话，避免旧会话残留
    activeThreadId.value = null
    router.push(targetRoute)
    return
  }
  if (nextThreadId) activeThreadId.value = nextThreadId
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

  activeThreadId.value = id
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
  void updateThreadTitle(id, title)
}

function handleActiveThreadTitleUpdate(title: string) {
  if (activeThreadId.value) {
    void updateThreadTitle(activeThreadId.value, title)
  }
}

async function handleThreadDelete(id: string) {
  // 级联删除该会话及其下所有分支的 vault 文件（无 vault 时视为本地会话放行）
  if (!(await sessionStore.deleteSessionNodeFromVault(vaultStore.vaultPath, id))) {
    toast.error('删除 Vault 会话文件失败')
    return
  }
  // 刷新会话列表（仓库即真相）
  if (vaultStore.vaultPath) await sessionStore.loadSessionsFromVault(vaultStore.vaultPath)

  if (activeThreadId.value === id) {
    activeThreadId.value = null
    router.replace({ path: '/chat' })
  }

  toast.success('已删除会话')
}

function handleNewThread(projectId = activeProjectId.value) {
  // 学习地图为纯视图切换界面，不支持新建会话（/hub 隐藏会话栏，此处为兜底保护）
  if (projectId === '3') {
    toast.info('学习地图为视图界面，不支持新建会话')
    return
  }
  // 新会话以 md 保存在仓库：首条消息发送后才会落盘并出现在侧边栏，此处仅导航到空会话
  const newId = `new_${Date.now()}`
  activeThreadId.value = newId
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
  if (path === '/home' || path === '/hub' || path.startsWith('/settings')) {
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
  // AI 忙碌遮罩期间禁用全局快捷键（用户不能进行任何操作）
  if (busyStore.active) return
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
    // 会话激活状态跟随路由：新会话（new_*）尚未落盘、不在列表中，仍标记为激活
    activeThreadId.value = typeof threadId === 'string' && threadId ? threadId : null
  },
  { immediate: true },
)

watch(
  () => vaultStore.vaultPath,
  (path) => {
    if (path) {
      // vault 就绪后加载会话列表与会话树（仓库即真相：侧边栏会话来自 sessions/*.md）
      void sessionStore.loadSessionsFromVault(path)
      // 学习计划列表同步加载（学习地图「学习计划」视图与今日任务徽标依赖）
      void planStore.loadPlans(path)
    } else {
      sessionStore.sessionList = []
      sessionStore.sessionTree = null
      planStore.plans = []
    }
  },
  { immediate: true },
)

onMounted(() => {
  updateViewport()
  window.addEventListener('resize', updateViewport)
  vaultStore.restoreLastVault().catch(() => {})
  // 启动静默续期：钥匙串有 refresh_token 则恢复官方登录会话；无/失败不打扰用户
  authStore.restore().catch(() => {})
  const engine = getEmbeddingEngine()
  engine.initialize()
    .then(() => {
      // 引擎就绪后再构建/刷新索引：vault 打开早于引擎就绪时，initIndex 会跳过
      vaultStore.initIndex().catch((e) => {
        console.warn('索引初始化失败（非关键功能）:', e)
      })
    })
    .catch((error) => {
      // 模型已随应用本地打包（public/models），失败通常为资源缺失或缓存被污染，
      // 不再提示「开启代理/VPN」（该指引属于旧版在线下载模型的场景）
      console.warn(
        '内置 Embedding 模型加载失败（请确认安装包包含 public/models 下的完整模型文件；' +
          '如需排查可通过设置页「关于知枝」导出调试日志反馈）:',
        error,
      )
    })
  // 启动时静默检查更新：发现新版本弹窗提示，失败/无更新不打扰用户
  checkForUpdate()
    .then((update) => {
      if (update) {
        pendingUpdate.value = update
        updatePromptVisible.value = true
      }
    })
    .catch(() => {})
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('resize', updateViewport)
})
</script>
