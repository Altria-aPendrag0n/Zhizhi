# 05 · Markdown 编辑器模块

> 本模块覆盖：基于 CodeMirror 6 的 Markdown 编辑器（Live Preview 式实时预览、wikilink 高亮与跳转、`[[` 补全、语义相关链接建议）以及反链面板。
> 相关代码：`study-thread/src/components/editor/`。

---

## 1. 模块职责

- 提供类 Obsidian 的 Markdown 编辑体验：**光标所在行显示源码，其余行实时渲染预览**。
- `[[wikilink]]` 双向链接：源码/预览行内高亮（resolved / unresolved）、点击跳转笔记。
- `[[` 输入触发笔记标题自动补全（Obsidian 风格）。
- 编辑时基于本地向量检索推荐语义相关的笔记链接（`LinkHint` 浮层）。
- `Backlinks` 面板展示引用当前笔记的所有来源。

## 2. 关键文件

| 文件 | 职责 |
|------|------|
| `MarkdownEditor.vue` | CodeMirror 6 编辑器封装：extensions 组装、实时预览、wikilink、补全、链接建议 |
| `wikilinkAutocomplete.ts` | `[[` 补全源（`createWikiLinkCompletionSource`） |
| `LinkHint.vue` | 语义相关笔记建议浮层 |
| `Backlinks.vue` | 反链面板 |

## 3. `MarkdownEditor.vue` 核心机制

### 3.1 props / emits

- props：`modelValue: string`（双向绑定正文）、`readonly?`、`currentNotePath?`（补全排除自身）。
- emits：`update:modelValue`。

### 3.2 CodeMirror 6 关键结构

| 概念 | 实现 |
|------|------|
| `EditorState` / `EditorView` | 编辑器核心 |
| `livePreviewField`（`StateField` + 自定义 `MarkdownLineWidget extends WidgetType`） | 非光标行渲染预览 HTML（标题/引用/列表/代码块/行内格式/wikilink），光标行显示源码 |
| 表格块渲染（`MarkdownTableWidget`） | 连续表格行且含分隔行时整块合并为一个 widget 渲染 `<table>`（表头/分隔/表体，单元格支持加粗/代码/wikilink）；光标落在表格内时整块保持源码可编辑；`|` 转义（`\|`）与行内代码内的 `|` 不做分隔 |
| `wikiLinkField` | 源码行内 `[[...]]` 打 `cm-wikilink--resolved / cm-wikilink--unresolved` 装饰 |
| `autocompletion.override = createWikiLinkCompletionSource(notes, currentNotePath)` | `[[` 补全 |
| `editableCompartment` | 控制 `readonly` |
| 工具栏 | 加粗/斜体/列表/引用等（`@codemirror/commands` + `@lucide/vue` 图标） |

### 3.3 交互逻辑

| 函数 | 说明 |
|------|------|
| `handleMouseDown` | 预览行 wikilink 或源码 wikilink 点击 → 跳转 `/notes/<path>`；点击预览行 → 切回源码并定位光标 |
| `triggerLinkSuggestions` | 500ms 防抖：`[[` 未闭合时交给补全（跳过语义检索）；否则 `linker.suggestLinks(currentNotePath, paragraphText, 5)` 显示 `LinkHint` |
| `updateContent` | 外部 `modelValue` 变化时 diff 后 dispatch 替换（避免光标跳动） |
| `createEditor` | 组装全部 extensions 并挂载 |

### 3.4 依赖的向量能力

- `NoteLinker`（`../../embedding/linker`）、`getNoteIndexer()`、`getEmbeddingEngine()`：语义链接建议（详见 [10-embedding-module.md](./10-embedding-module.md)）。
- `parseWikiLinks` / `resolveWikiLinkTarget`（`../../parser/wikilink`）：wikilink 解析与命中判定。
- `useNoteStore`：提供笔记元数据列表。

## 4. `wikilinkAutocomplete.ts`

- 导出 `createWikiLinkCompletionSource(notes: NoteMeta[], currentNotePath?)` → CodeMirror `CompletionSource`。
- 匹配规则：光标前 80 字符窗口内匹配 `\[\[([^\[\]]*)$`；无未闭合 `[[` 返回 `null`。
- 标题大小写不敏感过滤、排除自身、最多 20 条。
- `apply` 逻辑：光标后已有闭合 `]]` 则只替换 query 保留 `]]`，否则补全为 `标题]]`。

## 5. `LinkHint.vue` — 语义相关建议浮层

- props：`suggestions: LinkSuggestion[]`（来自 `embedding/linker`）；emits：`close`、`select(item)`。
- 展示标题与相似度百分比（`(similarity * 100).toFixed(0)%`）；点击选择后插入 wikilink。

## 6. `Backlinks.vue` — 反链面板

- 导出 `BacklinkEntry` 接口 `{ sourcePath: string; title: string; context: string }`。
- props：`backlinks: BacklinkEntry[]`、`loading?`；emits：`navigate(path)`。
- 三态展示：loading / 空（"暂无反向链接"）/ 列表；context 用 `v-html` 渲染命中行；点击条目跳转来源笔记。

## 7. 协作链路

```
NoteDetailPage ──► NoteDetail ──► MarkdownEditor（modelValue ⇄ note.content）
   ├─ 编辑触发 update:modelValue → 父页 300ms 防抖 → noteStore.updateNote
   ├─ 输入 [[ → 补全源（wikilinkAutocomplete）
   ├─ 输入语义段落 → NoteLinker.suggestLinks → LinkHint
   └─ NoteDetailPage.loadBacklinks → Backlinks 面板
```

## 8. 相关测试

- `src/components/editor/MarkdownEditor.test.ts`
- `src/components/editor/wikilinkAutocomplete.test.ts`

---

> 上一模块 → [04 参考资料模块](./04-references-module.md)  
> 下一模块 → [06 知识图谱模块](./06-graph-module.md)
