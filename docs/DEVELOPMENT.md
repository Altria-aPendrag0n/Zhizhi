# 知枝 (Study Thread) — 开发文档

> **版本**: V1.0 | **更新日期**: 2026-07-30 | **状态**: 设计完成，开发待启动  
> 本文档是知枝学习工作台的完整开发规范，可供 AI 或开发者直接按文档实施。

---

## 目录

1. [项目概述](#1-项目概述)
2. [核心概念与数据模型](#2-核心概念与数据模型)
3. [功能架构](#3-功能架构)
4. [技术架构](#4-技术架构)
5. [Vault 格式规范](#5-vault-格式规范)
6. [Skill 系统设计](#6-skill-系统设计)
7. [AI 记忆系统](#7-ai-记忆系统)
8. [知识图谱设计](#8-知识图谱设计)
9. [分支会话模型](#9-分支会话模型)
10. [API 与模型适配层](#10-api-与模型适配层)
11. [设计系统](#11-设计系统)
12. [开发里程碑](#12-开发里程碑)
13. [文件结构](#13-文件结构)
14. [关键设计决策记录](#14-关键设计决策记录)
15. [参考资料](#15-参考资料)

---

## 1. 项目概述

### 1.1 产品定位

**知枝 (Study Thread)** 是一款 **AI 伴读桌面应用**。核心使用场景：

> 用户在学习一个主题时，AI 陪伴全程：对话解惑 → 划线摘录 → 自动提炼原子笔记 → 笔记之间建立知识关联 → 分支追问深挖 → 间隔复习。**一次学习会话，长出持久的知识结构。**

### 1.2 核心理念

| 原则 | 说明 |
|------|------|
| **本地优先** | 数据以纯 Markdown 文件存于用户本地，完全归用户所有 |
| **Obsidian 兼容** | Vault 格式与 Obsidian 完全互操作，用户可自由切换工具 |
| **AI 伴读** | AI 在教学对话中引导思考，从对话中半自动提炼知识卡片 |
| **认知地图** | 知识不是文件夹树，而是可导航、可诊断的关系网络 |

### 1.3 灵感来源与差异化

| 项目 | 借鉴了什么 | 我们做的不一样 |
|------|-----------|--------------|
| **DeepTutor** (HKUDS) | 三层记忆系统、Skill 编排、学习者画像 | 本地优先+桌面应用，非云端服务；树形分支对话 |
| **Obsidian** | Markdown vault、双向链接、Live Preview | 学习会话驱动的笔记生成，非纯写作工具；AI 半自动提炼 |
| **Heptabase/Scrintal** | 认知地图画布、卡片空间布局 | 诊断性认知地图（知识盲区热力图） |

---

## 2. 核心概念与数据模型

### 2.1 三个核心实体

```
学习会话 (Session)        — 含树形分支结构的 AI 对话
    │
    ├── 划线摘录 (Highlight) — 从 AI 回答中选中的原始文段
    │       │
    │       └── 原子笔记 (Note) — 从划线提炼的独立知识卡片
    │               │
    │               └── [[双向链接]] — 笔记之间的引用关系
    │
    └── 知识图谱 — 从笔记中自动检出的概念网络
```

### 2.2 原子笔记结构

每张原子笔记是一个 Markdown 文件，包含 YAML frontmatter：

```markdown
---
title: 理解是可检验的因果结构
type: concept           # concept | method | fact | question
tags: [费曼学习法, 元认知, 学习科学]
created: 2026-07-30T12:00:00+08:00
updated: 2026-07-30T14:30:00+08:00
source:
  session: sessions/费曼学习法/main.md
  highlight: "费曼学习法的核心不是把知识讲得简单..."
confidence: 0.9         # AI 生成时的置信度
review:
  next: null
  interval: 0
  mastery: 0.0
---

# 理解是可检验的因果结构

## 核心命题
熟悉术语并不等于理解；能说明因果机制与边界条件，才表示知识已被组织。

## 解释
当我们只能复述术语却说不清它为什么如此、在什么条件下可能失效时，我们拥有的往往是**识别**而非**理解**。真正的理解表现为：能够在不依赖术语掩护的情况下，向一个没有背景的人讲清楚"是什么导致了这个结果"以及"在什么情况下它会不一样"。

## 关联笔记
- [[用白话暴露知识缺口]]
- [[工作记忆的容量限制]]
```

### 2.3 学习会话结构

```
sessions/
└── 费曼学习法/
    ├── main.md              # 主对话（根节点）
    ├── branch-深层解释.md    # 一级分支
    ├── branch-边界条件.md    # 一级分支
    └── branch-深层解释-追问教学应用.md  # 二级分支（嵌套）
```

每个会话文件是完整的 Markdown 对话记录，`session-tree.json` 记录分支树结构。

### 2.4 会话 Markdown 格式

```markdown
---
session_id: sess_20260730_001
title: 用费曼法拆解一个概念
created: 2026-07-30T12:00:00+08:00
parent_session: null       # null = 根节点
fork_point: null           # 从哪条消息分叉
tags: [认知科学, 学习方法]
---

## 用户 · 12:00
请不要只给我步骤。费曼学习法究竟在训练什么？...

## 知枝 · 12:01
费曼学习法的核心不是"把知识讲得简单"...

> 划线: [[notes/理解是可检验的因果结构]]

## 用户 · 12:05
那怎么判断自己不是在假装讲懂？
...
```

### 2.5 学习者画像

`.study-thread/learner.md` — AI 在每次会话后建议更新，用户确认。

```markdown
---
known_concepts:
  - name: 费曼学习法
    confidence: high
    last_session: 2026-07-30
  - name: 工作记忆
    confidence: medium
    last_session: 2026-07-28
active_topics: [认知科学导论]
total_sessions: 7
total_notes: 12
preferred_depth: deep
preferred_style: socratic
---
```

---

## 3. 功能架构

### 3.1 V1 功能清单

| 模块 | 功能 | 优先级 |
|------|------|--------|
| **项目框架** | Tauri 桌面壳、Vault 打开/创建、基础导航 | P0 |
| **学习对话** | AI 流式对话、Anthropic+OpenAI 双协议、会话存档 | P0 |
| **划线摘录** | 选中文本 → 弹出菜单 → 生成原子笔记 | P0 |
| **原子笔记** | Markdown Live Preview 编辑、文件树浏览 | P0 |
| **双向链接** | `[[wikilink]]` 语法解析、自动反链面板 | P0 |
| **树形分支** | 从消息/笔记创建分支、上下文继承、分支树视图 | P1 |
| **链接建议** | 编辑笔记时本地 embedding 自动提示关联 | P1 |
| **学习总览** | 会话树、笔记统计、最近活动 | P1 |
| **学习者画像** | 会话后自动生成画像更新建议，用户确认 | P1 |
| **局部关系图** | 单笔记视角：展示 1-2 度邻居 | P1 |
| **设置** | API Key 配置、模型选择、Vault 路径 | P0 |

### 3.2 V2 功能（不在本次开发范围）

- 认知地图画布（自由拖拽卡片 + 手动连线）
- 诊断性认知地图（知识盲区热力图）
- 练习与错题
- 间隔复习（简化三档 + SM-2）
- 主题地图自动聚类
- 导入 Obsidian vault
- 移动端适配

---

## 4. 技术架构

### 4.1 整体架构

```
┌─────────────────────────────────────────┐
│                 前端 (Vue 3)              │
│  ┌──────────┐ ┌──────────┐ ┌─────────┐  │
│  │ 学习对话  │ │ 笔记编辑  │ │ 知识图谱 │  │
│  │  视图     │ │  CodeMirror│ │  D3/Canvas│  │
│  └────┬─────┘ └────┬─────┘ └────┬────┘  │
│       │            │            │        │
│  ┌────┴────────────┴────────────┴────┐  │
│  │         API 适配层                 │  │
│  │  AnthropicProvider | OpenAIProvider│  │
│  └────────────────┬──────────────────┘  │
│                   │                      │
│  ┌────────────────┴──────────────────┐  │
│  │      Tauri IPC (invoke)           │  │
│  └────────────────┬──────────────────┘  │
├───────────────────┼──────────────────────┤
│               Rust 后端                   │
│  ┌────────────────┴──────────────────┐  │
│  │  文件系统: 读写 .md / 监听变更     │  │
│  │  Embedding: ONNX 推理 (V2)        │  │
│  │  系统: 托盘 / 快捷键 / 窗口管理    │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

### 4.2 技术选型

| 层面 | 技术 | 理由 |
|------|------|------|
| 桌面框架 | **Tauri v2** | 包体积 ~5MB（vs Electron 150MB），系统 WebView，Rust 后端 |
| 前端框架 | **Vue 3** (Composition API) | 渐进式引入，中文社区活跃 |
| 状态管理 | **Pinia** | Vue 3 官方推荐 |
| 路由 | **Vue Router 4** | SPA 页面导航 |
| 构建工具 | **Vite** | Tauri 官方集成 |
| CSS | **Tailwind CSS** (打包) | 与设计 Token 一致，utility-first |
| 图标 | **Lucide** | 现有设计使用，开源轻量 |
| 编辑器 | **CodeMirror 6** | Obsidian 同款，Live Preview 成熟 |
| 本地嵌入 | **transformers.js** + `all-MiniLM-L6-v2` | 浏览器内推理，80MB 模型 |
| 后端 | **Rust** (Tauri 内置) | 文件系统读写、notify 监听 |
| LLM 协议 | **Anthropic Messages API + OpenAI Chat Completions API** | 双协议适配 |

### 4.3 Rust 后端职责

```rust
// src-tauri/src/commands/vault.rs

#[tauri::command]
fn open_vault(path: String) -> Result<VaultInfo, String> { /* 验证路径 */ }

#[tauri::command]
fn read_file(path: String) -> Result<String, String> { /* std::fs::read_to_string */ }

#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> { /* std::fs::write */ }

#[tauri::command]
fn list_dir(path: String) -> Result<Vec<DirEntry>, String> { /* std::fs::read_dir */ }

#[tauri::command]
fn watch_dir(path: String, window: Window) -> Result<(), String> { /* notify crate */ }
```

### 4.4 Vue 3 前端架构

- **Pinia Store**: `useVaultStore`（vault 路径和文件树）, `useSessionStore`（当前会话和分支）, `useNoteStore`（笔记列表和链接）, `useSettingsStore`（API Key、模型）
- **API 层**: `src/api/` 下独立模块，不依赖 Vue
- **组件**: 按功能拆分，非容器组件保持 pure

---

## 5. Vault 格式规范

### 5.1 目录结构

```
vault/
├── notes/                     # 原子笔记
│   ├── 理解是可检验的因果结构.md
│   └── 用白话暴露知识缺口.md
├── sessions/                  # 学习会话
│   └── 费曼学习法/
│       ├── main.md
│       ├── branch-深层解释.md
│       └── branch-边界条件.md
├── canvas/                    # 认知地图画布数据 (V2)
├── attachments/               # 图片和附件
└── .study-thread/             # 应用元数据（Obsidian 忽略此目录）
    ├── embeddings.db          # 向量索引（SQLite 或 JSON）
    ├── review-state.json      # 复习状态
    ├── session-tree.json      # 分支树结构
    └── learner.md             # 学习者画像
```

### 5.2 Obsidian 兼容性规则

1. **文件格式**: 标准 `.md` 文件，UTF-8 编码
2. **链接语法**: 使用 `[[wikilink]]` 和 `[[wikilink|显示文本]]`
3. **Frontmatter**: YAML 格式，`---` 分隔
4. **隐藏目录**: `.study-thread/` 被 Obsidian 默认忽略
5. **元数据字段**: 所有自定义 frontmatter 字段以你的命名空间前缀（或不影响 Obsidian 的标签/别名字段）
6. **互操作性**: 用户可随时用 Obsidian 打开、编辑、浏览 vault

### 5.3 与标准 Obsidian Vault 的区别

| 特性 | Obsidian 标准 | 知枝扩展 |
|------|-------------|---------|
| 笔记来源 | 手动创建 | 从学习会话半自动生成 |
| 源链接 | 无 | `source.session` + `source.highlight` |
| 复习元数据 | 社区插件实现 | 内置 `review` frontmatter |
| 会话记录 | 无 | `sessions/` 目录 |
| 学习者画像 | 无 | `.study-thread/learner.md` |

---

## 6. Skill 系统设计

### 6.1 Skill 格式

采用 DeepTutor 的 SKILL.md 格式：**YAML frontmatter + Markdown body**。

```markdown
---
name: 划线提炼笔记
description: 从划选中提炼结构化原子笔记
version: "1.0"
---

## 角色
你是一个学习笔记提炼助手。

## 输入
- highlighted_text: {highlighted_text}
- session_context: {session_context}

## 要求
1. 提炼一句核心命题（不超过 30 字，非复述原文措辞）
2. 用白话写一段解释（100-200 字）
3. 判断笔记类型: concept（概念卡）/ method（方法卡）/ fact（事实卡）/ question（问题卡）
4. 建议 2-4 个标签
5. 评估置信度 (0.0-1.0)

## 输出格式
{
  "title": "笔记标题",
  "proposition": "一句核心命题",
  "explanation": "白话解释",
  "type": "concept",
  "tags": ["标签1", "标签2"],
  "confidence": 0.9
}
```

### 6.2 Skill 加载与调用

```typescript
// src/skills/loader.ts
import yaml from 'js-yaml'

interface Skill {
  name: string
  description: string
  body: string
}

export function parseSkill(raw: string): Skill {
  const match = raw.match(/^---\s*\n(.*?)\n---\s*\n/s)
  const meta = match ? yaml.load(match[1]) as Record<string, string> : {}
  const body = match ? raw.slice(match[0].length).trim() : raw
  return {
    name: meta.name || '',
    description: meta.description || '',
    body
  }
}

export function buildPrompt(skill: Skill, vars: Record<string, string>): string {
  let body = skill.body
  for (const [key, value] of Object.entries(vars)) {
    body = body.replaceAll(`{${key}}`, value)
  }
  return body
}
```

### 6.3 V1 Skill 清单

| Skill | 触发方式 | 调用模型 | 说明 |
|-------|---------|---------|------|
| **extract-note** | 用户划线→点"生成笔记" | 云端 LLM | 固定流程，代码直接加载相应 SKILL.md |
| **branch-followup** | 用户进入分支会话 | 云端 LLM | 继承分叉点前上下文，更深入更聚焦 |
| **update-learner** | 会话结束后自动触发 | 云端 LLM | 生成画像 diff，用户确认后写入 |
| **note-link-suggest** | 编辑笔记时防抖 500ms 后 | 本地 embedding | 非 LLM，transformers.js 推理 |

### 6.4 为什么 V1 不做动态 Skill 选择

当前所有 Skill 触发点都是**固定的用户操作路径**：
- 点"生成笔记" → extract-note
- 进入分支 → branch-followup
- 会话结束 → update-learner
- 编辑笔记 → note-link-suggest

没有"用户自由说话，LLM 自行判断用哪个 skill"的场景。V2 若需多能力动态路由，再引入 DeepTutor 的 manifest 模式。

---

## 7. AI 记忆系统

### 7.1 三层记忆（简化版 DeepTutor）

```
L1: 学习会话存档          sessions/*.md        原始对话记录
        ↓ 提炼
L2: 原子笔记              notes/*.md           结构化知识卡片
        ↓ 聚合
L3: 学习者画像            .study-thread/       跨会话的知识状态
                          learner.md
```

### 7.2 L3 学习者画像的更新流程

1. **触发**: 会话结束后（用户发送最后一条消息或关闭会话标签）
2. **输入**: 完整会话内容 + 现有 `learner.md` + 本次生成的新笔记列表
3. **Skill**: 使用 `update-learner` skill 调用云端 LLM
4. **输出**: 画像变更 diff（新增概念、置信度变化、推荐主题）
5. **确认**: 以 diff 视图呈现给用户，用户确认/编辑后写入
6. **AI 使用**: 下次开启新会话时，将 `learner.md` 内容注入 system prompt 的前置上下文

### 7.3 画像更新的质量要求

- **只标注"用户能解释的"，不是"用户听过的"** — 在对话中出现不等于理解
- **置信度区分**: high（能独立解释）/ medium（能识别但不完整）/ low（刚接触）
- **未出现不等于不了解** — 用户可能已有背景知识但本次会话未涉及

---

## 8. 知识图谱设计

### 8.1 V1: 局部关系图

- **触发**: 打开笔记详情页面
- **展示**: 当前笔记的 1-2 度邻居（通过 `[[链接]]` 直接关联的笔记，以及它们的链接）
- **实现**: 读取当前笔记的 `links` frontmatter → 查询 vault 文件 → 渲染力导向图
- **技术**: D3.js force simulation 或 vis-network

### 8.2 V2: 认知地图画布

- 自由画布，用户拖拽卡片、手动连线
- AI 自动建议潜在关联
- 可按标签/文件夹分组过滤显示
- 数据存于 `canvas/*.canvas`（对齐 Obsidian Canvas JSON 格式）

### 8.3 V2: 诊断性认知地图

- 按主题聚合 → 计算掌握度指标（笔记数 × 追问深度 × 练习正确率）
- 热力图显示强项/盲区
- 本质是 metadata 聚合 + 可视化，不需要复杂的 NLP

---

## 9. 分支会话模型

### 9.1 分叉规则

| 维度 | 规则 |
|------|------|
| 分叉点 | 任意一条 AI 回答、任意原子笔记 |
| 上下文继承 | 分支继承分叉点**之前**的所有主对话历史，看不到分叉后的内容和其他分支 |
| 嵌套深度 | 最多 3 层（根 → 一级分支 → 二级分支 → 三级分支） |
| 分支间关系 | 平行独立，在"学习总览"页面以树形展示 |

### 9.2 分支树数据结构

```json
// .study-thread/session-tree.json
{
  "session_id": "sess_20260730_001",
  "title": "用费曼法拆解一个概念",
  "root": {
    "id": "msg_main_001",
    "type": "message",
    "children": [
      {
        "id": "branch_deep",
        "type": "branch",
        "title": "深层解释",
        "file": "branch-深层解释.md",
        "created": "2026-07-30T12:15:00+08:00",
        "fork_from": "msg_main_003",
        "children": [
          {
            "id": "branch_deep_2",
            "type": "branch",
            "title": "追问教学应用",
            "file": "branch-深层解释-追问教学应用.md",
            "fork_from": "branch_deep_msg_002",
            "children": []
          }
        ]
      },
      {
        "id": "branch_boundary",
        "type": "branch",
        "title": "边界条件",
        "file": "branch-边界条件.md",
        "fork_from": "msg_main_004",
        "children": []
      }
    ]
  }
}
```

### 9.3 学习总览视图

展示当前项目的完整会话树：根节点 → 一级分支展开 → 点击进入任意节点。每个节点显示：标题、创建时间、生成笔记数、消息数。

---

## 10. API 与模型适配层

### 10.1 适配器接口

```typescript
// src/api/llm-provider.ts
export interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface StreamChunk {
  type: 'text' | 'stop' | 'error'
  content: string
}

export interface LLMProvider {
  chat(messages: Message[], options?: ChatOptions): AsyncIterable<StreamChunk>
}

export interface ChatOptions {
  model?: string
  maxTokens?: number
  temperature?: number
  systemPrompt?: string
}
```

### 10.2 Anthropic 适配器

```typescript
// src/api/anthropic.ts
// POST https://api.anthropic.com/v1/messages
// Header: x-api-key, anthropic-version: 2023-06-01
// Body: { model, max_tokens, system, messages }
// Response: SSE stream → parse content_block_delta events
```

### 10.3 OpenAI-Compatible 适配器

```typescript
// src/api/openai-compat.ts
// POST {baseUrl}/v1/chat/completions
// Header: Authorization: Bearer {apiKey}
// Body: { model, messages, stream: true }
// Response: SSE stream → parse choices[0].delta.content
// 兼容: OpenAI, DeepSeek, 通义千问, 智谱, ollama 等
```

### 10.4 API Key 管理

- 存储: `localStorage`（桌面应用，安全性可接受）
- 配置: 用户在设置页面填入 API Key + Base URL + Model
- 多提供商: 支持同时配置多个，对话时可切换
- 不加密（V1），后续按需引入 Tauri secure store

### 10.5 流式响应处理

```typescript
// src/api/stream.ts
export async function* streamChat(
  provider: LLMProvider,
  messages: Message[],
  options?: ChatOptions
): AsyncIterable<StreamChunk> {
  for await (const chunk of provider.chat(messages, options)) {
    yield chunk
  }
}
```

前端使用时：
```typescript
for await (const chunk of streamChat(provider, messages)) {
  if (chunk.type === 'text') appendToMessage(chunk.content)
  else if (chunk.type === 'stop') finalizeMessage()
}
```

---

## 11. 设计系统

### 11.1 设计 Token

```css
:root {
  /* 颜色 */
  --ink: #19312b;           /* 主文字色 */
  --ink-2: #52635d;         /* 次级文字 */
  --ink-3: #87928d;         /* 辅助文字 */
  --bg: #f4f1ea;            /* 页面背景（暖纸色） */
  --surface: #fbfaf6;       /* 卡片/主区域背景 */
  --surface-2: #edf0e9;     /* 次级背景 */
  --line: #d8ded6;          /* 边框分割线 */
  --brand: #245c4d;         /* 品牌主色（深绿） */
  --brand-strong: #174438;  /* 品牌强色 */
  --brand-soft: #dce9e1;   /* 品牌弱色 */
  --brand-ink: #ffffff;     /* 品牌上的文字 */
  --state-success: #2f7d5d;
  --state-warning: #9a6d1e;
  --state-error: #ad4d45;
  --state-info: #3f6b72;

  /* 圆角 */
  --r-sm: 4px;
  --r-md: 8px;
  --r-lg: 16px;
  --r-pill: 9999px;

  /* 间距 */
  --s-1: 4px;  --s-2: 8px;  --s-3: 12px;  --s-4: 16px;
  --s-5: 24px; --s-6: 32px; --s-7: 48px;

  /* 阴影 */
  --shadow-1: 0 1px 2px rgba(20, 39, 33, .05);
}
```

### 11.2 Tailwind 映射

`@theme inline` 块将 CSS 变量映射为 Tailwind utility：
- `--color-primary` → `bg-primary`, `text-primary`, `border-primary` 等
- `--radius-md` → `rounded-md`
- 完整映射见 `colors_and_type.css`

### 11.3 字体

| 用途 | 字体栈 |
|------|--------|
| 正文 | `"HarmonyOS Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif` |
| 标题（Serif） | `Georgia, "Songti SC", serif` |
| 代码 | `"JetBrains Mono", "Fira Code", monospace` |

### 11.4 布局网格

桌面四列网格：
```
┌──────┬──────────┬───────────────┬──────────┐
│ 项目栏 │ 会话列表  │   主内容区      │ 笔记侧栏  │
│ 76px │  248px   │   minmax(1fr) │  310px   │
└──────┴──────────┴───────────────┴──────────┘
  顶部工具栏: 62px 高, 跨第 3-4 列
  底部输入框: 固定定位, 主内容区底部
```

### 11.5 现有设计资产

`pages/` 目录下 13 个 HTML 页面设计稿作为 UI 参考：

| 页面 | 文件 | 用途 |
|------|------|------|
| 主对话 | `main-chat.html` | 学习对话 + 划线 + 笔记侧栏 |
| 分支入口 | `branch-entry.html` | 从卡片或划线进入分支 |
| 划线菜单 | `highlight-menu.html` | 选中文本后的浮动菜单 |
| 摘录菜单 | `selection-menu.html` | 摘录操作菜单 |
| 分支对话 | `branch-chat.html` | 分支追问界面 |
| 学习总览 | `learning-hub.html` | 项目仪表盘 |
| 资料/笔记 | `knowledge-notes.html` | 笔记列表浏览 |
| 笔记详情 | `note-detail.html` | 单笔记 + 反链 + 关系 |
| 练习 | `practice.html` | 练习与错题 |
| 复习 | `review.html` | 复习与进度 |
| 局部图谱 | `local-graph.html` | 单笔记邻居图 |
| 主题地图 | `topic-map.html` | 主题聚类图 |
| 关系质量 | `relation-quality.html` | 关系检查 |

通用组件：`partials/project-shell.html`（App Shell 骨架）

---

## 12. 开发里程碑

### Phase 1: 项目骨架 (预估 2-3 周)

**目标**: 可运行的 Tauri 桌面壳，包含基础导航和 Vault 管理。

| # | 任务 |
|---|------|
| 1.1 | Tauri v2 + Vue 3 + Vite 项目初始化 |
| 1.2 | Rust 后端: 文件系统读写命令 |
| 1.3 | Rust 后端: 目录列表命令 |
| 1.4 | Rust 后端: 文件变更监听 (notify crate) |
| 1.5 | Vue 前端: 路由设置 (Vue Router) |
| 1.6 | Vue 前端: Pinia stores (vault, settings) |
| 1.7 | Vue 前端: App Shell 组件（从 project-shell.html 迁移） |
| 1.8 | Vault 管理: 打开/创建 vault, 文件树组件 |
| 1.9 | Tailwind CSS 集成与设计 Token 配置 |

### Phase 2: 核心闭环 (预估 3-4 周)

**目标**: AI 对话 → 划线 → 提炼笔记流程完整跑通。

| # | 任务 |
|---|------|
| 2.1 | API 适配层: LLMProvider 接口 + 流式响应工具 |
| 2.2 | Anthropic 适配器实现 |
| 2.3 | OpenAI-compatible 适配器实现 |
| 2.4 | 设置页面: API Key 配置 + 模型选择 |
| 2.5 | 学习对话视图（从 main-chat.html 迁移） |
| 2.6 | 流式对话组件 + 会话存档写入 |
| 2.7 | 划线交互: 选中文本 → 弹出浮动菜单 |
| 2.8 | Skill 系统: loader.ts（解析 + 变量替换） |
| 2.9 | Skill: extract-note（SKILL.md + 执行器） |
| 2.10 | 笔记写入 vault + 基础笔记列表 |

### Phase 3: 分支 + 链接 + 编辑器 (预估 3-4 周)

**目标**: 树形分支、Markdown 编辑、双向链接、本地嵌入建议。

| # | 任务 |
|---|------|
| 3.1 | CodeMirror 6 集成 (Live Preview Markdown) |
| 3.2 | 笔记编辑视图（从 knowledge-notes.html 迁移） |
| 3.3 | `[[wikilink]]` 语法解析器 |
| 3.4 | 反链面板: 自动显示引用当前笔记的其他笔记 |
| 3.5 | 树形分支: 分支创建 + session-tree.json 维护 |
| 3.6 | 分支对话视图（从 branch-chat.html 迁移） |
| 3.7 | Skill: branch-followup（SKILL.md + 执行器） |
| 3.8 | 分支上下文继承: 分叉点前消息注入 |
| 3.9 | 本地 embedding 引擎: transformers.js 初始化 |
| 3.10 | 笔记链接建议: 编辑时防抖 → embedding → Top-K 匹配 → UI 提示 |
| 3.11 | 笔记详情 + 来源会话反链 |

### Phase 4: V1 收尾 (预估 1-2 周)

**目标**: 学习总览、学习者画像、局部图谱、打包发布。

| # | 任务 |
|---|------|
| 4.1 | 学习总览页面: 会话树 + 统计 |
| 4.2 | Skill: update-learner（SKILL.md + 执行器） |
| 4.3 | 学习者画像更新 + 确认 UI |
| 4.4 | 局部关系图: D3.js 力导向图 |
| 4.5 | Tauri 打包配置 + 生成安装包 |
| 4.6 | 全局质量检查: 错误处理、空状态、加载态 |
| 4.7 | 最终测试 + 发布 |

---

## 13. 文件结构

```
study-thread/
├── src/                              # Vue 3 前端
│   ├── main.ts                       # 入口: createApp + router + pinia
│   ├── App.vue                       # 根组件
│   │
│   ├── components/
│   │   ├── shell/                    # App Shell
│   │   │   ├── ProjectRail.vue       # 左侧项目栏
│   │   │   ├── ThreadList.vue        # 会话列表
│   │   │   ├── TopBar.vue            # 顶部工具栏
│   │   │   └── AppShell.vue          # 壳布局容器
│   │   ├── chat/                     # 对话相关
│   │   │   ├── ChatView.vue          # 对话主视图
│   │   │   ├── ChatMessage.vue       # 单条消息
│   │   │   ├── StreamText.vue        # 流式文字渲染
│   │   │   ├── HighlightMenu.vue     # 划线浮动菜单
│   │   │   ├── Composer.vue          # 底部输入框
│   │   │   └── BranchTree.vue        # 分支树视图
│   │   ├── editor/                   # 编辑器
│   │   │   ├── MarkdownEditor.vue    # CodeMirror 6 封装
│   │   │   ├── LinkHint.vue          # 链接建议虚线提示
│   │   │   └── Backlinks.vue         # 反链面板
│   │   ├── notes/                    # 笔记
│   │   │   ├── NoteList.vue          # 笔记列表
│   │   │   ├── NoteCard.vue          # 笔记卡片
│   │   │   └── NoteDetail.vue        # 笔记详情
│   │   ├── graph/                    # 图谱 (V1: 局部图)
│   │   │   └── LocalGraph.vue        # 局部关系力导向图
│   │   ├── vault/                    # Vault 管理
│   │   │   ├── FileTree.vue          # 文件树
│   │   │   └── VaultSettings.vue     # Vault 设置
│   │   └── common/                   # 通用 UI
│   │       ├── IconButton.vue
│   │       ├── Modal.vue
│   │       ├── DiffView.vue          # diff 对比视图
│   │       └── EmptyState.vue
│   │
│   ├── views/                        # 页面级视图
│   │   ├── MainChatPage.vue          # /chat
│   │   ├── BranchChatPage.vue        # /chat/branch/:id
│   │   ├── NotesPage.vue             # /notes
│   │   ├── NoteDetailPage.vue        # /notes/:id
│   │   ├── LearningHubPage.vue       # /hub
│   │   └── SettingsPage.vue          # /settings
│   │
│   ├── stores/                       # Pinia 状态
│   │   ├── vault.ts                  # Vault 路径、文件树
│   │   ├── session.ts                # 当前会话、分支、消息
│   │   ├── notes.ts                  # 笔记列表、索引
│   │   └── settings.ts               # API Key、模型、偏好
│   │
│   ├── api/                          # API 与 LLM 适配
│   │   ├── llm-provider.ts           # LLMProvider 接口
│   │   ├── anthropic.ts              # Anthropic 适配器
│   │   ├── openai-compat.ts          # OpenAI 兼容适配器
│   │   ├── stream.ts                 # 流式响应工具
│   │   └── skills/                   # Skill 执行器
│   │       ├── extract-note.ts       # 划线 → 笔记
│   │       ├── branch-followup.ts    # 分支追问
│   │       └── update-learner.ts     # 画像更新
│   │
│   ├── skills/                       # Skill 模板 (.md 文件)
│   │   ├── extract-note/
│   │   │   └── SKILL.md
│   │   ├── branch-followup/
│   │   │   └── SKILL.md
│   │   └── update-learner/
│   │       └── SKILL.md
│   │
│   ├── embedding/                    # 本地嵌入引擎
│   │   ├── engine.ts                 # transformers.js 初始化
│   │   ├── indexer.ts               # vault 全量/增量索引
│   │   └── linker.ts                # 搜索 Top-K 相关笔记
│   │
│   ├── parser/                       # Markdown 解析
│   │   ├── wikilink.ts              # [[link]] 解析
│   │   ├── frontmatter.ts           # YAML frontmatter 解析
│   │   └── markdown.ts              # MD 工具函数
│   │
│   └── utils/                        # 工具函数
│       ├── path.ts                    # 路径处理
│       ├── debounce.ts               # 防抖
│       └── vault-fs.ts               # Tauri invoke 封装
│
├── src-tauri/                        # Tauri Rust 后端
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── build.rs
│   ├── icons/                        # 应用图标
│   └── src/
│       ├── main.rs                    # 入口: Tauri Builder
│       ├── lib.rs
│       └── commands/
│           ├── mod.rs
│           ├── vault.rs               # open/read/write/list/watch
│           └── app.rs                 # 应用级命令
│
├── pages/                            # 现有设计稿（参考用）
│   ├── main-chat.html
│   ├── branch-chat.html
│   ├── branch-entry.html
│   ├── highlight-menu.html
│   ├── selection-menu.html
│   ├── knowledge-notes.html
│   ├── note-detail.html
│   ├── learning-hub.html
│   ├── practice.html
│   ├── review.html
│   ├── local-graph.html
│   ├── topic-map.html
│   └── relation-quality.html
│
├── partials/                         # 现有设计组件（参考用）
│   └── project-shell.html
│
├── assets/                           # 静态资源
│   └── logo.svg
│
├── docs/
│   └── DEVELOPMENT.md                # 本文档
│
├── colors_and_type.css               # 设计 Token（参考）
├── progress.json                     # 开发任务追踪
├── package.json
├── vite.config.ts
├── tsconfig.json
└── tailwind.config.ts
```

---

## 14. 关键设计决策记录

| # | 问题 | 决策 | 理由 |
|---|------|------|------|
| 1 | 产品定位 | AI 伴读（非知识管理工具、非自适应 tutor） | 与现有设计稿一致，核心链路清晰 |
| 2 | 数据主权 | 本地优先，Markdown vault | 用户数据安全感，可移植性 |
| 3 | Vault 兼容 | 完全兼容 Obsidian | 零迁移成本，工具选择自由 |
| 4 | 数据格式 | YAML frontmatter + Markdown + [[wikilink]] | Obsidian 标准，生态兼容 |
| 5 | 分支模型 | 任意回答分叉，继承上下文，深度 ≤3 | 树形学习对话的核心差异化功能 |
| 6 | 笔记生成 | 半自动（AI 提炼 + 用户编辑）+ 半主动 AI 链接建议 | 减少手工制卡负担，同时保留用户控制 |
| 7 | 知识图谱 | V1 仅局部关系图，V2 认知地图画布 + 诊断热力图 | 先做有实际导航价值的，华而不实的功能后推 |
| 8 | 编辑器 | CodeMirror 6 Live Preview，独立视图 | Obsidian 验证的成熟方案 |
| 9 | 笔记视图 vs 对话视图 | 独立切换，非分屏 | 用户预想，学习 ≠ 写作 |
| 10 | AI 记忆 | 三层简化（会话 → 笔记 → 画像） | 借鉴 DeepTutor，去掉不适合 V1 的复杂性 |
| 11 | 学习者画像更新 | 自动生成 + 用户确认 | "真正理解"太微妙，AI 判断需要人的审阅 |
| 12 | Skill 架构 | 固定流程调用 + SKILL.md 格式 | V1 所有触发点固定，不需要动态路由 |
| 13 | Skill 格式 | DeepTutor SKILL.md（YAML + 变量替换） | 简单、开源、有成熟解析器 |
| 14 | 桌面方案 | Tauri v2 | 包体积小、开发友好、可直接复用前端代码 |
| 15 | 前端框架 | Vue 3 渐进引入 | 兼容现有 HTML，中文生态好 |
| 16 | LLM 协议 | Anthropic + OpenAI-compatible 双协议 | 覆盖海外和国产模型，用户自带 Key |
| 17 | 嵌入模型 | transformers.js + all-MiniLM-L6-v2 | 浏览器内推理，80MB，性能足够 |
| 18 | 间隔复习 | V2 再做 | 先验证学习闭环，复习是锦上添花 |
| 19 | API Key | 用户自带，存 localStorage，不加密 | V1 简化，Tauri 桌面环境安全性可接受 |

---

## 15. 参考资料

### 15.1 开源项目

| 项目 | 仓库 | 借鉴内容 |
|------|------|---------|
| DeepTutor | [HKUDS/DeepTutor](https://github.com/HKUDS/DeepTutor) | Skill 系统、三层记忆、学习者画像、Co-Writer |
| DeepTutor Skill | [ndpvt-web/deeptutor-claude-skill](https://github.com/ndpvt-web/deeptutor-claude-skill) | 轻量 Skill 适配、教学模式 |
| Obsidian API | [obsidianmd/obsidian-api](https://github.com/obsidianmd/obsidian-api) | 插件体系、[[wikilink]] 规范、Markdown 渲染 |
| Obsidian Sample Plugin | [obsidianmd/obsidian-sample-plugin](https://github.com/obsidianmd/obsidian-sample-plugin) | 插件开发参考 |

### 15.2 技术与文档

| 资源 | URL |
|------|-----|
| Tauri v2 文档 | https://v2.tauri.app |
| CodeMirror 6 | https://codemirror.net |
| transformers.js | https://huggingface.co/docs/transformers.js |
| all-MiniLM-L6-v2 | https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2 |
| text2vec-base-chinese | https://huggingface.co/shibing624/text2vec-base-chinese |
| Anthropic Messages API | https://docs.anthropic.com/en/api/messages |
| OpenAI Chat Completions API | https://platform.openai.com/docs/api-reference/chat |
| Obsidian 开发者文档 | https://docs.obsidian.md |
| Vue 3 文档 | https://cn.vuejs.org |
| Pinia 文档 | https://pinia.vuejs.org/zh |
| D3.js | https://d3js.org |
| Tailwind CSS | https://tailwindcss.com |

---

> **本文档随项目演进而更新。所有未明确标注 "V2" 的内容均属于 V1 开发范围。**
