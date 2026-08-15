# 02 · 学习对话模块

> 本模块覆盖：主会话聊天页、分支会话页、会话 UI 组件（消息渲染 / 流式文本 / 输入框 / 划线菜单 / 会话树）。
> 相关代码：`study-thread/src/components/chat/`、`study-thread/src/views/MainChatPage.vue`、`study-thread/src/views/BranchChatPage.vue`。

---

## 1. 模块职责

- 承载 AI 伴读的核心交互：**流式问答 → 划线摘录 → 生成原子笔记 → 加入已有笔记 → 创建深度追问分支**。
- 主会话（`/chat`）与分支会话（`/chat/branch/:sessionId/:branchId`）两套页面共用 `ChatView` / `Composer`。
- 在发送前注入知识库 RAG 上下文，并支持模型按需调用 `read_reference` 工具分页读取参考资料全文。

## 2. 页面层

### 2.1 `MainChatPage.vue`（路由 `/chat`）

**职责**：主会话聊天的编排核心。

**组合的子组件**：`ChatView`、`Composer`、`AddToNoteDialog`。

**使用的 store / api / utils**：
- stores：`useSettingsStore`、`useVaultStore`、`useSessionStore`、`useNoteStore`
- api：`createProvider`（provider-factory）、`extractNote`（skills/extract-note）、`chatWithTools`（chat-loop）、`CLIENT_TOOLS`（tools）
- utils：`extractNoteRefsFromSession`、`insertHighlightAt` / `insertHighlightAtEnd`、`generateSessionTitle`、`getSessionFilePath`、`parseSessionFile`、`readFile`、`retrieveKnowledgeContext`
- 注入：`inject('updateThreadTitle')`；`useToast`

**关键函数**：

| 函数 | 说明 |
|------|------|
| `handleSend(content)` | 校验 API Key（无则跳 `/settings`）→ 空白界面（`/chat` 无 thread）时自动创建新会话：以 `new_${Date.now()}` 占位 id 落盘，回答结束后 `router.replace` 把会话 id 写入 URL（侧边栏高亮、后续追问复用；用户中途切换会话则不跳转）→ `retrieveKnowledgeContext` 检索知识库 → 组装 system prompt → `chatWithTools` 流式消费 6 类 chunk（`text/thinking/tool_call/tool_result/stop/error`），`AbortController` 支持停止 |
| `handleExtractNote(text, domMessageIndex)` | 调 `extractNote` skill 生成笔记草稿 → `noteStore.saveNote` 写入 vault → 记录 `NoteReference{path, title, messageIndex}` 并写回会话文件；`messageIndex` 优先用划线时 DOM 定位的索引 |
| `handleAddToNote(text)` / `confirmAddToNote(target)` | 弹窗选笔记与标题位置，`insertHighlightAt(End)` 把划线原文插入指定小节末尾或文件末尾 |
| `handleCreateBranch(text, domMessageIndex)` | 用 `resolveMessageIndex` 定位划线消息（DOM 索引优先、文本匹配兜底）→ `sessionStore.createBranchInVault` 创建分支（携带划线文本用于分叉点上下文）→ 跳转 `branch-chat` |
| `handleRetry()` | 移除失败的 AI 消息后重发最后一条用户消息 |
| `handleStop()` | 仅 abort 流式请求，不清空状态 |

**系统提示词（SYSTEM_PROMPT）**：硬编码于 `MainChatPage.vue`，定义学习伴读角色与回答要求，并含**流程图规范（分层）**——简单线性流程用 ASCII 字符画（盒子 `+ - |`、方向 `> < v ^`，中文 2 字符宽 / ASCII 1 字符宽对齐，禁用 `┌─┐` 等 Unicode 框线字符与 `① ② ✓ ← →` 等宽度不一致符号，配合渲染层 `wrapDiagramBlocks` 的 ASCII 盒子识别）；复杂流程（多分支 / 循环 / 菱形判断 / 嵌套）改用 Mermaid 代码块（`flowchart` 语法，渲染层 `renderMermaidBlocks` 转 SVG，见 3.2）。

