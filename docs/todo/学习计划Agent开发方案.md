# 学习计划 Agent 开发方案

> 目标：新增「学习计划」能力——AI 对话式生成学习计划（目标 → 阶段 → 每日任务），在学习地图中追踪执行，并通过「开始学习」与会话/笔记/复习闭环联动。
> 本方案经逐分支确认（2026-09-03），所有设计决策已定稿，见「二、设计决策」。
> 客户端仓库：`D:\work\Zhizhi`（Tauri + Vue）；本功能纯客户端本地实现，不涉及服务端。

***

## 一、背景与定位

知枝现有闭环是「学（会话）→ 摘（划线笔记）→ 练（间隔复习）」，但**缺少"学什么"的顶层规划**：用户面对陌生领域不知道路径，每日打开应用不知道该学什么。学习计划 Agent 补上这一环：

- **制定**：对话式收集目标/基础/每日时长，AI 生成结构化计划；
- **执行**：学习地图中查看今日任务（按计划分组），一键「开始学习」进入会话；
- **沉淀**：学习中的摘录笔记经现有机制自动进入复习队列，形成完整闭环。

与复习系统关系：计划不改变复习调度，只负责"今天学什么"；复习仍由 FSRS/经典间隔队列独立驱动。

## 二、设计决策（已定稿）

| # | 决策点 | 结论 | 理由 |
|---|--------|------|------|
| 1 | 产品形态 | 学习地图新增「学习计划」视图 + 对话式生成 | 生成与展示分离，可追踪、可沉淀 |
| 2 | 数据载体 | `<Vault>/plans/<id>.md`，frontmatter 为权威结构，正文为 AI 生成的可读计划 | 单文件、用户可见可改、兼容 Markdown 工具，与 sessions 存储哲学一致 |
| 3 | 层级粒度 | 计划 → 阶段（有目标） → 每日任务（含预估分钟数） | 满足「今天学什么」直读，也有中观导航 |
| 4 | 排期模式 | **顺序推进 + 动态顺延**：任务按序排队，今日任务按每日容量从队首取；落后自动顺延，阶段显示动态预计完成日 | 永不"过期"、无红标挫败，无需重排算法 |
| 5 | 完成判定 | 手动勾选 + 会话联动：任务卡「开始学习」→ 新建**学习会话**（注入计划与任务上下文初始 prompt）；摘录笔记自动入复习队列（现有机制） | 简单可靠，不额外耗 token，闭环自然串联 |
| 6 | 生成流程 | 对话收集信息 → AI 输出结构化 JSON → 前端预览 → 确认/对话中调整后落盘；落盘后修改靠手改 MD | 出错可调，避免删文件重来 |
| 7 | 模型通道 | 跟随现有 provider-factory（官方优先，回退用户默认配置），无新增计费特判 | 开源用户与官方用户都可用 |
| 8 | 上下文策略 | 生成时只注入 Vault 内信息（笔记标签/主题、参考资料列表）；**不推荐外部链接** | 幻觉 URL 不可验证；Vault 上下文让计划衔接已有知识 |
| 9 | 多计划 | **完全并行、互不感知**，今日任务按计划分组纯展示，不算总时长、不提示冲突 | 首版最简；容量问题交由用户自行管理 |
| 10 | 生成会话 | **正式会话落盘**；session 增加 `kind` 字段（`learning` / `plan`），ThreadList 分「学习会话 / 计划会话」两组、独立折叠 | 用户明确要求；两组分离避免混染 |
| 11 | 首版增强 | 仅 HomePage 今日任务入口；**不做**：计划后续调整对话（重新生成覆盖）、顶部待办提示条、外部资源推荐、容量调度 | 控制 MVP 范围 |

## 三、数据模型

### 3.1 计划文件 `<Vault>/plans/<plan-id>.md`

```markdown
---
kind: plan
plan: rust-30d
title: 30 天入门 Rust
goal: 能独立写出中小型 CLI 工具
status: active            # active | paused | archived
created: 2026-09-03
daily_minutes: 90
phases:
  - id: p1
    title: 基础语法（第 1 周）
    objective: 掌握所有权、借用、结构体
tasks:
  - id: t001
    phase: p1
    title: 安装工具链与 Hello World
    detail: 安装 rustup，理解 cargo 基本命令，跑通第一个程序
    estimate: 60           # 预估分钟数
    done: false
    done_at: null
    sessions: []           # 关联学习会话路径
---

# 30 天入门 Rust

（AI 生成的可读正文：路径说明、阶段目标、学习方法建议。人类可读，机器不解析。）
```

约定：

- frontmatter 是唯一权威；正文仅供阅读，修改计划直接改 frontmatter；
- 解析器容错：缺字段给默认值，未知字段保留（写回不丢失）；
- 旧版无 `kind` 字段的 sessions 文件视为 `learning`（向后兼容）。

### 3.2 今日任务计算（顺序推进 + 动态顺延）

- 对每个 `status: active` 计划：取 `done: false` 的任务按文件内顺序为队列，从队首按 `estimate` 累积填充至 `daily_minutes`，得到该计划今日任务；
- 勾选完成后释放容量，队列自动补位（下次计算天然生效，无需额外逻辑）；
- 阶段预计完成日 = 阶段剩余任务总时长 ÷ daily_minutes，自今日起顺推（仅展示参考）。

## 四、总体架构（增量部分）

