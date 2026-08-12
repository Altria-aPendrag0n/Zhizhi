# 07 · Vault 模块

> 本模块覆盖：Vault（学习仓库）的打开/关闭/恢复、文件树、文件变更监听，以及向量索引构建编排。
> 相关代码：`study-thread/src/stores/vault.ts`、`study-thread/src/components/vault/`、`study-thread/src/utils/vault-fs.ts`。

---

## 1. 模块职责

- 管理当前 Vault 路径与文件树，负责 Vault 生命周期（打开/关闭/恢复上次）。
- 通过 `utils/vault-fs.ts` 封装 Tauri IPC，作为**前端唯一文件访问入口**（见 [13-rust-backend.md](./13-rust-backend.md)）。
- 编排向量索引构建：笔记全量索引（无缓存时）+ 参考资料增量同步（无论有无缓存）。
- 提供会话文件保存/删除到 Vault 的能力。

## 2. `utils/vault-fs.ts` — IPC 封装

| 函数 | Tauri 命令 | 说明 |
|------|-----------|------|
| `readFile(path)` | `read_file` | 读文本文件 |
| `writeFile(path, content)` | `write_file` | 写文本文件（自动建父目录） |
| `listDir(path)` | `list_dir` | 递归列举目录（Rust 端 ≤3 层） |
| `createDir(path)` | `create_dir` | 递归创建目录 |
| `fileExists(path)` | `file_exists` | 判断存在 |
| `deleteFile(path)` | `delete_file` | 删除文件或目录（目录递归删除） |
| `writeFileBytes(path, bytes)` | `write_file_bytes` | 写二进制（`Array.from(bytes)` 转换） |
| `readFileBytes(path)` | `read_file_bytes` | 读二进制 |
| `startWatching(path, cb)` | `start_watch` + `listen('file-changed')` | 启动 Rust notify 监听，事件回调 `{kind, paths}` |
| `stopWatching()` | `stop_watch` | 停止监听（模块级单例 `unlisten`） |

> 同一时间只有一个监听实例：`startWatching` 会先 `stopWatching()`。

## 3. `stores/vault.ts` — Vault Store

### 3.1 状态

| 状态 | 说明 |
|------|------|
| `vaultPath: string \| null` | 当前 Vault 根路径 |
| `fileTree: DirEntry[]` | 递归文件树 |
| `isOpen` / `isIndexing` / `indexProgress` | 打开状态 / 索引中 / 进度(0-1) |

### 3.2 动作

| 动作 | 说明 |
|------|------|
| `openVault(path)` | **先校验路径有效性**（`listDir` 探测：不存在/非目录/不可读时抛错，不改变状态）→ 设置路径 + `localStorage(study-thread-last-vault)` → `startWatching` → `listDir` 构建文件树 → 后台 `initIndex()` |
| `closeVault()` | 清空状态 + 移除 localStorage + `stopWatching` |
| `restoreLastVault()` | 读取 `study-thread-last-vault` 恢复；路径失效（目录被删除/移动/重命名）时抛错 → 清除过期记录并返回 `false`，界面回到"未打开 Vault"空态 |
| `refreshFileTree()` | 重新 `listDir` |
| `saveCurrentSession(session, isBranch, noteRefs)` | 委托 `saveSessionToVault` 写入 `sessions/*.md` 并刷新文件树 |
| `deleteSession(sessionId, isBranch)` | 定位会话文件，存在则删除并刷新文件树 |
| `initIndex()` | 见下 |

> **幽灵 Vault 防护（P6 修复）**：`openVault` 曾不校验路径有效性，路径失效时静默"打开成功"，
> 导致主界面统计、笔记、复习等文件读取全部失败显示为空，而侧边栏会话等本地缓存仍显示，
> 造成"资料库有内容但统计为 0"的假象。现打开/恢复前先 `listDir` 探测目录，失败即抛错；
> 调用方（`VaultSettings` 显示错误文案、`restoreLastVault` 清除过期记录）均已捕获。