**会话消息持久化（仓库即真相，无本地缓存）**：会话以 md + 特殊标记符（frontmatter、`## 角色 · 时间戳` 消息头、`<!-- fork-context -->` 区块、`> 已生成笔记/分支` 引用行）保存在 vault `sessions/*.md`。`loadThreadMessages` 按 `route.query.thread` 读取对应 md 并经 `parseSessionFile` 解析消息（保留消息级时间戳，跳过分叉上下文区块与划线引用标记行）；新会话（`new_*`）首条消息 `saveCurrentSession` 落盘后由 `sessionStore.loadSessionsFromVault` 刷新侧边栏列表。曾用 localStorage `study-thread-messages` 缓存与内置演示会话，已随本次改造移除。

### 2.2 `BranchChatPage.vue`（路由 `/chat/branch/:sessionId/:branchId`）

**职责**：分支（深度追问）会话。

**组合的子组件**：`BranchBreadcrumb`、`ChatView`、`Composer`、`ExtractNoteDialog`、`AddToNoteDialog`。

**关键逻辑**：

| 函数 | 说明 |
|------|------|
| `loadContext()` | 分叉点索引以分支文件 frontmatter `fork_point` 为权威（路由 `fork_index` 仅兜底）；分叉点上下文优先读取分支文件正文开头的 `<!-- fork-context -->` 区块（`extractForkContext`），旧文件回退到 `loadBranchContext(父会话文件, forkIndex)` 实时构建 |
| `handleSend(content)` | `branchFollowupStream(content, forkMessages, branchHistory, [], provider, knowledgeContext, toolContext)` 流式输出；`branchHistory = messages.slice(forkMessages.length, -1)` |
| `handleCreateBranch(text, domMessageIndex)` | 嵌套深度限制：`getNodeBranchDepth >= MAX_BRANCH_DEPTH(3)` 时拒绝；否则 `resolveMessageIndex` 定位后 `createBranchInVault` 创建嵌套分支（携带划线文本） |
| `handleExtractNote()` / `confirmExtract()` | LLM 生成草稿预填 `ExtractNoteDialog`；用户改了标题则用新标题重新生成 |

**面包屑**：`主会话 / 分支追问` 两级（`BranchBreadcrumb`），点击返回主会话。

**分叉点上下文（页面顶部区域）**：
- 内容 = 划线内容所在消息中**划线文本上下各三句话**（`aroundHighlight`，按句末标点或换行切分句子），前一条消息只取最后三句；划线文本以品牌色实底白字明显凸显，并在划线处下方渲染虚线。
- 划线文本来自 DOM（渲染后），可能跨 markdown 标记（如 `**加粗**`）导致源文本匹配不到——先原文匹配、失败后用移除标记的宽松匹配（`normalizeForMatch`）定位划线所在句；定位不到时退化为消息开头若干句、不加高亮。**多行划线（选区落在表格内时划线文本为整张表格的 Markdown 源码）按行切分后在句子列表中匹配连续行块**（`findHighlightBlock`），上下文围绕整张表格。**重复文本精确定位**：同一划线文本多次出现时，`findHighlightBlock` 按 `occurrence`（fork_highlight_occ）匹配第 N 处，上下文围绕用户实际划的位置。
- 高亮实现：**不在源文本中预插 `<mark>`（跨标记时会被 marked 破坏语法）**。创建分支时把划线文本持久化到分支文件 frontmatter `fork_highlight`（JSON 字符串保证 YAML 安全）；页面渲染分叉点上下文后，用 `wrapHighlightInDOM` 在 DOM 上把划线文本包裹为 `<mark class="fork-highlight">`（先 unwrap 旧标记保证幂等）。**表格划线例外**：划线文本为表格 Markdown 源码、渲染 DOM 文本无 `|` 分隔符无法定位，且跨单元格切分文本节点会破坏 `<table>` 结构——`isTableHighlight` 判定后改用 `wrapTableInDOM` 把整张渲染表格包裹为高亮标记（源文本不注入 mark，避免破坏表格语法）。
- 创建分支时由 `createBranchInVault` 用 `buildForkContextPreview(父会话消息, forkMessageIndex, highlightedText)` 生成，随分支文件持久化。

**分支会话文件格式**（`sessions/branch-*.md`）：

