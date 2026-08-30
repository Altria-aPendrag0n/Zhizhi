# 03 · 笔记模块

> 本模块覆盖：笔记列表/详情/编辑页面、摘录弹窗、加入笔记弹窗，以及笔记的读写与序列化。
> 相关代码：`study-thread/src/components/notes/`、`study-thread/src/views/NotesPage.vue`、`study-thread/src/views/NoteDetailPage.vue`、`study-thread/src/stores/notes.ts`、`study-thread/src/utils/note-serializer.ts`、`study-thread/src/utils/note-insert.ts`、`study-thread/src/utils/session-linker.ts`。

---

## 1. 模块职责

- 管理 `notes/` 目录下的原子笔记（Markdown 文件，YAML frontmatter + 正文）。
- 提供笔记列表（排序/过滤/搜索）、详情（内联编辑 + 反链 + 局部图谱）、摘录为笔记、划线加入已有笔记。
- 维护"消息 ↔ 笔记"引用关系（`NoteReference`），支持从笔记跳回来源会话、从笔记创建分支。

## 2. 数据模型（`src/types/index.ts`）

```ts
interface Note {
  path: string
  title: string
  description?: string
  type: 'concept' | 'method' | 'fact' | 'question'
  tags: string[]
  created: string
  updated: string
  source?: { session: string; highlight: string }  // 来源会话 + 划线原文
  confidence: number
  review: { next: string | null; interval: number; mastery: number }
  content: string                                   // frontmatter 之后的正文
}
```

`NoteMeta` 为列表使用的轻量元数据（无 `content` / `review`，含可选 `proposition` 与 `links?: string[]`，后者为 json sidecar 中记录的关联笔记路径列表）。

## 3. 页面层

### 3.1 `NotesPage.vue`（路由 `/notes`）— 资料库

- 三个 tab：`笔记`、`参考资料` 与 `复习会话`（由 `route.query.tab` 决定：`references` / `reviews`，缺省为 `notes`）。
- 组合组件：`NoteList`、`ReferenceList`、`ReferenceEditDialog`、`ReviewSessionList`。
- 逻辑：
  - watch `vaultPath` 与 `query.tab` 按需 `loadAllNotes` / `loadAllReferences` / `listReviewSessions`。
  - **防闪烁**：启动时 vault 恢复未完成（`vaultStore.vaultReady === false`）先显示"正在打开资料库"加载占位；恢复完成后无论是否打开 vault 都直接渲染内容——vault 未打开时展示**本地缓存笔记**（`noteStore.notes` 初值来自 localStorage `study-thread-extracted-notes`）并附"未连接 Vault"提示横幅（去 `/settings` 打开），不再显示旧版"请先打开 Vault"死胡同页。
  - **进入资料库的跳转路径**：点击 rail「资料库」（`App.vue handleProjectSelect('2')`）只会 `push({ path: '/notes' })` 一次，源码路由表无任何旧资料库路由。若运行的是**过期构建产物**（`dist/` 未重新 build，例如 `tauri build`/`npm run preview` 跑的是旧 `dist`），打包的是旧版 NotesPage，会在未打开 vault 时显示"请先打开 Vault"死胡同页——这是构建产物不同步导致的，源码改动后需重新 `npm run build`（`tauri build` 的 `beforeBuildCommand` 会自动执行）。
  - 删除笔记/参考资料均先 `window.confirm` 再调 store。
  - 参考资料上传走隐藏 file input → `referenceStore.uploadReference`。
  - **复习会话 tab**：`ReviewSessionList` 展示 `listReviewSessions` 返回的复习会话列表（标题/被复习笔记/题目数/完成状态/时间，按创建倒序），点击条目跳转 `/review/:id` 回看错题与反馈（完成复习后会话保留，见 [14-review-module.md](./14-review-module.md)）。列表顶部提供**关键词搜索**（匹配标题与被复习笔记路径，忽略大小写）与**按指定日期筛选**（`type="date"` 输入框，仅显示该本地日期创建的会话），二者可叠加；有筛选条件时显示「清除」按钮，无匹配时展示"没有匹配的复习会话"空态。

### 3.2 `NoteDetailPage.vue`（路由 `/notes/:id`）— 笔记详情

