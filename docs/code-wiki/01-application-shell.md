# 01 · 应用外壳与路由

> 本模块覆盖：应用入口、根组件、路由表、全局快捷键、布局骨架与左侧导航（项目栏 / 会话列表 / 顶栏）。
> 相关代码：`study-thread/src/main.ts`、`study-thread/src/App.vue`、`study-thread/src/router/`、`study-thread/src/components/shell/`。

---

## 1. 模块职责

- 组装 Vue 应用（Pinia + Router），并渲染全局布局骨架。
- 维护"项目 → 会话"两级导航模型，持久化到 `localStorage`（键 `study-thread-session-list`）。
- 定义 6 个路由页面并处理路由参数（`query.thread` 联动激活会话）。
- 注册全局键盘快捷键与顶栏/面包屑/标题注入回调。
- 应用启动时恢复上次 Vault 并初始化 Embedding 引擎与向量索引。

## 2. 关键文件

| 文件 | 职责 |
|------|------|
| `src/main.ts` | 应用入口：`createApp` + `createPinia` + `router`，`replace('/chat')` 后挂载 |
| `src/App.vue` | 根组件：导航状态、全局快捷键、会话列表持久化、生命周期初始化 |
| `src/router/index.ts` | 路由表（懒加载） |
| `src/components/shell/AppShell.vue` | 五区 Grid 布局骨架（具名插槽） |
| `src/components/shell/ProjectRail.vue` | 最左侧项目栏 |
| `src/components/shell/ThreadList.vue` | 会话列表列（含分支树、右键菜单） |
| `src/components/shell/ThreadBranch.vue` | 会话列内分支树节点（递归） |
| `src/components/shell/TopBar.vue` | 顶栏（面包屑 + 内联标题编辑） |

## 3. 路由表（`src/router/index.ts`）

| 路径 | 名称 | 页面组件 | 说明 |
|------|------|----------|------|
| `/` | — | 重定向 | → `/chat` |
| `/chat` | `chat` | `views/MainChatPage.vue` | 主会话聊天 |
| `/chat/branch/:sessionId/:branchId` | `branch-chat` | `views/BranchChatPage.vue` | 分支深度追问 |
| `/notes` | `notes` | `views/NotesPage.vue` | 资料库（笔记 + 参考资料） |
| `/notes/:id` | `note-detail` | `views/NoteDetailPage.vue` | 笔记详情 |
| `/hub` | `hub` | `views/LearningHubPage.vue` | 学习总览 |
| `/settings` | `settings` | `views/SettingsPage.vue` | 设置 |

> 路由均使用 `createWebHistory()`；页面组件全部懒加载（`() => import(...)`）。

## 4. 根组件 `App.vue` 关键逻辑

### 4.1 导航状态模型

```ts
projects: Project[]                          // { id, name }
projectThreads: Record<projectId, Thread[]>  // Thread = { id, title, meta }
activeProjectId / activeThreadId
breadcrumbs                                  // ['学习会话', 会话标题]
```

- 初始数据有 3 个内置项目：`1 知枝学习`、`2 资料库`、`3 学习地图`，其中知枝学习/资料库含示例会话，**学习地图为纯视图切换界面、不含任何会话**（旧版 `/hub?thread=7/8` 的示例会话"知识图谱总览/概念关系网络"已废弃移除）。
- 持久化：`saveSessionList()` 写入 `study-thread-session-list`；会话消息持久化在 `study-thread-messages`（由 `MainChatPage` 使用）。
- 启动时执行一次元数据迁移 `migrateSessionMeta`（归一化 `meta` 时间、修正空"新会话"标题、**清理持久化中学习地图项目的残留会话**——旧版 `/hub?thread=7/8` 的示例会话已废弃，加载时清空避免再次闪现废弃界面）。

### 4.2 项目路由映射

```ts
function getProjectRoute(projectId, threadId) {
  // '2' → /notes（资料库）
  // '3' → /hub（学习地图）
  // 其他 → /chat
}
```

`handleProjectSelect(id)` 的导航要点：

