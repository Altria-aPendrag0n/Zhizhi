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

`NoteMeta` 为列表使用的轻量元数据（无 `content` / `review`，含可选 `proposition`）。

## 3. 页面层

### 3.1 `NotesPage.vue`（路由 `/notes`）— 资料库

- 两个 tab：`笔记` 与 `参考资料`（由 `route.query.tab === 'references'` 决定，`activeTab` 本地状态）。
- 组合组件：`NoteList`、`ReferenceList`、`ReferenceEditDialog`。
- 逻辑：
  - watch `vaultPath` 与 `query.tab` 按需 `loadAllNotes` / `loadAllReferences`。
  - **防闪烁**：启动时 vault 恢复未完成（`vaultStore.vaultReady === false`）先显示"正在打开资料库"加载占位；恢复完成后无论是否打开 vault 都直接渲染内容——vault 未打开时展示**本地缓存笔记**（`noteStore.notes` 初值来自 localStorage `study-thread-extracted-notes`）并附"未连接 Vault"提示横幅（去 `/settings` 打开），不再显示旧版"请先打开 Vault"死胡同页。
  - 删除笔记/参考资料均先 `window.confirm` 再调 store。
  - 参考资料上传走隐藏 file input → `referenceStore.uploadReference`。

### 3.2 `NoteDetailPage.vue`（路由 `/notes/:id`）— 笔记详情

- 组合组件：`NoteDetail`、`Backlinks`、`LocalGraph`、`ExtractNoteDialog`。
- 关键逻辑：
  - `loadNote`：按 `params.id`（decodeURIComponent）加载笔记 → 刷新反链 → 更新面包屑（`inject('updateNoteBreadcrumbTitle')`）。
  - `loadBacklinks`：遍历其余笔记解析 wikilink，命中当前笔记的记录 `{sourcePath, title, context(命中行原文)}`。
  - `handleNoteUpdate`：300ms 防抖后 `noteStore.updateNote` 保存。
  - `handleCreateBranch`：若笔记有 `source.session` 则从来源会话文件解析父会话（含 fork 定位）；否则构造 `note_root_<timestamp>` 虚拟根会话，再 `createBranchInVault`。
  - `hasGraphRelations`：有出链或反链时渲染 `LocalGraph`（depth=1）。

## 4. 组件层（`src/components/notes/`）

### 4.1 `NoteList.vue` — 笔记列表容器

- props：`notes: NoteMeta[]`、`selectedPath?`、`loading?`；emits：`select(path)`、`openSource(source)`、`delete(path)`。
- 链式过滤：排序（updated/created/title）+ 类型过滤 + 关键词搜索（标题/标签）→ `filteredNotes`。
- **加载占位仅在 `loading && notes.length === 0` 时显示**：已有缓存笔记时立即渲染列表（后台静默刷新），避免每次进入资料库都闪现"正在加载笔记…"中间态。
- 右键菜单 Teleport 定位（边缘 clamp）；document 级 pointerdown / Escape 关闭。

### 4.2 `NoteCard.vue` — 笔记卡片

- props：`note: NoteMeta`、`isSelected?`；emits：`select(path)`、`openSource(source)`、`contextmenu(event)`。
- 类型徽标：`concept 概念卡 / method 方法卡 / fact 事实卡 / question 问题卡`。
- 展示标题、描述/命题、标签、短日期（`formatNoteShortDate`）、来源会话按钮。

### 4.3 `NoteDetail.vue` — 笔记详情主体

- props：`note: Note | null`、`loading?`；emits：`update(note)`、`openSource(source)`、`extractNote(text)`、`createBranch(text)`。
- 内联编辑标题/标签（增删）；嵌入 `MarkdownEditor`；展示来源会话与划线引用。
- `handleMouseUp` 校验选区在编辑器容器内才弹 `HighlightMenu`，且**不清除浏览器选区**（避免破坏 CodeMirror 光标）。

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
| `loadNote(path)` | 读文件 → `parseFrontmatter` → 组装 `Note`（缓存于 noteIndex） |
| `updateNote(note)` | 重写文件：保留原 meta，仅更新 title/tags/updated；刷新列表与本地缓存 |
| `saveNote(vaultPath, extractedNote, sourceSession, highlight)` | 生成文件名 `notes/<sanitized>.md` → `serializeNote` 写入 → 更新列表 |
| `deleteNote(path)` | 路径校验（必须位于 `<vault>/notes/` 且 `.md`）→ 删除文件、本地缓存与向量索引 |

- 本地缓存键：`study-thread-extracted-notes`。
- `collectNotes` 递归遍历目录；`normalizePath` 规范化路径用于删除校验。

### 5.2 `utils/note-serializer.ts`

| 函数 | 说明 |
|------|------|
| `serializeNote(note, sourceSession, highlightSource)` | 生成完整 Markdown：frontmatter（title/description/type/tags/created/updated/source/confidence）+ 正文（`# 标题` + 划线原文原样） |
| `generateNoteFileName(title)` | 清理非法字符（`\ / : * ? " < > \|`）、空白转 `_`、截断 80 字符，拼 `.md` |

### 5.3 `utils/note-insert.ts` — 划线插入

| 函数 | 说明 |
|------|------|
| `insertHighlightAt(markdown, headingLine, highlightedText)` | 插入到指定标题小节末尾（边界 = 下一个同级/更高级标题之前）；标题不存在时抛错 |
| `insertHighlightAtEnd(markdown, highlightedText)` | 插入到文件末尾 |

`insertBlockAt` 保证插入块与上下文之间有空白行分隔（前导/尾部自动补齐）。

### 5.4 `utils/session-linker.ts` — 会话 ↔ 笔记关联

| 函数 | 说明 |
|------|------|
| `getNoteSourceSession(notePath)` | 读取笔记 frontmatter 的 `source.session/highlight` |
| `extractNoteRefsFromSession(sessionContent)` | 解析会话文件中的 `> 已生成笔记: [[path|title]]` 行，按消息分界（`## 用户/知枝/系统`）映射到 `messageIndex` |
| `findNotesBySession(sessionPath, allNotes)` | 按 `source.session` 过滤笔记 |

## 6. 协作链路

- 摘录生成：`MainChatPage.handleExtractNote` → `extractNote`（[09 Skill]）→ `noteStore.saveNote`。
- 加入笔记：`ChatView` 划线 → `AddToNoteDialog` → `note-insert` 插入 → `noteStore.updateNote`。
- 反链与关系图：`NoteDetailPage` → `parser/wikilink`（[11]）+ `LocalGraph`（[06]）。
- 向量索引：`noteStore.saveNote/updateNote/deleteNote` 同步 `getNoteIndexer()` 更新（[10]）。

## 7. 相关测试

- `src/stores/notes.test.ts`、`src/utils/note-serializer.test.ts`、`src/utils/note-insert.test.ts`、`src/utils/session-linker.test.ts`
- `src/components/notes/AddToNoteDialog.test.ts`、`NoteCard.test.ts`、`NoteDetail.test.ts`、`NoteList.test.ts`
- `src/views/NotesPage.test.ts`

---

> 上一模块 → [02 学习对话模块](./02-chat-module.md)  
> 下一模块 → [04 参考资料模块](./04-references-module.md)