- 组合组件：`NoteDetail`、`Backlinks`、`LocalGraph`、`ExtractNoteDialog`。
- 关键逻辑：
  - `loadNote`：按 `params.id`（decodeURIComponent）加载笔记 → 刷新反链 → 更新面包屑（`inject('updateNoteBreadcrumbTitle')`）。
  - `loadBacklinks`：遍历其余笔记解析 wikilink，命中当前笔记的记录 `{sourcePath, title, context(命中行原文)}`。
  - `handleNoteUpdate`：300ms 防抖后 `noteStore.updateNote` 保存。
  - `handleCreateBranch`：若笔记有 `source.session` 则从来源会话文件解析父会话（含 fork 定位）；否则构造 `note_root_<timestamp>` 虚拟根会话，再 `createBranchInVault`。
  - **全量关系图**：详情页下方固定展示 `LocalGraph`（`:depth="Infinity"`，全量模式）——所有笔记节点与全部 wikilink 联系，不限制深度，孤立笔记也展示；当前笔记高亮为中心节点。工具栏可切换「1 度 / 2 度 / 全部」聚焦局部。

## 4. 组件层（`src/components/notes/`）

### 4.1 `NoteList.vue` — 笔记列表容器

- props：`notes: NoteMeta[]`、`selectedPath?`、`loading?`；emits：`select(path)`、`openSource(source)`、`delete(path)`。
- 链式过滤：排序（updated/created/title）+ 标签筛选（逗号/空格分隔多条件，需同时满足，AND 匹配，输入框带 `datalist` 汇总所有已有标签提示）+ 关键词搜索（标题/标签）→ `filteredNotes`。
- **新建笔记入口**：工具栏「新建笔记」按钮 → 下拉菜单（**空白笔记** / 从图片导入）：
  - 「空白笔记」→ emit `create-blank` → NotesPage 创建默认标题「无标题笔记」（与已有笔记重名自动追加序号）并跳转详情编辑；
  - 「从图片导入」→ emit `create-from-image` → NotesPage 打开 [19 图片转笔记](./19-image-to-note.md) 的 note 模式弹窗。
  - 菜单为 `position: fixed` 且**按按钮位置动态定位**（跟随按钮右下对齐，视口边界自动收缩），避免 Teleport 到 body 后无定位落在视口外。
- **单字/拼音匹配**：筛选与搜索统一走 `utils/pinyin-match.ts` 的 `tagMatchesQuery`——中文按子串匹配（输入 `虾` 命中所有含"虾"字的标签），纯字母输入按拼音匹配（全拼 `xia` / 首字母 `dsx`，经 `pinyin-pro` 转换，含 Map 缓存）。
- **加载占位仅在 `loading && notes.length === 0` 时显示**：已有缓存笔记时立即渲染列表（后台静默刷新），避免每次进入资料库都闪现"正在加载笔记…"中间态。
- 右键菜单 Teleport 定位（边缘 clamp）；document 级 pointerdown / Escape 关闭。

### 4.2 `NoteCard.vue` — 笔记卡片

- props：`note: NoteMeta`、`isSelected?`；emits：`select(path)`、`openSource(source)`、`contextmenu(event)`。
- 展示标题、描述/命题、标签、短日期（`formatNoteShortDate`）、来源会话按钮。
- **不展示笔记分类**：概念卡/方法卡/事实卡/问题卡等分类概念已取消（`type` 字段仅保留数据兼容，UI 不再显示）。

### 4.3 `NoteDetail.vue` — 笔记详情主体

- props：`note: Note | null`、`loading?`；emits：`update(note)`、`openSource(source)`、`extractNote(text)`、`createBranch(text)`、`image-import`。
- 内联编辑标题/标签（增删）；嵌入 `MarkdownEditor`；展示来源会话与划线引用。
- `handleMouseUp` 校验选区在编辑器容器内才弹 `HighlightMenu`，且**不清除浏览器选区**（避免破坏 CodeMirror 光标）。
- **图片导入**：编辑器「图片导入」事件向上透传 `image-import`（页面层打开 [19 图片转笔记](./19-image-to-note.md) insert 模式弹窗）；`defineExpose({ insertMarkdownAtCursor })` 转发给内部编辑器，识别结果插入光标处。

### 4.4 `ExtractNoteDialog.vue` — 摘录为笔记弹窗

- props：`visible`、`title`（LLM 预填建议标题）、`highlightedText`、`loading?`、`saving?`、`error?`；emits：`close`、`confirm(title)`。
- 打开时聚焦并全选标题；Enter 确认；saving 时禁止取消。

### 4.5 `AddToNoteDialog.vue` — 两步式"加入笔记"弹窗