- 切到新项目时，更新 `activeProjectId` / `threads` 后 `push(getProjectRoute(...))`。
- **资料库（项目 `2`）例外**：目标路由 `/notes` 会隐藏会话栏（`hideThreads`），因此切换时**不提前替换 `threads`**，直接 `push('/notes')`——否则会在 `/chat` 上先闪现一帧资料库项目的会话列表（如"知枝学习/认知科学论文索引/机器学习基础"）再跳转；会话激活状态与持久化（`syncActiveThread`）在导航发起后同步。
- **学习地图（项目 `3`）**：目标路由 `/hub` 同样隐藏会话栏，且不携带 `thread` 参数——学习地图左侧是自己的**视图切换管理栏**（`LearningHubPage` 内 `hub-nav`：学习总览 / 概念网络，通过 `currentView` 切换），不关联具体会话、也不提供新建会话。切换时**同步空会话列表并清空激活会话**（`threads = []` + `syncActiveThread(null)`）——旧版此处会写入项目 `3` 的废弃示例会话（知识图谱总览/概念关系网络），在 `/hub` 异步加载期间于 `/chat` 上闪现"学习地图 + 废弃会话列表"的废弃界面，已修复；`handleNewThread` 对项目 `3` 有兜底保护（提示"学习地图为视图界面，不支持新建会话"）。
- **学习地图页内跳转（`LearningHubPage`）**：点击"会话树/最近活动"节点时 `handleSelectNode`/`handleActivityClick` 会 `push({ path: '/chat', query: { thread: nodeId } })`——**必须携带 `thread` 参数**，否则进入无会话的空白聊天界面（曾误用 `push('/chat')` 造成"废弃界面"）；顶部"开始新会话"快速入口通过注入的 `createNewThread('1')` 在知枝学习项目下新建会话并跳转，而非直接跳空白 `/chat`。
- 再次点击**已激活**项目时视为"回到该项目首页"：若当前 path 偏离目标路由则修正；资料库（项目 `2`）还会检查是否残留 `tab=references` 等 query——资料库页内切换 tab 会把 tab 写入 query（`NotesPage` 里 `router.push({ query: { tab } })`），残留 query 会让再次点击资料库时仍停留在旧视图（表现为"老版本废弃页面"），因此有残留 query 时强制 `push({ path: '/notes' })` 回默认笔记视图。
- vue-router 4 中 `push({ path })`（不含 query 的对象形式）会**清除**现有 query，因此该写法即可完成重置。

### 4.3 全局快捷键（`handleKeydown`）

| 快捷键 | 动作 |
|--------|------|
| `Ctrl/Cmd + N` | 新建会话 |
| `Ctrl/Cmd + ,` | 打开设置 |
| `Ctrl/Cmd + H` | 跳转学习总览 |
| `Ctrl/Cmd + B` | 跳转资料库 |

### 4.4 provide 注入回调

- `provide('updateThreadTitle', updateThreadTitle)`：由聊天页在会话标题变化时调用。
- `provide('updateNoteBreadcrumbTitle', (title) => …)`：由笔记详情页更新面包屑末级标题。
- `provide('createNewThread', handleNewThread)`：供学习地图等页面"开始新会话"入口调用，`handleNewThread(projectId = activeProjectId)` 支持指定项目（学习地图按钮传 `'1'` 在知枝学习下新建会话，避免跳转到无会话的空白聊天界面）。
- **顶栏面包屑派生（`displayedBreadcrumbs`）**：`/settings` → `['设置']`；`/notes` → `['资料库']`；`/notes/:id` → `['资料库', 笔记标题]`；其余（会话/分支）→ 会话面包屑 `['学习会话', 会话标题]`（支持内联编辑）。

### 4.5 生命周期初始化（`onMounted`）

```ts
vaultStore.restoreLastVault()              // 恢复上次 Vault（localStorage: study-thread-last-vault）
const engine = getEmbeddingEngine()
engine.initialize()                        // 加载本地 embedding 模型
  .then(() => vaultStore.initIndex())      // 引擎就绪后再构建向量索引
window.addEventListener('keydown', handleKeydown)
```

- 监听 `vaultStore.vaultPath`：Vault 就绪后调用 `sessionStore.initSessionTree(path)` 加载分支树，供左侧会话列表展开分支。
- 删除会话/分支走 `sessionStore.deleteSessionNodeFromVault`（级联删除 vault 文件），无 vault 时视为本地会话直接放行。

## 5. 布局骨架 `AppShell.vue`

CSS Grid 五区布局，全部为具名插槽：

| 插槽名 | 内容 | 说明 |
|--------|------|------|
| `rail` | 项目栏 | 76px |
| `threads` | 会话列表 | 248px；`hideThreads` 时隐藏（资料库页、设置页与认知地图） |
| `toolbar` | 顶栏 | 跨主区与上下文栏 |
| `main` | 主内容区 | `<router-view :key="$route.fullPath" />` |

> 主内容区（`main`）为 `minmax(0, 1fr)` 撑满剩余空间；**各内容页不再设置 `max-width` + 居中**（设置页、学习地图、资料库、笔记列表/详情、聊天对话区均已改为填充剩余宽度），避免主界面右侧留白。
>
> 资料库页内层 `.notes-layout` 曾残留 `max-width: 1078px + margin: 0 auto` 居中，导致左侧"笔记/参考资料"管理栏随布局整体右移；已移除，使其与学习地图左侧管理栏位置一致（均贴页面左内边距 48px）。
>
> Grid 为三区布局（`76px 244px 1fr`）。曾预留第 4 列上下文栏（292px），但全应用无页面使用 `context` 插槽，导致右侧恒留 292px 空白列，已移除。

