# 25 · 学习计划模块（Plan Module）

> 学习计划 Agent：AI 对话式生成学习计划（目标 → 阶段 → 每日任务），在学习地图中追踪执行，
> 通过「开始学习」与会话/笔记/复习闭环联动。设计决策与任务来源见 `docs/todo/学习计划Agent开发方案.md`。

| 位置 | 文件 |
|------|------|
| 类型 | `src/types/index.ts`（`PlanDoc` / `PlanPhase` / `PlanTask` / `PlanStatus`，`Session.kind` 扩展 `'plan'`、`Session.plan_id`） |
| 解析器 | `src/utils/plan-parser.ts`（+ `plan-parser.test.ts`） |
| Store | `src/stores/plan.ts`（+ `plan.test.ts`） |
| Skill 执行器 | `src/api/skills/plan-architect.ts`、`src/skills/plan-architect/SKILL.md`（+ `plan-architect.test.ts`） |
| UI | `src/components/plans/PlanBoard.vue`、`src/components/plans/PlanPreview.vue`、`src/views/LearningHubPage.vue`（`plans` 视图）（+ 伴生测试） |
| 会话分组 | `src/components/shell/ThreadList.vue`（学习/计划两组独立折叠）、`src/views/HomePage.vue`（计划任务入口） |

---

## 1. 数据模型与存储（仓库即真相）

计划文件：`<vault>/plans/<plan-id>.md`，与 sessions/notes 同哲学——**frontmatter 为权威结构化数据，正文为 AI 生成的可读计划书（机器不解析）**。

```markdown
---
kind: plan               # 文件类型标识
plan: rust-30d           # 计划 id（= 文件名）
title: 30 天入门 Rust
goal: 能独立写出中小型 CLI 工具
status: active           # active | paused | archived
created: 2026-09-03
daily_minutes: 90        # 每日学习容量（分钟）
phases:                  # 阶段（中观导航）
  - id: p1
    title: 基础语法（第 1 周）
    objective: 掌握所有权与借用
tasks:                   # 任务队列（文件顺序 = 学习顺序）
  - id: t001
    phase: p1
    title: 安装工具链并跑通 Hello World
    detail: 安装 rustup，理解 cargo 基本命令   # 开始学习时注入会话的上下文
    estimate: 60         # 预估分钟数
    done: false
    done_at: null
    sessions: []         # 关联学习会话路径（「开始学习」后回填）
---

# 30 天入门 Rust
（可读正文）
```

约定：

- **排期语义（顺序推进 + 动态顺延）**：任务不绑定日期；今日任务 = active 计划的未完成任务按文件顺序从队首按 `estimate` 累积填充至 `daily_minutes`；队首任务无论多大都保留（避免容量永远空转）；勾选后释放容量、下次计算自动补位，无额外状态。
- **解析容错**（`plan-parser.ts`）：缺 frontmatter / YAML 非法抛错；字段缺失或类型不符按默认值补齐（`daily_minutes`→60、任务 `estimate`→30、id 兜底 `p{n}`/`t{n}`、status→active），用户手改文件不应导致崩溃。
- **未知字段保留**：解析时进入 `PlanDoc.extra`，序列化时原样写回，手改内容不丢失。
- 序列化（`serializePlanFile`）用 `yaml.dump({ lineWidth: -1 })` 避免长 detail 折行。

## 2. 今日任务计算与阶段预计完成日（纯函数）

```ts
computeTodayTasks(doc): PlanTask[]   // 容量填充 + 动态顺延，见上；paused/archived → []
estimatePhaseCompletion(doc, phaseId, now): Date | null
  // 阶段剩余任务总时长 ÷ daily_minutes，自 now 顺推（ceil）；无剩余任务 → null（已完成）
```

`PlanBoard` 的整体 ETA（`planEta`）同语义按全部剩余任务计算，展示 `预计 MM-DD 完成（约 N 天）`。

## 3. plan store（`stores/plan.ts`）

| 成员 | 职责 |
|------|------|
| `plans` / `currentVaultPath` | 内存计划列表（created 倒序）与当前 vault |
| `todayGroups` / `todayCount` | 活跃计划今日任务分组（互不感知、纯分组展示；无待办计划不出现在分组中） |
| `loadPlans(vaultPath)` | 扫描 `plans/*.md` 逐个解析；目录缺失置空，单文件损坏跳过 |
| `createPlan(vaultPath, doc)` | 向导确认后落盘 `plans/<plan-id>.md`（同名覆盖，支持整体重生成）并插入列表 |
| `completeTask(planId, taskId, done)` | 勾选/取消：变更后写盘，**写盘失败按序列化快照回滚内存**（`mutatePlan` 通用封装） |
| `associateSession(planId, taskId, sessionPath)` | 「开始学习」后回填任务 `sessions`（去重） |
| `setPlanStatus(planId, status)` | 暂停/归档/恢复；同状态视为成功不写盘 |

**刷新时机**：`App.vue` 的 `vaultPath` watch 与 `loadSessionsFromVault` 同步调用 `loadPlans`；vault 置空时清空 `plans`。

## 4. plan-architect skill 与计划草稿解析

### 4.1 SKILL.md（`src/skills/plan-architect/`）

多轮对话式规划师系统提示，变量注入 `{today}` / `{vault_overview}` / `{references}`（由 `buildPlanArchitectPrompt` 渲染；残留占位符开发环境抛错，与 loader 约定一致）。核心约束：

- 信息不足时**一轮集中追问**（目标/基础/每日时长/周期），交流轮次不输出 JSON；
- 信息足够时输出**唯一一个 json 代码块**（代码块外无其他内容）；
- 任务颗粒度 =「一次坐下能完成」的动作，estimate 15–120 分钟，总量 ≈ 每日分钟数 × 周期天数（±15%）；
- 只用 Vault 内上下文设计任务（`vault_overview` 注入笔记标签统计、`references` 注入资料名），**禁止外部链接**。

