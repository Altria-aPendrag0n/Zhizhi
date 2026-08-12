# 11 · 解析器与序列化工具

> 本模块覆盖：Markdown 解析（frontmatter / wikilink / 标题）、会话与笔记/参考资料序列化、分支树结构、分支上下文加载、日期与 localStorage 工具。
> 相关代码：`study-thread/src/parser/`、`study-thread/src/utils/`。

---

## 1. 模块职责

- 提供前端全部"文本 ↔ 结构化数据"的转换能力，是数据落盘（vault Markdown 文件）与读取的格式约定中心。
- 被 stores、views、api、embedding 各层广泛引用。

## 2. 解析器（`src/parser/`）

### 2.1 `frontmatter.ts`

```ts
parseFrontmatter(content): { meta: Record<string, unknown>; body: string }
```

- 正则 `^---\s*\n([\s\S]*?)\n---\s*\n` 提取 frontmatter；无则返回 `{meta:{}, body:content}`。
- **使用 `yaml.CORE_SCHEMA`**：日期字符串（如 `2024-01-01`）保持为字符串，避免被默认 schema 解析成 Date 产生时区偏移。
- `normalizeYamlValue`：Date → ISO 字符串（纯日期输出 `YYYY-MM-DD`）；数组/对象递归归一。
- **宽松容错 `parseFrontmatterLenient`**：YAML 解析失败时触发。旧版本 `serializeNote` 曾把多行划线文本（表格）裸写入 `highlight` 字段，换行未转义导致整个 frontmatter 解析失败（tags 等字段一并丢失）。容错逻辑丢弃跨行未闭合的 highlight 值后重新解析，尽力恢复 title/tags/description 等关键字段；仍失败返回 `{}`。

### 2.2 `wikilink.ts`

```ts
interface WikiLink { raw: string; target: string; alias: string | null; start: number; end: number }
```

| 函数 | 说明 |
|------|------|
| `parseWikiLinks(text)` | 正则 `\[\[([^\]|#]+)(?:[|#]([^\]]+))?\]\]` 提取所有链接 |
| `resolveWikiLinkTarget(link, notes)` | 在笔记列表里匹配目标（路径候选归一化：去 `notes/` 前缀、去 `.md`、取文件名），失败回退按标题匹配 |
| `resolveWikiLink(link, vaultPath)` | 依次探测 `<vault>/notes/{target}.md`、`<vault>/notes/{target}`、`<vault>/{target}.md`、`<vault>/{target}` 是否存在 |
| `extractAllLinks(text)` | 去重提取所有 target |
| `renderWikiLink(wikiLink, resolved, path?)` | 生成 `<a class="wikilink wikilink--resolved/unresolved" ...>` HTML |

### 2.3 `markdown-headings.ts`（note-insert 用）

```ts
parseHeadings(markdown): MarkdownHeading[]
// MarkdownHeading = { level, text, line, end }
```

- 跳过围栏代码块（``` 与 ~~~）内的 `#` 行；`end` = 下一个同级/更高级标题的前一行。

## 3. 会话序列化（`utils/session-serializer.ts`）

| 函数 | 说明 |
|------|------|
| `generateSessionTitle(messages)` | 首条用户消息前 30 字（去换行）+ `...` |
| `sanitizeFileName(name)` | 移除 `\ / : * ? " < > \|`，空值回退 `untitled` |
| `serializeSession(session, noteRefs)` | 生成 Markdown：frontmatter（session_id/title/created/tags/parent_session/fork_point）+ 消息（`## 用户|知枝|系统 · 时间`）+ AI 思考区块（`<!-- thinking -->`，assistant 消息正文前）+ 笔记引用行（`> 已生成笔记: [[path|title]]`） |
| `serializeThinkingBlock(text)` | 序列化 AI 思考过程为 `<!-- thinking -->` 包裹的区块文本；内容中的 `-->` 转义为 `--&gt;` 避免提前闭合标记 |
| `getSessionFilePath(vaultPath, sessionId, isBranch)` | `sessions/{id}.md` 或 `sessions/branch-{id}.md` |
| `saveSessionToVault(vaultPath, session, isBranch, noteRefs)` | 建目录 + 写文件，返回文件路径 |
| `parseSessionMeta(content, filePath)` | 轻量解析 frontmatter（id/title/created），侧边栏会话列表用；缺失时按文件名兜底 |
| `parseSessionMessages(body)` | 解析正文消息（保留 `## 角色 · 时间戳` 的消息级时间戳与 `message.thinking`；跳过 `<!-- fork-context -->`、`<!-- thinking -->` 区块与 `> 已生成笔记/分支` 引用标记行） |
| `parseSessionFile(content, filePath?)` | 完整会话解析（frontmatter + 消息），读取侧唯一入口；复习会话建议走 `review-session.loadReviewSession`（含出题结果规范化） |

## 4. 分支树（`utils/session-tree.ts`）

存储于 `<vault>/.study-thread/session-tree.json`，描述会话与分支的树形结构（Obsidian 兼容 vault 内）。

```ts
interface SessionTreeNode {
  id: string
  type: 'message' | 'branch'
  title: string
  file: string          // 关联 Markdown 文件路径
  created: string
  fork_from: string | null
  children: SessionTreeNode[]
}
```