- 第一步选笔记（按 updated 排序），第二步选插入位置（文件末尾或某 heading 行）。
- emits：`confirm(target: AddToNoteTarget)`，其中 `AddToNoteTarget = { notePath, headingLine, headingText, body }`。
- `openHeadings` 用 `parseHeadings` 解析标题大纲；`selectedHeading === null` 表示文件末尾。

## 5. Store 与序列化

### 5.1 `stores/notes.ts`

| 状态 | 说明 |
|------|------|
| `localNotes` / `notes` | 本地缓存的笔记元数据 / vault 中的笔记列表（按 updated 降序） |
| `noteIndex` | `Map<path, Note>` 详情缓存 |
| `isLoading` / `currentVaultPath` | 加载状态与当前 vault |

| 动作 | 说明 |
|------|------|
| `loadAllNotes(vaultPath)` | 递归收集 `notes/` 下所有 `.md`（`collectNotes`），过滤掉本地缓存中已不在 vault 的条目 |
| `loadNote(path)` | 读文件 → `readNoteMeta`（json 优先，frontmatter 兜底）→ `parseFrontmatter` 取正文 → 组装 `Note`（缓存于 noteIndex） |
| `updateNote(note)` | 重写文件：保留原 meta，仅更新 title/tags/updated；**同步重写 json sidecar**（含关联笔记 links）；刷新列表与本地缓存 |
| `saveNote(vaultPath, extractedNote, sourceSession, highlight, body?)` | 生成文件名 `notes/<sanitized>.md` → `serializeNote` 写入 md → **写入 json sidecar**（结构化元数据权威源）→ 更新列表；可选 `body` 指定正文（图片转笔记场景，缺省用划线原文） |
| `deleteNote(path)` | 路径校验（必须位于 `<vault>/notes/` 且 `.md`）→ 删除 md 与 json sidecar、本地缓存与向量索引 |

- 本地缓存键：`study-thread-extracted-notes`。
- `collectNotes` 递归遍历目录；`normalizePath` 规范化路径用于删除校验。
- **json sidecar 读写策略**：`readNoteMeta(path, fileName, mdContent)` 先尝试解析 `notes/<标题>.json`（`parseNoteMetaFile`），有效则以其为准（时间/标签/描述/来源/关联笔记），缺失或损坏回退 `toNoteMeta` 解析 md frontmatter，兼容 json 方案之前写入的旧笔记。

### 5.2 `utils/note-serializer.ts`

| 函数 | 说明 |
|------|------|
| `serializeNote(note, sourceSession, highlightSource, body?)` | 生成完整 Markdown：frontmatter + 正文（`# 标题` + 划线原文原样；可选 `body` 覆盖正文，图片转笔记场景传入识别出的 Markdown）。**所有字符串字段经 `JSON.stringify` 序列化**（title/description/session/highlight/各标签）：既转义引号，也把多行划线文本（如表格）的换行转义为 `\n`，避免 YAML 因裸换行整体解析失败而丢失 tags 等字段 |
| `generateNoteFileName(title)` | 清理非法字符（`\ / : * ? " < > \|`）、空白转 `_`、截断 80 字符，拼 `.md` |
| `getNoteMetaPath(notePath)` | 返回对应 json sidecar 路径：`notes/<标题>.md` → `notes/<标题>.json` |
| `serializeNoteMeta(meta, links)` | 将 `NoteMeta`（附关联笔记 links）序列化为格式化 JSON 文本 |
| `parseNoteMetaFile(content)` | 解析 json sidecar 为 `NoteMeta`；无效 JSON / 缺 title 返回 `null` |

### 5.3 `utils/note-insert.ts` — 划线插入

| 函数 | 说明 |
|------|------|
| `insertHighlightAt(markdown, headingLine, highlightedText)` | 插入到指定标题小节末尾（边界 = 下一个同级/更高级标题之前）；标题不存在时抛错 |
| `insertHighlightAtEnd(markdown, highlightedText)` | 插入到文件末尾 |

`insertBlockAt` 保证插入块与上下文之间有空白行分隔（前导/尾部自动补齐）。

### 5.4 `utils/session-linker.ts` — 会话 ↔ 笔记关联