```
视图层
  LearningHubPage ── 新增「学习计划」视图（计划列表 / 详情 / 今日任务分组 / 勾选 / 开始学习）
  HomePage ──────── 今日任务摘要入口（跳转计划视图）
  ThreadList ────── 按 kind 分「学习会话 / 计划会话」两组，独立折叠
状态/逻辑层（纯逻辑，可单测）
  stores/plan.ts（新增）      加载 plans/ 目录、今日任务计算、勾选写回、多计划聚合
  utils/plan-parser.ts（新增） frontmatter 解析 / 序列化 / 容错
  types/index.ts（扩展）       PlanDoc / PlanPhase / PlanTask；Session 加 kind
  stores/session.ts（扩展）    会话 kind 支持；计划会话关联 plan id
Skill 层
  skills/plan-architect/SKILL.md（新增）
    · 收集阶段：自由对话追问目标/基础/每日时长/周期；
    · 产出阶段：严格 JSON 输出契约（plan/phases/tasks），同 review-quiz 模式；
    · 注入变量：vault_overview（笔记标签与主题概况）、references（资料列表）、today
会话联动
  「开始学习」→ 新建 kind=learning 会话，初始 prompt 注入计划标题/阶段目标/任务 detail
    → 现有 chat-loop 与划线摘录 → 新笔记经 createReviewTask 自动入复习队列（零改动）
```

## 五、任务清单（按序执行，每项完成后测试 + 提交 git + 标记 progress）

### T1 数据模型与解析器

- **type**：开发
- **description**：`types` 新增 PlanDoc/PlanPhase/PlanTask 与 Session.kind；`utils/plan-parser.ts` 实现计划文件解析（含容错）、frontmatter 序列化写回、今日任务计算与阶段预计完成日纯函数。
- **steps**：
  1. types/index.ts 扩展类型定义；
  2. plan-parser.ts：parsePlanFile / serializePlanFile / computeTodayTasks / estimatePhaseCompletion；
  3. 单测：正常解析、缺字段容错、写回不丢字段、容量填充与顺延、预计完成日推算；
  4. 运行相关测试 + 提交。

### T2 plan store 与会话 kind

- **type**：开发
- **description**：`stores/plan.ts` 管理计划列表加载/监听、多计划今日任务聚合、勾选完成写回；`stores/session.ts` 与 session-serializer 支持 kind 字段（缺省 learning 兼容旧文件）。
- **steps**：
  1. stores/plan.ts：loadPlans / todayTasks / completeTask / 刷新时机（页面进入与勾选后）；
  2. session 链路加 kind：类型、序列化、恢复；
  3. 单测：store 行为 + 旧会话文件兼容；
  4. 运行相关测试 + 提交。

### T3 plan-architect skill 与生成向导

- **type**：开发
- **description**：编写 `skills/plan-architect/SKILL.md`（信息收集策略 + JSON 输出契约 + Vault 上下文注入约定）；计划视图内嵌生成向导：正式会话（kind=plan，关联 plan id）、解析 AI 输出的计划 JSON、预览渲染、确认落盘 / 对话中调整后重新解析。
- **steps**：
  1. SKILL.md：角色、收集清单（目标/基础/每日时长/周期/偏好）、JSON 契约（plan title/goal/daily_minutes/phases/tasks，任务含 title/detail/estimate）、注入变量；
  2. 向导对话接线：provider-factory 取模型（官方优先回退用户配置）；
  3. JSON 解析与校验（缺字段/畸形输出给用户可读错误并允许重试）；
  4. 预览卡 + 「就这样，生成计划」落盘 + 「继续调整」回到对话；
  5. 测试：skill 渲染变量完整性、JSON 解析容错 + 提交。

### T4 计划视图 UI

- **type**：开发
- **description**：LearningHubPage 新增「学习计划」视图：无计划时引导进入生成向导；有计划时展示今日任务（按计划分组：任务标题/预估时长/勾选/「开始学习」）、阶段进度与动态预计完成日、计划状态管理（暂停/归档）。
- **steps**：
  1. 侧边导航加入口（含今日待办 badge）；
  2. 计划详情组件：今日任务组、阶段进度条、预计完成日；
  3. 勾选写回 + 「开始学习」→ 新建学习会话并注入上下文初始 prompt；
  4. 空/暂停/归档态；
  5. 组件测试 + 提交。

### T5 ThreadList 分组与 HomePage 入口

- **type**：开发
- **description**：ThreadList 按 kind 分「学习会话 / 计划会话」两组、独立折叠；HomePage 学习总览加今日任务摘要入口（各活跃计划待办数，点击跳计划视图）。
- **steps**：
  1. ThreadList 分组渲染与折叠状态持久化；
  2. HomePage 今日任务卡片；
  3. 组件测试 + 提交。

### T6 端到端验证与文档

- **type**：测试
- **description**：本地端到端走通「创建计划 → 预览确认 → 今日任务 → 开始学习 → 摘录笔记 → 复习入队 → 勾选完成 → 容量补位 → 手改 MD 后刷新正确」全流程；补 code-wiki 模块文档。
- **steps**：
  1. 端到端手动验证（官方 provider 与用户自定义 provider 各一遍）；
  2. 全量测试回归；
  3. `docs/code-wiki/` 新增学习计划模块文档并更新 README 索引；
  4. 提交。

## 六、风险与后续版本（非首版）

- **计划后续调整**（继续对话重新生成覆盖，保留已完成状态）：正式会话方案下的自然延伸，留待 V2；
- **外部资源推荐**：待有可信来源校验方案再评估；
- **多计划容量调度**：视真实使用反馈决定是否做聚合时长统计与冲突提示；
- **AI 排期质量**：依赖 skill 的 JSON 契约与 estimate 约束，上线后根据 bad case 迭代 SKILL.md（版本号递增）。
