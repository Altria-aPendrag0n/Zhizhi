# 知枝 (Study Thread) — Code Wiki

> 本 Wiki 面向开发者，从**代码实现**角度描述"知枝"（Study Thread）桌面应用。  
> 与产品设计文档（`docs/DEVELOPMENT.md`）互补：设计文档讲"要做什么"，本文档讲"代码是怎么写的"。

- **技术栈**：Tauri v2（Rust 后端）+ Vue 3（Composition API + `<script setup>`）+ TypeScript + Vite + Pinia + Vue Router + Tailwind CSS + CodeMirror 6 + D3.js
- **代码位置**：`study-thread/`（前端 `src/`，Rust 后端 `src-tauri/`）
- **当前版本**：0.1.0（产品名"知枝"，`com.study-thread.app`）

---

## 目录

1. [项目概览](#1-项目概览)
2. [仓库结构](#2-仓库结构)
3. [整体架构](#3-整体架构)
4. [模块索引](#4-模块索引)
5. [模块依赖关系](#5-模块依赖关系)
6. [关键技术栈与外部依赖](#6-关键技术栈与外部依赖)
7. [项目运行方式](#7-项目运行方式)
8. [核心数据流](#8-核心数据流)
9. [测试体系](#9-测试体系)

---

## 1. 项目概览

**知枝 (Study Thread)** 是一款 **AI 伴读桌面应用**：用户在"学习会话"中与 AI 对话，通过划线摘录把 AI 回答提炼为**原子笔记**，笔记之间用 `[[wikilink]]` 双向链接形成知识网络，并可从任意消息/笔记**分叉出深度追问分支**，最终把对话、笔记、分支树、学习者画像持久化到本地 **Obsidian 兼容的 Markdown Vault** 中。

核心代码组织为一个 Tauri 桌面应用（目录 `study-thread/`），分为：

- **前端**（Vue 3 SPA，`src/`）：界面、状态管理、LLM 协议适配、本地向量检索、Markdown 解析与编辑。
- **后端**（Rust，`src-tauri/`）：文件系统读写、目录递归列举、文件变更监听，通过 Tauri IPC 暴露给前端。

数据完全本地优先：笔记/会话是纯 Markdown 文件，向量索引缓存在 `localStorage`，模型文件内置离线。

---

## 2. 仓库结构

```
d:\work\Zhizhi\
├── docs\                        # 项目文档（本 Code Wiki 位于 docs/code-wiki/）
├── progress.json                # 开发进度追踪
└── study-thread\                # 应用主体
    ├── public\models\           # 内置离线资源：embedding 模型(ONNX) + ort wasm
    ├── src\                     # Vue 3 前端
    │   ├── api\                 # LLM 适配层：provider / 工具调用循环 / Skill 执行器
    │   │   ├── skills\          # extract-note / branch-followup / update-learner 执行器
    │   │   └── tools\           # 客户端工具（read_reference）注册与执行
    │   ├── components\          # UI 组件（chat / editor / notes / references / shell / vault / graph / common）
    │   ├── composables\         # useToast（全局通知）
    │   ├── embedding\           # 本地向量引擎：engine / indexer / linker
    │   ├── parser\              # frontmatter 与 wikilink 解析
    │   ├── router\              # Vue Router 配置
    │   ├── skills\              # SKILL.md 提示词模板与 loader
    │   ├── stores\              # Pinia：settings / vault / session / notes / references
    │   ├── styles\              # 全局样式与设计 token
    │   ├── types\               # 全局类型定义
    │   ├── utils\               # 序列化 / 树结构 / 文件访问 / 知识检索等工具
    │   └── views\               # 6 个路由页面
    └── src-tauri\               # Rust 后端
        ├── capabilities\        # Tauri 权限能力配置
        ├── icons\
        └── src\
            ├── commands\vault.rs# 文件系统 Tauri commands
            ├── lib.rs           # Builder 装配与命令注册
            └── main.rs
```

---

## 3. 整体架构

### 3.1 分层架构

```
┌──────────────────────────────────────────────────────────────────┐
│                      前端（Vue 3 + TypeScript）                    │
│                                                                  │
│  ┌───────────────────── views（6 个路由页面）─────────────────┐   │
│  │ MainChatPage / BranchChatPage / NotesPage / NoteDetailPage │   │
│  │ LearningHubPage / SettingsPage                              │   │
│  └──────────────┬────────────────────────────────────────────┘   │
│                 ▼                                                │
│  ┌───────────────────── components（按域组织）───────────────┐   │
│  │ shell（外壳/导航） chat（对话） editor（CodeMirror）          │   │
│  │ notes / references（知识库） vault（文件树） graph（D3）     │   │
│  └──────────────┬────────────────────────────────────────────┘   │
│                 ▼                                                │
│  ┌───────────────────── Pinia stores ───────────────────────┐   │
│  │ settings │ vault │ session │ notes │ references          │   │
│  └──────┬──────────────┬────────────────────────────────────┘   │
│         │              │                                         │
│         ▼              ▼                                         │
│  ┌──────────────┐ ┌────────────────────────────────────────┐   │
│  │ 业务逻辑层    │ │ 能力层                                   │   │
│  │ skills/*     │ │ api/*（LLM Provider + chatWithTools）    │   │
│  │ embedding/*  │ │ embedding/*（向量索引与检索）              │   │
│  │ parser/*     │ │ utils/*（序列化、树、vault-fs）            │   │
│  └──────┬───────┘ └──────┬─────────────────────────────────┘   │
│         │                │                                       │
│         ▼                ▼                                       │
│  ┌───────────────── Tauri IPC（@tauri-apps/api invoke）──────┐   │
│  └──────────────────────────┬───────────────────────────────┘   │
├─────────────────────────────┼─────────────────────────────────────┤
│  Rust 后端（src-tauri）      ▼                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ commands/vault.rs：read_file / write_file / list_dir /    │  │
│  │ create_dir / file_exists / delete_file / read_file_bytes  │  │
│  │ write_file_bytes / start_watch / stop_watch（notify 监听） │  │
│  └──────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 关键分层说明

| 层 | 位置 | 职责 | 关键约定 |
|----|------|------|----------|
| 页面层 | `src/views/` | 路由级编排：组合组件、调用 store / api / utils | 页面级组件不定义 props/emits |
| 组件层 | `src/components/<域>/` | 按功能域拆分的 UI 组件 | 单向数据流 props/emits；跨层用 `inject/provide` |
| 状态层 | `src/stores/` | Pinia store，前端唯一数据源 | 持久化用 `localStorage`（键前缀 `study-thread-*`） |
| 能力层 | `src/api/`、`src/embedding/`、`src/parser/`、`src/utils/` | 与 UI 无关的纯逻辑：LLM 协议、向量检索、解析、文件访问 | `api/` 与 `embedding/` 不依赖 Vue |
| IPC | `src/utils/vault-fs.ts` | `@tauri-apps/api` `invoke` 封装 | 前端所有文件操作都必须经此模块 |
| 后端 | `src-tauri/src/` | 文件系统与监听 | 命令返回 `Result<T, String>` |

### 3.3 数据持久化约定

| 数据类型 | 存储位置 | 说明 |
|----------|----------|------|
| 原子笔记 | `<vault>/notes/*.md` | YAML frontmatter + Markdown 正文 |
| 学习会话 / 分支 | `<vault>/sessions/*.md`、`branch-*.md` | Markdown 对话记录 |
| 会话分支树 | `<vault>/.study-thread/session-tree.json` | 分支树结构 |
| 参考资料 | `<vault>/references/{id}/`（自包含文件夹：`{id}.json` + `{id}.{ext}` + `{id}.extracted.md`） | 元数据、原始文件与 pdf 提取产物同文件夹管理 |
| 向量索引缓存 | `localStorage`（`study-thread-note-index`） | 索引持久化，避免重复嵌入 |
| 应用设置 | `localStorage`（`study-thread-settings` 等） | API Key、模型、最近 vault |
| 学习者画像 | 计划存于 `<vault>/.study-thread/learner.md` | V1 中画像 diff 由 update-learner skill 生成 |

---

## 4. 模块索引

> 每个模块一份独立文档，点击链接进入。文档按"前端应用骨架 → 业务域 → 能力层 → 后端"顺序编号。

| # | 模块 | 文档 | 核心目录 / 文件 | 一句话职责 |
|---|------|------|----------------|-----------|
| 01 | 应用外壳与路由 | [01-application-shell.md](./01-application-shell.md) | `src/main.ts`、`src/App.vue`、`src/router/`、`src/components/shell/` | 应用入口、项目/会话导航、全局快捷键与布局骨架 |
| 02 | 学习对话模块 | [02-chat-module.md](./02-chat-module.md) | `src/components/chat/`、`src/views/MainChatPage.vue`、`src/views/BranchChatPage.vue` | 流式 AI 对话、划线摘录、分支追问与会话树展示 |
| 03 | 笔记模块 | [03-notes-module.md](./03-notes-module.md) | `src/components/notes/`、`src/views/NotesPage.vue`、`src/views/NoteDetailPage.vue` | 笔记列表/详情/编辑、摘录弹窗、加入笔记 |
| 04 | 参考资料模块 | [04-references-module.md](./04-references-module.md) | `src/components/references/`、`src/stores/references.ts` | 上传/管理 md/pdf/png 参考资料并同步向量索引 |
| 05 | Markdown 编辑器 | [05-editor-module.md](./05-editor-module.md) | `src/components/editor/` | CodeMirror 6 编辑器：实时预览、wikilink、链接建议、反链 |
| 06 | 知识图谱模块 | [06-graph-module.md](./06-graph-module.md) | `src/components/graph/LocalGraph.vue` | D3 力导向的笔记局部关系图 |
| 07 | Vault 模块 | [07-vault-module.md](./07-vault-module.md) | `src/stores/vault.ts`、`src/components/vault/`、`src/utils/vault-fs.ts` | Vault 打开/关闭、文件树、索引构建编排 |
| 08 | LLM API 适配层 | [08-llm-api-layer.md](./08-llm-api-layer.md) | `src/api/`（不含 `skills/`） | 双协议 Provider、流式解析、工具调用循环、read_reference 工具 |
| 09 | Skill 系统 | [09-skills-system.md](./09-skills-system.md) | `src/skills/`、`src/api/skills/` | SKILL.md 模板加载 + 四个 LLM 执行器 |
| 10 | Embedding 向量引擎 | [10-embedding-module.md](./10-embedding-module.md) | `src/embedding/`、`src/utils/knowledge-retrieval.ts` | 本地离线向量化、索引、相似检索、RAG 注入 |
| 11 | 解析器与序列化工具 | [11-parsers-serializers.md](./11-parsers-serializers.md) | `src/parser/`、`src/utils/`（序列化/树/日期等） | frontmatter/wikilink 解析、会话与笔记序列化、分支树 |
| 12 | Pinia 状态管理 | [12-stores.md](./12-stores.md) | `src/stores/` | 6 个 store（含复习队列）的状态、动作与持久化契约 |
| 13 | Rust 后端 | [13-rust-backend.md](./13-rust-backend.md) | `src-tauri/` | Tauri 装配、10 个文件系统命令、文件监听 |
| 14 | 间隔复习模块 | [14-review-module.md](./14-review-module.md) | `src/utils/review-scheduler.ts`、`src/stores/review.ts`、`src/components/review/` | SRS 间隔复习调度、`review-state.json` 队列、到期清单 UI |
| 15 | 复习出题形式模块 | [15-review-question-types.md](./15-review-question-types.md) | `src/review/question-registry.ts`、`src/utils/review-difficulty.ts`、`src/components/review/*`、`src/skills/review-{quiz,cluster,feedback,debate}/` | 六类题型模型与注册表、掌握度×复习曲线难度信号、按题型反馈与辩论多轮 |
| 16 | 主界面与学习统计模块 | [16-learning-stats-home.md](./16-learning-stats-home.md) | `src/utils/learning-stats.ts`、`src/components/stats/ContributionGraph.vue`、`src/views/HomePage.vue` | 知枝按钮直达 `/home` 数据总览、问答/复习/笔记按天聚合、GitHub 风格学习频率格子图 |
| 17 | 全局 AI 忙碌遮罩 | [17-busy-overlay.md](./17-busy-overlay.md) | `src/stores/busy.ts`、`src/components/common/AiBusyOverlay.vue` | 非流式 AI 等待期间的全屏遮罩与全局快捷键禁用，避免反复创建或提交 |
| 18 | 调试日志系统 | [18-debug-logging.md](./18-debug-logging.md) | `src/utils/logger.ts`、`src/views/SettingsPage.vue`（调试日志区块） | 统一运行时日志（console + localStorage 环形缓冲）与设置页查看/清空面板 |

---

## 5. 模块依赖关系

```
┌────────────────────────────────────────────────────────────┐
│                        views（页面层）                      │
│   MainChatPage ──┬─ BranchChatPage ── NoteDetailPage       │
│   NotesPage ── SettingsPage ── LearningHubPage             │
└───┬─────────┬─────────┬──────────┬────────────┬────────────┘
    │         │         │          │            │
    ▼         ▼         ▼          ▼            ▼
 components   │         │          │            │
 (chat/editor/notes/references/shell/vault/graph/common)
    │         │         │          │            │
    ▼         ▼         ▼          ▼            ▼
┌───────────────── Pinia stores ───────────────────────────┐
│ settings │ vault │ session │ notes │ references          │
└───┬──────────┬──────────┬──────────┬─────────────────────┘
    │          │          │          │
    ▼          ▼          ▼          ▼
┌────────────────────────────────────────────────────────────┐
│  业务能力层                                                    │
│  api/*  ──►  LLM Provider（anthropic / openai-compat）       │
│  api/chat-loop ──► api/tools（read_reference）                │
│  api/skills ──► src/skills（SKILL.md + loader）               │
│  embedding/* ──► 本地向量索引 + knowledge-retrieval           │
│  parser/* ──► utils/*（序列化、树、日期、local-storage）        │
└──────────────┬─────────────────────────────────────────────┘
               │
               ▼  Tauri IPC (invoke)
┌────────────────────────────────────────────────────────────┐
│  Rust 后端：commands/vault.rs（文件系统 + notify 监听）       │
└────────────────────────────────────────────────────────────┘
```

### 依赖要点

- **一切文件操作都经由 `utils/vault-fs.ts` → Rust 命令**：前端不直接使用 `fs` 或 fetch 文件系统。
- **LLM 调用统一走 `api/` 层**：`createProvider()` 根据设置工厂化创建 Provider；页面只面向 `LLMProvider.chat()` 或 `chatWithTools()` / `branchFollowupStream()`，不关心协议差异。
- **向量能力两处使用**：会话发送时 `knowledge-retrieval` 注入 RAG 上下文；编辑器中 `NoteLinker` 做语义链接建议。两者都依赖 `embedding/engine` + `embedding/indexer` 全局单例。
- **会话/笔记的数据一致性**：`stores/session.ts` 负责会话状态与分支树（`session-tree.json`）；`stores/notes.ts` 负责笔记文件读写与列表；二者通过 `session-linker.ts` 的 `NoteReference`（消息 ↔ 笔记）关联。
- **跨层通信**：App.vue 通过 `provide('updateThreadTitle')` / `provide('updateNoteBreadcrumbTitle')` 向下层注入回调；全局通知走 `composables/useToast.ts` 模块级单例。

---

## 6. 关键技术栈与外部依赖

### 6.1 运行时依赖（`package.json`）

| 依赖 | 用途 |
|------|------|
| `@anthropic-ai/sdk` | 已声明，但项目实际未使用（自有 fetch 实现适配器） |
| `@codemirror/*` | CodeMirror 6 编辑器（view/state/autocomplete/lang-markdown/language-data/commands/language） |
| `@lucide/vue` | 图标库 |
| `@tauri-apps/api` | Tauri IPC（invoke / event listen） |
| `@tauri-apps/plugin-opener` | 用系统默认程序打开文件（参考资料编辑弹窗、邮件反馈 mailto） |
| `@tauri-apps/plugin-dialog` | 原生文件对话框（导出调试日志保存路径） |
| `@tauri-apps/plugin-updater` | 自动更新：检查 / 下载安装新版本（配合 GitHub Releases latest.json） |
| `@tauri-apps/plugin-process` | 进程控制：更新安装完成后 relaunch 重启应用 |
| `@xenova/transformers` | 浏览器内 ONNX 推理，加载本地 embedding 模型 |
| `d3` | 局部关系图力导向布局 |
| `js-yaml` | frontmatter / SKILL.md 解析 |
| `marked` | 聊天消息 Markdown 渲染 |
| `pinia` / `vue` / `vue-router` | 状态管理与路由 |

### 6.2 Rust 后端依赖（`src-tauri/Cargo.toml`）

| 依赖 | 用途 |
|------|------|
| `tauri` v2 | 桌面壳与 IPC |
| `tauri-plugin-opener` | 打开外部文件 |
| `tauri-plugin-dialog` | 原生文件对话框 |
| `tauri-plugin-updater` | 自动更新（检查 GitHub Releases latest.json 清单并下载安装） |
| `tauri-plugin-process` | 进程插件（重启应用） |
| `serde` / `serde_json` | 命令序列化 |
| `notify` v6 | 文件变更监听（watch 目录，emit `file-changed` 事件） |

### 6.3 内置离线资源（`public/models/`）

- Embedding 模型：`Xenova/all-MiniLM-L6-v2`（量化 ONNX，384 维，模型 + tokenizer + vocab 全套）
- onnxruntime wasm：`ort/*.wasm`（4 个文件）
- 引擎强制 `allowRemoteModels = false`，模型与 wasm 全部本地加载，**完全离线可用**。

---

## 7. 项目运行方式

### 7.1 环境要求

| 软件 | 版本 |
|------|------|
| Node.js | 18.x / 20.x |
| Rust | 1.70+ |
| Windows 额外 | Visual Studio Build Tools（C++ 桌面开发）、WebView2（Win10 1809+ 自带） |

### 7.2 开发运行

```bash
cd study-thread
npm install
npm run tauri dev      # 启动 Vite(1420) + Tauri 桌面窗口，Rust 首编 3-5 分钟
```

仅调试前端 UI（无 Tauri 文件能力）：

```bash
npm run dev            # 浏览器访问 http://localhost:1420
```

### 7.3 常用脚本（`package.json`）

| 脚本 | 说明 |
|------|------|
| `npm run dev` | Vite 开发服务器（端口 1420） |
| `npm run build` | `vue-tsc --noEmit` 类型检查 + `vite build` |
| `npm run preview` | 预览生产构建 |
| `npm run test` | 运行全部单元测试（vitest run） |
| `npm run test:watch` | 监听模式测试 |
| `npm run fetch:models` | 下载内置 Embedding 模型与 ort wasm（构建前置，可加 `-- --mirror`） |
| `npm run check:models` | 校验模型资源完整性（`npm run build` 自动执行） |
| `npm run release:latest` | 生成自动更新清单 latest.json（发版用，见 RUN.md §4.4） |
| `npm run tauri` | Tauri CLI 透传（`tauri dev` / `tauri build` 等） |

### 7.4 生产打包

```bash
npm run tauri build    # vue-tsc + vite build + cargo build --release
```

产物：Windows 下 `src-tauri/target/release/bundle/msi|nsis`（安装包，产品名"知枝"，中文语言包）。打包前需同步三处版本号：`package.json`、`tauri.conf.json`、`Cargo.toml`。

### 7.5 首次使用流程

1. 打开应用（1440×900 窗口），首次启动展示欢迎引导（测试版声明 + 三步指引，可关闭或跳转设置）。
2. 进入设置页配置 Vault 路径与 LLM 服务商（Anthropic / OpenAI / DeepSeek / 通义千问 / 智谱 / Ollama / 自定义）。
3. 返回"学习会话"开始对话；第一次对话前 `embedding` 引擎会加载内置模型并构建笔记向量索引（非阻塞，失败不影响对话）。

---

## 8. 核心数据流

### 8.1 一次学习对话（RAG + 工具调用）

```
用户在 Composer 输入 → MainChatPage.handleSend
  1. 校验 API Key（未配置则跳转 /settings）
  2. retrieveKnowledgeContext(问题) → 从笔记/参考资料向量索引检索 Top-K → 拼入 system prompt
  3. chatWithTools({ provider, messages, tools: CLIENT_TOOLS, toolContext })
     ├─ provider.chat() 流式返回 text/thinking/tool_call/stop/error
     ├─ 若模型发起 tool_call（如 read_reference）→ executeClientTool 本地执行 → 结果作为 tool 消息回传 → 下一轮
     └─ 无工具调用 → 透传最终回答
  4. 流式渲染：thinking 折叠块 + StreamText / ChatMessage（marked 渲染）
  5. 会话持久化：saveSessionToVault → <vault>/sessions/<id>.md（仓库即真相，无 localStorage 缓存；侧边栏列表由 loadSessionsFromVault 扫描该目录重建）
```

### 8.2 划线摘录 → 原子笔记

```
用户在 AI 回答上划选文本 → ChatView 弹出 HighlightMenu
  → extractNote(highlightedText, context, provider[, userTitle])
      ├─ 加载 src/skills/extract-note/SKILL.md → buildPrompt 注入变量
      ├─ provider.chat() 生成 JSON {title, description, tags}
      └─ 组装 ExtractedNote（原文不加工，作为笔记正文）
  → noteStore.saveNote → <vault>/notes/<title>.md（serializeNote 写 frontmatter + 原文）
  → 记录 NoteReference{path, title, messageIndex} → 写回会话文件（> 已生成笔记: [[...]]）
```

### 8.3 创建分支（深度追问）

```
用户在消息上选"创建分支" → sessionStore.createBranchInVault
  1. initSessionTree 读取 .study-thread/session-tree.json（无则建根节点）
  2. 校验深度 < MAX_BRANCH_DEPTH(3)
  3. 保存父会话文件（若不存在）→ 创建分支会话文件 sessions/branch-<id>.md
  4. addBranchToSessionTree + saveSessionTree
  5. 跳转 /chat/branch/:sessionId/:branchId
  分支对话：BranchChatPage 用 loadBranchContext(父文件, forkIndex) 提取分叉点前消息
  作为上下文，branchFollowupStream 生成更深入的追问回答
```

### 8.4 Vault 打开与索引

```
VaultSettings 打开路径 → vaultStore.openVault
  1. 写 localStorage(study-thread-last-vault) + startWatching（Rust notify 监听）
  2. listDir 递归(≤3层) 构建文件树
  3. initIndex：引擎就绪后，无缓存则全量构建笔记索引；
     参考资料无论有无缓存都增量同步（md 全文 / 其余仅元数据）
App 挂载时自动 restoreLastVault + embeddingEngine.initialize() + initIndex()
```

---

## 9. 测试体系

- **框架**：Vitest（`vite.config.ts` 配置 `happy-dom` 环境，include `src/**/*.{test,spec}.{ts,js}`）
- **覆盖范围**（每个业务模块旁均有 `*.test.ts` 伴生文件）：
  - 解析器：`frontmatter`、`wikilink`、`markdown-headings`
  - 序列化：`session-serializer`、`note-serializer`、`reference-serializer`、`session-tree`
  - 业务逻辑：`knowledge-retrieval`、`branch-context`、`note-insert`、`date`、`session-linker`
  - LLM 层：`anthropic`、`openai-compat`、`provider-factory`、`chat-loop`
  - Store：`notes`、`references`、`session`、`settings`、`vault`
  - 组件：`ChatMessage`、`ThinkingBlock`、`MarkdownEditor`、`AddToNoteDialog`、`NoteCard`、`NoteDetail`、`NoteList`、`ReferenceCard`、`ReferenceEditDialog`、`ThreadList`、`MainChatPage`、`NotesPage`、`App`
  - API：`branch-followup`、`read-reference`、`anthropic` 等
  - 嵌入：`engine`、`model-assets`（内置模型资源完整性校验）
- **Rust 侧**：`commands/vault.rs` 内置约 20 个 `#[cfg(test)]` 单元测试（读写/目录/字节/监听相关）。

运行：`npm run test`（前端） / `cargo test`（Rust，在 `src-tauri/` 下）。

---

> **维护说明**：本 Wiki 随代码演进更新。新增/重构模块时，请同步更新 `README.md` 的模块索引表与对应模块文档。