### 3.3 `initIndex()` — 索引构建编排

```ts
if (!vaultPath) return
if (!embeddingEngine.isReady()) return        // 引擎未就绪跳过，App 就绪后重触发
const indexer = getNoteIndexer()

if (indexer.loadFromStorage()) { /* 有缓存：直接使用 */ }
else {
  // 首次构建：全量索引 notes/ 目录 .md 文件
  await indexer.buildIndex(noteMetas, readFile, onProgress)
}
await syncReferencesIndex(indexer)            // 参考资料：无缓存与否都增量同步
```

关键点：
- **引擎就绪守卫**：`App.vue` 在 `engine.initialize()` 完成后会再次调用 `initIndex()`。
- 笔记索引仅在**无 localStorage 缓存**时全量构建；参考资料**每次都增量同步**（因为上传/编辑可能发生在缓存建立之后）。
- `syncReferencesIndex` 只处理 `*.json` 元数据，跳过 `updated <= indexedAt` 的未变更条目；md 类型全文嵌入，其余类型仅嵌入元数据（标题/描述/标签）。

### 3.4 会话保存/删除

- `saveCurrentSession` → `utils/session-serializer.saveSessionToVault`（[11 模块]）。
- `deleteSession` → `getSessionFilePath` + `fileExists` + `deleteFile`。

## 4. 组件层（`src/components/vault/`）

### 4.1 `FileTree.vue` / `FileTreeNode.vue` — 文件树

- `FileTree`：容器，props `tree: DirEntry[] | null`；emits `select(path)`；空树提示。
- `FileTreeNode`：递归节点；目录可展开/折叠（Folder/FolderOpen 图标）；文件点击 emit `select`；depth 缩进线。

> 注：V1 中文件树组件已实现，但主界面暂未挂载（资料库页以笔记/参考资料列表为主）。

### 4.2 `VaultSettings.vue` — Vault 管理设置块

- 位于设置页；无 props/emits。
- 功能：打开 / 新建 / 切换 / 关闭 Vault；最近打开列表（`settingsStore.recentVaults`，最多 5 条）。
- 路径选择统一走 **tauri-plugin-dialog** 的系统资源管理器：`open({ directory: true })`（`@tauri-apps/plugin-dialog`），取消选择（返回 `null`）时静默返回，不执行任何操作；`multiple: false` 单选目录。
- **打开/切换 Vault**：资源管理器选目录 → `vaultStore.openVault(path)`。
- **新建 Vault**：先资源管理器选父目录，再用 `prompt()` 输入名称，`joinPath` 拼接后创建 `notes/sessions/attachments/.study-thread` 四个子目录，再打开。
- `joinPath` 按平台分隔符拼接；`toErrorMessage` 统一错误文案。
- 打开成功后 `settingsStore.addRecentVault(path)`。
- 配套：Rust 端 `lib.rs` 注册 `tauri-plugin-dialog`，`capabilities/default.json` 授权 `dialog:default`（见 [13-rust-backend.md](./13-rust-backend.md)）。

## 5. 协作链路

```
VaultSettings 打开路径
  → vaultStore.openVault
     ├─ startWatching → Rust notify 监听 → file-changed 事件回调（预留自动刷新）
     ├─ listDir → fileTree
     └─ initIndex → embedding 全量/增量索引
App.vue 挂载
  → restoreLastVault + engine.initialize().then(initIndex)
```

## 6. 相关测试

- `src/stores/vault.test.ts`
- `src-tauri/src/commands/vault.rs` 内置 Rust 单元测试（对应 IPC 命令）
- `src/utils/` 下序列化工具的测试（间接覆盖 vault 数据写入格式）

---

> 上一模块 → [06 知识图谱模块](./06-graph-module.md)  
> 下一模块 → [08 LLM API 适配层](./08-llm-api-layer.md)