```markdown
---
session_id: branch_xxx
parent_session: <主会话 id>
fork_point: <分叉消息索引>
fork_highlight: "划线文本（DOM 选择，JSON 字符串）"
---

<!-- fork-context -->
（前一条 · 知枝）
…最后三句…
（划线内容 · 知枝）
…划线文本上下各三句（原文可匹配时划线文本含 <mark class="fork-highlight">，跨标记时不插标签，由 DOM 高亮兜底）…
<!-- /fork-context -->

## 用户 · …

> 已生成笔记: [[notes/a.md|笔记A]] 划线「划线文本」
> 已生成分支: [[branch_1|分支追问]] 划线「划线文本」
```

消息后方的 `> 已生成笔记/分支` 引用行持久化划线文本（`划线「…」`），加载时由 `extractNoteRefsFromSession` 解析（`NoteReference` 增加 `kind`/`highlight` 字段）；渲染时在原消息中把划线文本转为虚线链接，点击跳转对应笔记或分支会话。旧格式（无划线文本）仍兼容。删除笔记/分支时由 `removeSessionReferences` 扫描所有会话文件并移除对应引用行（**路径归一化匹配**：统一小写与正斜杠，兼容 Windows 反斜杠/大小写差异导致的正则匹配失败），避免虚线标记残留；同时 `notes` store 会更新 `lastDeletedNotePath` 删除信号，`MainChatPage`/`BranchChatPage` watch 该信号后从磁盘重新解析当前会话的引用（`refreshNoteRefs`），并进一步经 `filterExistingNoteRefs` **按文件存在性兜底过滤**（分支引用保留，笔记文件已不存在的引用剔除，兼容历史遗留悬空引用）——因为从聊天页跳转资料库删除笔记再返回时，`<router-view :key="$route.fullPath">` 的路由 key 相同会复用组件实例而不重新挂载，若只靠重新加载才会发现引用已被清理，会导致聊天页"已生成笔记"列表残留已删除笔记。

## 3. 组件层（`src/components/chat/`）

### 3.1 `ChatView.vue` — 对话区核心容器

| props | 说明 |
|-------|------|
| `messages: Message[]` | 历史消息 |
| `isStreaming: boolean` | 是否流式中 |
| `streamingText` / `streamingThinking` / `streamingToolStatus` | 流式内容、思考过程、工具状态 |
| `error: string \| null` | 错误条内容 |
| `noteRefs?: NoteReference[]` | 消息 → 笔记引用 |

| emits | 说明 |
|-------|------|
| `retry` | 错误条重试 |
| `extract-note(text, messageIndex)` / `add-to-note(text)` / `create-branch(text, messageIndex)` | 划线菜单动作；`messageIndex` 为划线时 DOM 定位的消息索引（`data-message-index`），避免渲染文本与 markdown 源不一致导致的定位失败 |
| `navigate-note(path)` | 跳转笔记详情 |

逻辑要点：
- 消息容器带 `data-message-index`；流式期间隐藏末尾空的 assistant 占位消息，由流式区域展示。
- `handleMouseUp` 校验选区在 `[data-highlightable="true"]` 元素内才弹出 `HighlightMenu`；同时通过选区祖先的 `closest('[data-message-index]')` 读取消息索引随事件透传。
- **普通文本可复制**：选区不在可划线区域（用户消息、AI 思考过程、流式文本等）时，只调用 `dismissHighlightMenu` 收起划线菜单、**不清除用户选区**（区别于 `closeHighlightMenu` 里的 `removeAllRanges`），保证用户消息与思考过程等文本拖选后可直接 Ctrl+C / 右键复制。
- **表格摘录还原**：选区落在表格内时（`findSelectionTable` 依次查 commonAncestor/start/end 的 `closest('table')`），按 `isSelectionWithinSingleCell`（start/end/commonAncestor 是否在同一 td/th 内）区分两种摘录——**跨单元格/跨行**（划整张表格）时改用 `tableToMarkdown`（`src/utils/table-to-markdown.ts`）把整张表格 DOM 还原为带 `|` 分隔符与表头分隔行的 Markdown 表格（`window.getSelection().toString()` 只返回渲染后文本节点，会丢失表格结构标志）；**单个单元格内划线**（如只划「托卡马克」几个字）时用 `selection.toString()` 摘录文字本身，避免把表格格式误当成划线内容。单元格内字面 `|` 会转义为 `\|`，避免摘录源码把单元格拆成多列。
- 按 `messageIndex` 过滤 noteRefs，渲染 `[[标题]]` 跳转按钮。
- watch 消息长度/流式文本变化 → `nextTick` 自动滚动到底部。