| 函数 | 说明 |
|------|------|
| `createRootNode(id, title, file)` / `createBranchNode(id, title, file, forkFrom)` | 工厂函数 |
| `addBranchToTree(tree, parentId, branch)` | **不可变更新**：沿路径递归复制，向父节点追加子节点 |
| `findNode(tree, id)` / `getNodePath(tree, id)` | 查找节点 / 到根路径 |
| `getNodeDepth(tree, id)` | 深度（根=0）；不存在返回 0 |
| `collectSubtreeIds(tree, id)` | 节点自身 + 全部后代 id（级联删除用） |
| `removeNodeFromTree(tree, id)` | 不可变移除子树；移除根时返回 null |
| `serializeTree` / `deserializeTree` | JSON 序列化 / 反序列化（含结构校验） |
| `countNodes` / `getLeafNodes` | 统计 |

## 5. 分支上下文（`utils/branch-context.ts`）

| 函数 | 说明 |
|------|------|
| `loadBranchContext(parentSessionFile, forkMessageIndex)` | 读父会话文件 → `parseFrontmatter` 取正文 → `parseMessages(body, forkIndex)` |
| `parseMessages(body, upToIndex)` | 按 `## 用户/知枝/系统` 消息头切分，收集到 `upToIndex` 为止的历史消息；跳过正文内 `<!-- thinking -->` 思考区块（含结束标记行） |
| `THINKING_START / THINKING_END` | 思考区块常量：`<!-- thinking -->` / `<!-- /thinking -->` |

## 6. 参考资料序列化（`utils/reference-serializer.ts`）

已随 [04-参考资料模块](./04-references-module.md) 详述，此处列其函数清单：
`generateReferenceId` / `getReferencesDir` / `getReferenceMetaPath` / `getReferenceFilePath` / `detectReferenceType` / `sanitizeFileName` / `serializeReferenceMeta` / `parseReferenceMeta`（fileType 非法抛错）。

## 7. 其他工具

| 文件 | 导出 | 说明 |
|------|------|------|
| `utils/local-storage.ts` | `loadStoredValue<T>(key)` / `saveStoredValue<T>(key, value)` | JSON 安全读写（异常返回 null） |
| `utils/date.ts` | `parseNoteDate(value): Date \| null` | 空值/非法一律 null，杜绝 Invalid Date 泄漏 |
| | `formatNoteShortDate(value)` | `6月15日`；无效返回 `''` |
| | `formatNoteFullDate(value)` | `2026年6月15日`；无效回退原字符串 |
| `utils/session-linker.ts` | `getNoteSourceSession` / `extractNoteRefsFromSession` / `findNotesBySession` | 会话 ↔ 笔记关联（见 [03-notes-module.md](./03-notes-module.md)） |
| `utils/note-serializer.ts` | `serializeNote` / `generateNoteFileName` | 笔记落盘格式（见 [03]） |
| `utils/note-insert.ts` | `insertHighlightAt` / `insertHighlightAtEnd` | 划线插入（见 [03]） |
| `utils/knowledge-retrieval.ts` | RAG 检索（见 [10-embedding-module.md](./10-embedding-module.md)） | — |
| `utils/learner-profile.ts` | `loadLearnerProfile` / `saveLearnerProfile` / `serializeLearnerProfile` / `applyProfileDiff` | 学习者画像读写与 diff 应用（见 [14-review-module.md](./14-review-module.md)） |
| `utils/learner-note-link.ts` | `linkConceptsToNotes` / `matchConceptExact` / `matchConceptSemantic` / 缓存失效 | 画像概念 → 笔记映射（精确 + 语义，见 [14-review-module.md](./14-review-module.md)） |

## 8. 文件格式约定（供参考）

### 8.1 会话文件（`sessions/<id>.md`）

```markdown
---
session_id: sess_...
title: ...
created: 2026-07-30T12:00:00.000Z
tags: [认知科学]
parent_session: null        # 分支才有值
fork_point: null            # 分叉点消息索引（字符串）
---

## 用户 · 12:00
...

## 知枝 · 12:01
<!-- thinking -->
（AI 思考过程，HTML 注释包裹，不参与 markdown 渲染；`-->` 转义为 `--&gt;`）
<!-- /thinking -->
正式回答内容...

> 已生成笔记: [[notes/xxx.md|标题]]    # noteRefs 注入行
```

### 8.2 笔记文件（`notes/<title>.md`）

```markdown
---
title: ...
description: "..."
type: concept
tags:
  - ...
created: ...
updated: ...
source:
  session: sessions/xxx.md
  highlight: "划线原文"
confidence: 0.5
---

# 标题
划线原文（原样保存）
```

### 8.3 分支树（`.study-thread/session-tree.json`）

`SessionTreeNode` 的 JSON 序列化（见第 4 节）。

## 9. 相关测试

- `src/parser/frontmatter.test.ts`、`src/parser/wikilink.test.ts`
- `src/utils/session-serializer.test.ts`、`session-tree.test.ts`、`reference-serializer.test.ts`、`branch-context.test.ts`、`date.test.ts`、`markdown-headings.test.ts`

---

> 上一模块 → [10 Embedding 向量引擎](./10-embedding-module.md)  
> 下一模块 → [12 Pinia 状态管理](./12-stores.md)