| 函数 | 说明 |
|------|------|
| `getNoteSourceSession(notePath)` | 读取笔记 frontmatter 的 `source.session/highlight`（`session` 为稳定 id，旧路径由调用侧归一化） |
| `extractNoteRefsFromSession(sessionContent)` | 解析会话文件中的 `> 已生成笔记: [[path|title]]` 行，按消息分界（`## 用户/知枝/系统`）映射到 `messageIndex` |
| `findNotesBySession(sessionId, allNotes)` | 按 `source.session` 过滤笔记；入参与笔记引用统一经 `sessionIdFromReference` 归一化，兼容旧路径与新稳定 id |
| `removeSessionReferences(vaultPath, targets, kind)` | 删除笔记/分支后清理会话文件中的对应引用行；**路径归一化匹配**（统一小写与正斜杠，兼容 Windows 混合分隔符） |
| `filterExistingNoteRefs(refs)` | 按文件存在性过滤已删除笔记的悬空引用（分支引用保留），聊天页 `refreshNoteRefs` 兜底使用 |

## 6. 协作链路

- 摘录生成：`MainChatPage.handleExtractNote` → `extractNote`（[09 Skill]）→ `noteStore.saveNote`。
- **标签兜底与 YAML 安全**：`extractNote` 在 LLM 返回空 tags 时兜底 `['未分类']`（笔记始终有可展示标签）；`serializeNote` 用 JSON 字符串序列化每个标签（`  - "标签"`），避免标签含 `:`/`#` 等 YAML 特殊字符时被解析成对象/注释而丢失。
- **json sidecar 元数据权威源**：每个笔记 `notes/<标题>.md` 配同名 `<标题>.json`，保存时间/标签/描述/来源/关联笔记（`links`，来自正文 wikilink 的 `extractAllLinks`）等结构化信息。md 内 frontmatter 保留供 Obsidian 等外部工具查看；应用内读取 json 优先，缺失时回退 frontmatter（兼容旧笔记）。保存/更新同步写 json，删除笔记级联删除 json。
- **旧笔记 frontmatter 容错**：旧版本 `serializeNote` 曾把多行划线文本（表格）裸写入 `highlight` 字段，换行未转义导致整个 frontmatter YAML 解析失败（tags 等字段一并丢失）。`parser/frontmatter.ts` 的 `parseFrontmatter` 捕获解析失败后调用 `parseFrontmatterLenient`：丢弃跨行未闭合的 highlight 值再重新解析，尽力恢复 title/tags/description 等关键字段。
- **LLM 生成开关**：设置页的「自动生成笔记标题 / 自动生成笔记标签」控制摘录时是否调用 LLM 生成对应字段。标题关闭时用划线文本前 20 字兜底（用户手动指定的标题始终优先）；标签关闭时统一 `['未分类']`。两个开关都关闭时 `extractNote` 完全不调用 LLM（描述同样用划线文本前 80 字兜底），调用方（`MainChatPage`/`BranchChatPage`/`NoteDetailPage`）也会跳过 API Key 校验。
- 加入笔记：`ChatView` 划线 → `AddToNoteDialog` → `note-insert` 插入 → `noteStore.updateNote`。
- **图片转笔记**：`NotesPage`（新建笔记 note 模式）/ `NoteDetailPage`（编辑器导入 insert 模式）打开 `ImageToMarkdownDialog` → `imageToMarkdown` 识别 → note 模式 `noteStore.saveNote(vaultPath, note, '', markdown, markdown)`（正文 = 识别出的 Markdown），insert 模式经 `insertMarkdownAtCursor` 插入光标处（见 [19 图片转笔记](./19-image-to-note.md)）。
- 反链与关系图：`NoteDetailPage` → `parser/wikilink`（[11]）+ `LocalGraph`（[06]）。
- 向量索引：`noteStore.saveNote/updateNote/deleteNote` 同步 `getNoteIndexer()` 更新（[10]）。

## 7. 相关测试

- `src/stores/notes.test.ts`、`src/utils/note-serializer.test.ts`、`src/utils/note-insert.test.ts`、`src/utils/session-linker.test.ts`、`src/utils/pinyin-match.test.ts`
- `src/parser/frontmatter.test.ts`（含旧版多行 highlight 损坏 frontmatter 的宽松容错用例）
- `src/components/notes/AddToNoteDialog.test.ts`、`NoteCard.test.ts`、`NoteDetail.test.ts`、`NoteList.test.ts`
- `src/views/NotesPage.test.ts`

---

> 上一模块 → [02 学习对话模块](./02-chat-module.md)  
> 下一模块 → [04 参考资料模块](./04-references-module.md)