### 3.2 `ChatMessage.vue` — 单条消息

- props：`message: Message`、`noteCount?`、`marks?: NoteReference[]`（该消息的划线标记）。
- 按角色区分样式；assistant 用 `marked(content, {breaks:true, gfm:true})` 渲染 Markdown。
- **用户提问样式**：`.chat-message__prompt` 提示框背景 `#eae4d6`（较浅的 `#f6f4ed` 加深一级）、正文墨色 `var(--ink)`（原 `--ink-2` 偏灰不够醒目）、字号 15px（原 14px），让用户提问与 AI 回答在视觉上区分度更高。
- **CJK 加粗预处理**：渲染前先经 `preprocessMarkdownForRendering`（`src/utils/markdown-preprocess.ts`）把 `**"X"**` 变换为 `"**X**"`（引号/括号移到 `**` 外侧）。GFM flanking 规则下，`**"濑尿虾"**是` 这类"标点紧贴 `**` 且外侧为非标点"的写法会使定界符不满足 left/right-flanking，加粗退化为字面 `**`（AI 回答常见输出）。变换后 `**` 两侧均为非标点，加粗正常；代码块与行内代码先以占位符保护避免被改写。分支页分叉点上下文（`BranchChatPage.renderedForkContext`）同样先预处理再 `marked.parse`。
- **框线字符画流程图渲染**：AI 常以 `┌─┐` / `│` / `└─┘` / `▼` / `→` 等 Unicode 框线字符，或用 `+---+` / `|` / `v` 等 ASCII 字符拼出流程图。这类内容若落在普通段落，HTML 会折叠连续空格、且用非等宽字体，导致框线错位。`preprocessMarkdownForRendering` 在加粗预处理后调用 `wrapDiagramBlocks`：按空行分段，对「至少两处框线字符，或一处框线字符配箭头/形状字符」（Unicode 框线）、或「`+` 紧邻至少两个 `-`」（ASCII 盒子角）的段落包裹为 `text` 围栏代码块，交给 `<pre><code>` 以等宽字体 + 保留空白渲染；单个 `→` 之类出现在普通句子里不会被误判，正负号 `+-`（单个 `-`）与 Markdown 表格（`|`/`-` 分隔）也不会被误判。
- **Mermaid 代码块渲染**：AI 输出 ```` ```mermaid ```` 围栏代码块时，`marked` 默认只产出 `<pre><code class="language-mermaid">` 源码。`renderMermaidBlocks`（`src/utils/mermaid-render.ts`）在 `v-html` 渲染后（`nextTick`）查找 `pre > code.language-mermaid`，懒加载 `mermaid` 并调用 `mermaid.render(id, code)` 生成 SVG，用 `<div class="zhizhi-mermaid">` 替换原 `<pre>`；`mermaid` 采用**懒加载 + `startOnLoad:false` + `securityLevel:'strict'`**，仅在首次出现 mermaid 块时加载并 `initialize`，避免拖慢首屏。渲染失败（如语法非法）时**保留原始代码块**，便于查看/调试源码。执行顺序：该渲染先于划线标记包裹（`applyMarkLinks`）执行，避免 SVG 替换影响文本节点定位。SVG 容器白底独立卡片、超宽横向滚动、`max-width:100%` 自适应。
- 正文容器标记 `data-highlightable="true"` 供划线识别；`thinking` 非空时渲染 `ThinkingBlock`。
- **划线标记**：先由 `marked` 渲染出完整 HTML，再用 `wrapHighlightInDOM`（`src/utils/highlight-dom.ts`）把划线文本包裹为 `<a class="zhizhi-mark" data-zhizhi-kind="note|branch" data-zhizhi-id="…">`（**渲染后 DOM 包裹**，不在 markdown 源中插入标签——当划线文本位于 `**加粗**` / `*斜体*` 等行内标记内部时，marked 无法让 delimiter 跨 HTML 标签配对，加粗等语法会被破坏成字面 `**`）。该工具拼接全部文本节点定位划线起止区间并跨节点切分合并，因此划线文本位于单个文本节点内、或跨加粗/斜体边界（如划选 `名字——**"富贵虾"**` 的视觉范围）时都能正确显示虚线。**重复文本精确定位**：同一划线文本在消息中多次出现（如「E = mc²」在正文与列表各一次）时，划线时计算其出现序号（`selectionOccurrence`，TreeWalker 文本模型），持久化到引用行 `划线「text」〔N〕` / 分支 frontmatter `fork_highlight_occ`，应用时 `wrapHighlightInDOM` 按 `occurrence` 定位到用户实际划的位置（否则高亮总会落在第一处）。**表格划线场景**（划线文本为整张表格 Markdown 源码）用 `isTableHighlight` 判定后走 `wrapTableInDOM` 整表包裹虚线链接（见分叉点上下文高亮说明）。以品牌色 + 虚线标识原会话中的划线位置。点击后 `preventDefault` 并 emit `navigate-link({kind, id})`（id 已 decodeURIComponent）。执行时机：`onMounted` 兜底 + watch `[renderedContent, marks]`，`nextTick` 后调用，且每轮先 `unwrapHighlight` 旧标记保证幂等。

### 3.3 `StreamText.vue` — 流式文本

- 对不完整 Markdown 做容错粗渲染（仅加粗/斜体/行内代码/换行），避免流式期花屏。
- props：`text`、`isStreaming`；流式中末尾显示闪烁光标 `|`。

### 3.4 `ThinkingBlock.vue` — 思考过程

- props：`text`、`startExpanded?`（流式中默认展开、结束后默认折叠）。
- 折叠式展示 AI 的 `thinking` 内容（Anthropic `thinking_delta` / OpenAI `reasoning_content`）。
- **思考过程持久化**：`session-serializer` 将 `message.thinking` 以 `<!-- thinking -->` 区块写入会话 md（assistant 消息正文前，`-->` 转义为 `--&gt;`）；`parseSessionMessages` 解析时提取回 `message.thinking`。因此切换到其他会话再切回时，思考过程仍能还原展示，不丢失（详见 [11-parsers-serializers.md](./11-parsers-serializers.md)）。

### 3.5 `Composer.vue` — 底部输入框

- props：`isStreaming`、`disabled`、`placeholder?`；emits：`send(content)`、`stop`。
- Enter 发送 / Shift+Enter 换行；textarea 自动增高（max 200px）；流式中切换为停止按钮。

### 3.6 `HighlightMenu.vue` — 划线浮动菜单

- Teleport 到 body；fixed 定位 `translate(-50%,-120%)`。
- props：`visible`、`x`、`y`、`highlightedText`、`messageIndex?`（划线消息的 DOM 索引）、`showAddToNote?`。
- emits：`close`、`extract-note(text, messageIndex)`、`add-to-note(text)`、`create-branch(text, messageIndex)`、`copy(text)`（剪贴板）。
- 点击外部 / ESC 关闭（document 级监听，卸载时移除）。

### 3.7 分支展示

> 注：`BranchTree.vue` / `TreeNode.vue` 曾用于学习地图"学习总览"视图的会话树展示；学习总览视图已移除（与主界面重合），这两个组件随之删除。会话分支现由左侧会话栏的 `ThreadBranch.vue` 与 `BranchBreadcrumb.vue` 呈现。

| 组件 | 说明 |
|------|------|
| `BranchBreadcrumb.vue` | 分支页面包屑；props `breadcrumbs: BreadcrumbItem[]`；emits `navigate(target)`；含"← 返回主对话" |

## 4. 与其他模块的协作

```
MainChatPage / BranchChatPage
   ├─ settingsStore.getProviderConfig() → createProvider()   [08 LLM API 适配层]
   ├─ retrieveKnowledgeContext(query) → RAG 注入             [10 Embedding]
   ├─ chatWithTools / branchFollowupStream                  [08 / 09 Skill]
   ├─ sessionStore.createBranchInVault / loadBranchContext   [12 Stores / 11 utils]
   ├─ noteStore.saveNote / extractNote                      [03 笔记 / 09 Skill]
   └─ vaultStore.saveCurrentSession → sessions/*.md          [07 Vault]
```

## 5. 相关测试

- `src/components/chat/ChatMessage.test.ts`、`ThinkingBlock.test.ts`
- `src/utils/mermaid-render.test.ts`
- `src/views/MainChatPage.test.ts`
- `src/api/chat-loop.test.ts`、`src/api/skills/branch-followup.test.ts`

---

> 上一模块 → [01 应用外壳与路由](./01-application-shell.md)  
> 下一模块 → [03 笔记模块](./03-notes-module.md)
