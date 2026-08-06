# 12 · Pinia 状态管理

> 本模块覆盖：前端全部 5 个 Pinia store 的状态、动作与持久化契约。
> 相关代码：`study-thread/src/stores/`。

---

## 1. 总览

| Store | 职责 | 持久化（localStorage 键） |
|-------|------|--------------------------|
| `settings` | LLM 服务商配置 + 最近 Vault 列表 | `study-thread-settings`、`study-thread-recent-vaults` |
| `vault` | 当前 Vault 路径、文件树、索引构建编排 | `study-thread-last-vault` |
| `session` | 会话列表、当前会话消息、分支树 | `.study-thread/session-tree.json`（vault 内） |
| `notes` | 笔记列表/详情缓存、笔记读写 | `study-thread-extracted-notes`（本地元数据缓存） |
| `references` | 参考资料列表与增删改 | 无（数据全在 vault `references/` 目录） |

全部 store 使用 Composition 风格 `defineStore('name', () => {...})`。

---

## 2. `settings.ts`

| 状态 | 默认值 |
|------|--------|
| `activeProvider` | `'openai-compat'` |
| `apiKey` | `''` |
| `baseUrl` | `'https://api.openai.com'` |
| `model` | `'gpt-4o'` |
| `enableWebSearch` | `true` |
| `recentVaults: string[]` | `[]` |

| 动作 | 说明 |
|------|------|
| `saveSettings()` / `loadSettings()` | 读写 `study-thread-settings`（load 在 store 初始化时执行） |
| `addRecentVault(path)` | 去重置顶，最多保留 5 条 |
| `getProviderConfig(): ProviderConfig` | 组装 `{type, apiKey, baseUrl, model, enableWebSearch}` 供 `createProvider()` |

## 3. `vault.ts`

| 状态 | 说明 |
|------|------|
| `vaultPath: string \| null` | 当前 Vault 根目录 |
| `fileTree: DirEntry[]` | 递归文件树（≤3 层） |
| `isOpen` / `isIndexing` / `indexProgress` | 状态与进度 |

| 动作 | 说明 |
|------|------|
| `openVault(path)` | 持久化路径 + `startWatching` + 构建文件树 + `initIndex()` |
| `closeVault()` | 清空并停止监听 |
| `restoreLastVault()` | 启动时恢复上次 Vault |
| `refreshFileTree()` | 重建文件树 |
| `saveCurrentSession(session, isBranch, noteRefs)` | 写入 `sessions/*.md` |
| `deleteSession(sessionId, isBranch)` | 删除会话文件 |
| `initIndex()` | 笔记全量索引 + 参考资料增量同步（详见 [07-vault-module.md](./07-vault-module.md)） |

## 4. `session.ts`

| 状态 | 说明 |
|------|------|
| `sessions: Session[]` | 内存中的会话（含分支） |
| `currentSessionId` / `messages: Message[]` | 当前会话与消息 |
| `isStreaming` | 流式标记（UI 使用） |
| `sessionTree: SessionTreeNode \| null` | 分支树（来自 `.study-thread/session-tree.json`） |
| `MAX_BRANCH_DEPTH = 3` | 分支嵌套上限（主会话为 0 层） |

| 动作 | 说明 |
|------|------|
| `createSession(title?)` | 生成 `sess_<ts>_<n>` id 并置为当前 |
| `switchSession(id)` / `addMessage(msg)` | 切换/追加消息 |
| `createBranch(parentId, forkMessageId, title)` | 内存中创建 `branch_<ts>_<n>` 分支 |
| `loadBranchContext(sessionId)` | 读取分支已存消息（内存版） |
| `initSessionTree(vaultPath)` | 读取 session-tree.json |
| `addBranchToSessionTree` / `saveSessionTree` | 分支树维护与持久化 |
| `createBranchInVault(vaultPath, parentSession, forkMessageIndex, branchTitle, parentSessionFile?)` | 完整分支创建流程：深度校验 → 保存父会话文件 → 建根节点/分支 → 写树（详见 [02-chat-module.md](./02-chat-module.md)） |
| `getBranches(nodeId)` / `getNodeBranchDepth(nodeId)` | 查询分支与深度 |
| `deleteSessionNodeFromVault(vaultPath, nodeId)` | 级联删除节点及全部子分支的会话文件并更新树；无 vault 直接放行 |

## 5. `notes.ts`

| 状态 | 说明 |
|------|------|
| `localNotes: NoteMeta[]` | 本地持久化缓存（`study-thread-extracted-notes`） |
| `notes: NoteMeta[]` | 当前 vault 笔记列表（按 updated 降序） |
| `noteIndex: Map<path, Note>` | 详情缓存 |
| `isLoading` / `currentVaultPath` | 状态 |

| 动作 | 说明 |
|------|------|
| `loadAllNotes(vaultPath)` | 递归收集 `notes/**/*.md`，清理本地缓存中已不存在的条目 |
| `loadNote(path)` | 读文件组装 `Note`（缓存） |
| `updateNote(note)` | 保留原 frontmatter 更新 title/tags/updated 并写回 |
| `saveNote(vaultPath, extractedNote, sourceSession, highlight)` | 生成 `notes/<sanitized>.md` 写入并刷新列表 |
| `deleteNote(path)` | 路径安全校验（must be `<vault>/notes/*.md`）→ 删文件 + 缓存 + 向量索引 |

> 保存/更新/删除同步维护 `getNoteIndexer()`（[10-embedding-module.md](./10-embedding-module.md)）。

## 6. `references.ts`

| 状态 | 说明 |
|------|------|
| `references: ReferenceMeta[]` | 按 updated 降序 |
| `isLoading` / `currentVaultPath` | 状态 |

| 动作 | 说明 |
|------|------|
| `loadAllReferences(vaultPath)` | 读取 `references/*.json` |
| `uploadReference(vaultPath, file)` | 写文件 + 元数据 + 同步索引 |
| `updateReference(meta)` | 更新元数据 + 重算索引 |
| `deleteReference(metaPath)` | 删元数据 + 原文件 + 索引 |
| `loadReferencePreview(meta)` | md 正文 / png base64 / pdf `''` |

（细节见 [04-references-module.md](./04-references-module.md)）

## 7. 协作关系图

```
views / components
   │
   ├─ settings ──► createProvider()           [08]
   ├─ vault ──► vault-fs ──► Rust IPC          [07/13]
   ├─ session ──► session-serializer / session-tree / branch-context  [11]
   ├─ notes ──► note-serializer / note-insert / session-linker / indexer [03/10]
   └─ references ──► reference-serializer / indexer [04/10]
```

## 8. 相关测试

- `src/stores/settings.test.ts`、`vault.test.ts`、`session.test.ts`、`notes.test.ts`、`references.test.ts`

---

> 上一模块 → [11 解析器与序列化工具](./11-parsers-serializers.md)  
> 下一模块 → [13 Rust 后端](./13-rust-backend.md)