`hideThreads` 时通过 `app-shell--threads-hidden` 类将 Grid 变为 3 列，会话列用 `v-if` **立即隐藏**（无过渡动画）。曾用 `<Transition name="threads-collapse">` + `grid-template-columns` 过渡平滑收起，但实测会导致会话列元素在过渡期被拉伸到整个内容区宽度（896px）覆盖笔记页，并把主内容区下推 33px（表现为"界面从下往上出现"），且拖慢跳转约 200ms；故移除过渡改为即时切换，进入资料库更干脆快速。

**会话栏手动收起/展开**：`App.vue` 维护 `threadsCollapsed`，与路由隐藏（资料库/设置/认知地图）共同决定 `hideThreads`。会话界面顶栏右侧显示"收起/展开会话栏"按钮（`showCollapseThreads`，`PanelLeft`/`PanelRight` 图标随状态切换），点击切换 `threadsCollapsed`；资料库/设置/认知地图页及小窗口（compact）模式不显示该按钮（小窗口用左侧抽屉按钮）。

**响应式断点（三档）**：
- `≥1100px`：完整三列 `76px 244px 1fr`（`hideThreads` 时 `76px 1fr`）。
- `<1100px`：列缩窄为 `64px 218px 1fr`（纯 CSS 媒体查询）。
- `<860px`（**compact 模式**）：`App.vue` 监听 `resize` 维护 `isCompact`；会话列表移出主网格（Grid 变 `76px 1fr`），以 `position: fixed` 抽屉形式从左侧滑出（`translateX` 过渡），由顶栏 `showThreadsToggle` 按钮（`toggle-threads` 事件）展开、遮罩点击（`close-drawer`）关闭；窗口恢复大屏时自动收起抽屉。
- 各内容页（设置/资料库/笔记详情/学习地图）在 `<860px` 收缩内边距（`34px 48px` → `22~24px 20px`），笔记详情侧栏由右侧改到内容下方；聊天页 `padding` 使用 `max(48px, 8vw)` 已自适应。

## 6. 导航组件

### 6.1 `ProjectRail.vue`

- 导出 `Project` 接口 `{ id: string; name: string }`。
- props：`projects`、`activeId`；emits：`select(id)`、`add`。
- 品牌按钮（Sprout 图标）+ 项目按钮（按 id 映射图标）+ 新建项目按钮（点击 emit `add`，当前为 toast 占位）。

### 6.2 `ThreadList.vue`

- 导出 `Thread` 接口 `{ id: string; title: string; meta: string }`。
- props：`projectName`、`threads`、`activeId`、`threadCount`、`noteCount`、`branches?: Record<sessionId, SessionTreeNode[]>`、`activeBranchId`。
- emits：`select`、`rename`、`delete`、`new-thread`、`open-branch`、`delete-branch`。
- 逻辑要点：
  - `expandedThreads: Set<string>` 管理会话分支树展开状态。
  - 行内标题编辑（Enter 保存 / Esc 取消）。
  - 两个独立的 Teleport 右键菜单：会话级（编辑标题/删除会话）与分支级（删除分支）。
  - 底部统计：会话数 / 笔记数。

### 6.3 `ThreadBranch.vue`

- 递归组件，渲染单个分支节点；props：`node: SessionTreeNode`、`sessionId`、`depth`、`activeBranchId`。
- emits：`open-branch`、`menu({sessionId, branchId, x, y})`（右键菜单坐标）。
- 本地 `expanded` 状态控制子分支展开；激活分支高亮。

### 6.4 `TopBar.vue`

- props：`breadcrumbs: string[]`、`showBack?: boolean`；emits：`search`、`settings`、`back`、`update-title(title)`。
- `showBack` 为真时（笔记/会话/设置界面）最左侧渲染返回按钮（ArrowLeft），替换装饰性 PanelLeft 图标；点击 emit `back`，由 `App.vue` 的 `handleBack` 执行 `router.back()`（vue-router 4 的 `history.state.back` 非空时），无站内历史（如直达 URL）时回退到 `/chat`。
- 末级面包屑支持内联编辑（Pencil 图标触发，Enter 保存且仅在标题变化时 emit）。
- 工具栏含搜索与更多操作按钮（均为 UI 占位）。

## 7. 全局类型（跨模块使用）

- `Project`（shell/ProjectRail.vue）、`Thread`（shell/ThreadList.vue）
- `SessionTreeNode`（utils/session-tree.ts）——详见 [11-parsers-serializers.md](./11-parsers-serializers.md)
- `Session` / `Message` / `Note` / `NoteMeta` / `ReferenceMeta` / `ProviderConfig` 等 —— `src/types/index.ts`

## 8. 相关测试

- `src/router/index.test.ts`：路由配置
- `src/App.test.ts`：根组件渲染与导航行为
- `src/components/shell/ThreadList.test.ts`：会话列表交互

---

> 下一模块 → [02 学习对话模块](./02-chat-module.md)