### 4.2 执行器（`api/skills/plan-architect.ts`）

```ts
buildPlanArchitectPrompt(context): string          // 模板渲染
extractPlanDraft(text): PlanDraftResult            // 三态：
  // { status: 'none' }                            普通对话轮次（无 JSON，非错误）
  // { status: 'invalid', error }                  有 JSON 但不合法（结构缺失/畸形），视图层提示重试
  // { status: 'ok', draft: PlanDoc }              归一化草稿（默认值补齐、plan id 合法化/标题兜底、
  //                                               created=now、done/done_at/sessions 初始值）
```

模型通道：复用 `settingsStore.getProviderConfig()`（官方 API 启用时优先，回退用户配置），无新增计费特判；非流式调用（带 `busyMessage` 忙碌遮罩）。

## 5. UI 编排

### 5.1 生成向导（PlanBoard `wizard` 模式，正式会话）

```
点击「制定新计划」→ mode=wizard
用户发送首条消息 → 创建会话 plan_{ts}（kind='plan'，标题取首条消息摘要）
  → 每轮对话后 persistWizardSession()（vaultStore.saveCurrentSession 落盘，仓库即真相）
  → 规划师回复 → extractPlanDraft：
      none      → 继续对话
      invalid   → 显示可读错误（draftError），输入框不锁定，用户可要求重试
      ok        → previewDraft 渲染 PlanPreview（阶段分组只读预览）
「就这样，生成计划」→ planStore.createPlan 落盘 → 会话回填 plan_id + 标题改为 `计划：<标题>`
  → 再次落盘 → 刷新侧边栏（sessionStore.loadSessionsFromVault）→ 回列表模式
「继续调整」→ 关闭预览，保留对话上下文继续发送（下一轮重新解析）
```

### 5.2 计划视图（PlanBoard `list` 模式）

- **今日任务**：`todayGroups` 按计划分组 → 任务行（标题/阶段/detail/estimate）+ checkbox（`completeTask`）+ 「开始学习」；
- **全部计划**：卡片（标题/状态徽章/goal/总进度条/整体 ETA），点击展开阶段进度（`phaseProgress`/`phaseEta`）与状态操作（暂停/恢复/归档）；
- **空/暂停/归档态**：无计划空态引导；paused 计划不出现在今日任务；archived 只读可恢复。

### 5.3 「开始学习」→ 学习闭环

```
任务卡「开始学习」
  1. 组装初始 prompt：学习计划「标题」（阶段：X）+ 今日任务 + detail + 伴读指令
  2. 落盘新学习会话 sess_{ts}_plan（vaultStore.saveCurrentSession）
  3. planStore.associateSession 回填任务 sessions（计划 → 学习会话链路）
  4. 刷新侧边栏 → router.push('/chat?thread=<id>')（MainChatPage 从 vault 加载续聊）
  5. 学习中划线摘录 → 原子笔记 → createReviewTask 自动入复习队列（现有机制，零改动）
```

### 5.4 会话分组（ThreadList）与首页入口

- `Session.kind`（`'review' | 'plan'`，缺省学习会话）贯穿序列化/解析（`session-serializer.ts` 的 `normalizeKind`，旧文件兼容）；`Session.plan_id` 持久化计划关联；
- `ThreadList.vue` 按 `kind` 分「学习会话 / 计划会话」两组，**独立折叠且状态持久化**（`localStorage: zhizhi.thread-list.group-collapsed`）；计划组仅存在时展示；
- `MainChatPage.saveCurrentSession` 重存会话时回写 `loadedSessionKind/loadedSessionPlanId`，避免续聊后分组漂移；
- `HomePage.vue` 今日进度区新增「计划任务」卡片（`planStore.todayCount`），点击跳 `/hub?view=plans`。

## 6. 关键不变量（改动前必读）

1. **frontmatter 是唯一权威**，正文仅供阅读；任何计划状态变更都必须走 store 的写盘路径（仓库即真相）。
2. **今日任务永远动态计算**，不落盘；勾选完成后容量补位由 `computeTodayTasks` 天然实现。
3. **写盘失败必须回滚内存**（`mutatePlan` 快照机制），保证 UI 与 vault 一致。
4. **多计划互不感知**（MVP 决策）：不做总量聚合、不做容量调度、不做自动重排。
5. 会话 `kind` 是分组与打开方式的依据；任何重建 Session 对象落盘的代码都必须回写 `kind`/`plan_id`。

## 7. 测试

| 文件 | 覆盖 |
|------|------|
| `plan-parser.test.ts` | 正常解析、缺字段容错、写回不丢字段（roundtrip）、容量填充与顺延、队首大任务保留、预计完成日推算 |
| `plan.test.ts`（store） | 目录扫描/排序/损坏跳过、todayGroups 聚合、勾选写回与失败回滚、关联去重、状态切换 |
| `plan-architect.test.ts` | 模板注入完整性、JSON 三态解析（none/invalid/ok）、字段归一化、plan id 兜底 |
| `PlanPreview.test.ts` / `PlanBoard.test.ts` | 预览渲染与阶段分组、空态、今日任务勾选、开始学习联动、向导发送/预览/确认/继续调整/错误态 |
| `session-serializer.test.ts` | `kind: plan` roundtrip、旧文件兼容、meta 提取、非法 kind |
| `ThreadList.test.ts` / `HomePage.test.ts` | 分组渲染、独立折叠与持久化、首页计划任务入口跳转 |
