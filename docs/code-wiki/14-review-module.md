# 14 · 间隔复习模块（P1 调度层）

> 本模块覆盖：SRS 间隔复习调度器的纯逻辑、复习队列持久化（`review-state.json`）、到期清单 UI 与笔记生命周期集成。
> 相关代码：`study-thread/src/utils/review-scheduler.ts`、`study-thread/src/stores/review.ts`、`study-thread/src/components/review/ReviewDueList.vue`、`study-thread/src/views/LearningHubPage.vue`（复习视图）。

---

## 1. 模块职责

- **调度**：决定"何时复习哪条笔记"——按笔记类型差异化间隔序列 + 四档评级推进（借鉴 DeepTutor `learning/scheduler.py` 与 Anki SM-2 思路）。
- **持久化**：复习队列存于 `<vault>/.study-thread/review-state.json`（DEVELOPMENT.md 已规划该位置）。
- **生命周期集成**：新笔记保存即入队（次日到期）；删除笔记级联清理队列。
- **展示**：学习地图新增「复习」视图，展示到期笔记卡片与评级操作，侧栏显示到期数量徽标。

> 本阶段为纯本地调度层（无 LLM 依赖），是后续「AI 复习会话 / 画像驱动 / 图谱簇复习」的地基。

## 2. 数据模型（`src/types/index.ts`）

```ts
type ReviewRating = 'again' | 'hard' | 'good' | 'easy'

interface ReviewHistoryEntry { at: string; rating: ReviewRating }

interface ReviewTask {
  notePath: string   // notes/<标题>.md
  title: string      // 冗余标题，列表展示无需重读文件
  type: string       // concept | method | fact | question（决定间隔序列）
  dueAt: string      // ISO 时间，到期时间
  interval: number   // 当前间隔（天）
  mastery: number    // 掌握度 0-1
  history: ReviewHistoryEntry[]  // 评级历史（为后续 FSRS 式个性化调度预留）
}
```

`Note.review`（`next/interval/mastery`）为**镜像字段**：`notes.ts` 的 `loadNote` 从复习队列合并得到，权威数据始终在 `review-state.json`。

## 3. 调度器纯逻辑（`src/utils/review-scheduler.ts`）

无 Vue 依赖的纯函数模块，全部可单测。

| 函数 | 说明 |
|------|------|
| `getIntervals(type)` | 按类型返回间隔序列；未知类型回退默认序列 |
| `createReviewTask(notePath, title, type, now?)` | 新笔记入队：`interval: 0`、次日到期、`mastery: 0` |
| `applyRating(task, rating, now?)` | 评级推进间隔与掌握度，返回新任务（含 history 追加） |
| `priorityOf(task)` | 任务优先级：mastery < 0.3 最高；上次 again 或 mastery < 0.6 次之；其余按类型偏好 |
| `buildDueList(tasks, now?)` | 到期任务按优先级升序（同优先级按到期先后） |
| `countDue(tasks, now?)` | 到期数量（徽标用） |

**间隔序列**（单位：天）：

| 笔记类型 | 间隔序列 |
|----------|----------|
| concept | [1, 3, 7, 14, 30, 60] |
| method  | [1, 3, 7, 14, 30] |
| fact    | [2, 5, 10, 20] |
| question| [1, 2, 5, 10] |

**评级映射**（间隔序列下标位移 + 掌握度增量）：

| 评级 | step | masteryDelta |
|------|------|--------------|
| again（忘了） | -2 | -0.2 |
| hard（模糊） | 0 | 0 |
| good（记得） | +1 | +0.2 |
| easy（熟练） | +2 | +0.4 |

下标位移夹在序列边界内；掌握度夹在 [0, 1]。

## 4. 复习 Store（`src/stores/review.ts`）

| 状态 | 说明 |
|------|------|
| `queue` | 复习队列（ReviewTask[]） |
| `isLoading` / `currentVaultPath` | 加载状态与当前 vault |
| `dueTasks` / `dueCount` | 到期任务与数量（computed，走 `buildDueList`） |

| 动作 | 说明 |
|------|------|
| `loadQueue(vaultPath)` | 读取 `review-state.json`；缺失/损坏置空列表 |
| `enqueue(task)` | 入队（幂等：同 notePath 跳过）并持久化 |
| `applyReview(notePath, rating, now?)` | 评级回写（调度器推进）并持久化 |
| `removeFromQueue(notePath)` | 删除笔记级联清理 |

持久化格式：

```json
{
  "version": 1,
  "queue": [
    {
      "notePath": "notes/xx.md",
      "title": "xx",
      "type": "concept",
      "dueAt": "2026-08-09T00:00:00.000Z",
      "interval": 0,
      "mastery": 0,
      "history": []
    }
  ]
}
```

## 5. 笔记生命周期集成（`src/stores/notes.ts`）

- `saveNote`：写盘成功后 `useReviewStore().enqueue(createReviewTask(...))`（次日到期），失败不影响笔记保存。
- `deleteNote`：删除成功后 `useReviewStore().removeFromQueue(path)`，失败不影响删除结果。
- `loadNote`：从复习队列合并 `Note.review` 镜像字段（未入队则为占位值）。

## 6. UI（复习视图）

- `src/components/review/ReviewDueList.vue`：到期卡片列表。卡片展示标题、类型徽标、间隔、上次评级、掌握度进度条；底部四档评级按钮（忘了/模糊/记得/熟练）。空状态提示"今日无到期复习"。
- `src/views/LearningHubPage.vue`：左侧管理栏新增「复习」入口（带到期数徽标），新增 `review` 视图；`onMounted` 时 vault 就绪则 `loadQueue`；评级后 Toast 提示下一次间隔；点击卡片跳转笔记详情（`/notes/<path>`）。

## 7. 协作链路

```
noteStore.saveNote ──► useReviewStore().enqueue(createReviewTask)
LearningHubPage(onMounted) ──► reviewStore.loadQueue(vaultPath)
ReviewDueList @rate ──► reviewStore.applyReview ──► review-scheduler.applyRating ──► persist(review-state.json)
noteStore.deleteNote ──► reviewStore.removeFromQueue
noteStore.loadNote ──► 合并 Note.review 镜像
```

## 8. 相关测试

- `src/utils/review-scheduler.test.ts`：间隔序列、createReviewTask、评级推进（含边界夹取/连错/未知类型）、优先级、到期过滤与排序。
- `src/utils/review-session.test.ts`：复习会话创建、序列化 round-trip、frontmatter 标记解析、关联笔记装载。

## 9. P2 AI 复习会话（进行中）

### 9.1 review-quiz skill（已完成，见 [09-skills-system.md](./09-skills-system.md#44-reviewquizts--复习出题与反馈p2-ai-复习会话)）

- `generateReviewQuestions`：基于笔记 + 关联笔记 + 画像生成 3-5 个递进问题（recognize/apply/explain）。
- `reviewFollowupStream`：对作答做费曼式反馈（对照笔记原文指出缺口）。

### 9.2 复习会话模型与上下文装载（`src/utils/review-session.ts`）

- **会话模型**：复习会话是**独立根会话**——`Session.kind === 'review'` + `reviewed_note`（被复习笔记路径），不进入 `session-tree.json`、不占用分支深度（≤3）。
- **出题结果持久化**：`review_questions` 序列化到 frontmatter（YAML flow 序列/JSON 字符串双形态兼容），重新打开复习会话无需重新出题。
- **文件命名**：`sessions/review-<id>.md`（`getReviewSessionFilePath` / `saveSessionToVault(..., isReview)`）。
- **序列化扩展**（`session-serializer.ts`）：frontmatter 新增 `kind` / `reviewed_note` / `review_questions`。
- **装载工具**：
  - `createReviewSession(note, questions)`：构建复习会话，首条 assistant 消息为"复习目标 + 问题列表"。
  - `buildReviewRelatedNotes(note, allNotes)`：wikilink 目标优先、同标签补充，去重截断（上限 4 条；P3 可扩展 RAG）。
  - `loadReviewSession(vaultPath, sessionId)`：解析复习会话文件 → Session（含出题结果与消息）。
- **协作链路**：`LearningHub 开始复习 → generateReviewQuestions → createReviewSession → saveSessionToVault(isReview) → 复习会话页 → 逐题 reviewFollowupStream → reviewStore.applyReview`

### 9.3 复习会话交互 UI（`src/views/ReviewChatPage.vue`）

- **路由**：`/review/:sessionId`（`router/index.ts`）；App 布局中 `/review*` 映射项目 1、隐藏会话列、显示返回按钮。
- **入口**：学习地图复习视图 `ReviewDueList` 卡片新增「开始复习」按钮 → `LearningHubPage.handleStartReview`（出题 → 创建复习会话 → 跳转）。
- **页面**：复用 `ChatView` + `Composer`；顶部展示被复习笔记标题（可跳详情）与答题进度；`handleSend` 调 `reviewFollowupStream` 流式反馈，逐题推进。
- **划线双路径**：复用划线菜单——「生成笔记」→ `extract-note` skill → 新笔记自动入队；「加入笔记」→ `AddToNoteDialog` 插回原笔记。
- **自评闭环**：「结束复习」→ 四档自评面板 → `reviewStore.applyReview` → Toast 提示 → 返回学习地图。
- **无 API Key 兜底**：出题为空时 `createReviewSession` 首条消息展示笔记原文，页面显示"原文复习模式"提示并仅提供自评。

## 10. 后续扩展（本阶段不含）

- P4：图谱簇复习——按 wikilink 网络整簇提问（关系型问题）。
- 间隔算法演进：`history` 字段已预留，可升级为 FSRS 式个性化遗忘预测。

## 11. P3 学习者画像闭环（已完成 P3-1）

画像为复习提权（P3-3）与难度个性化（P3-4）提供输入，本阶段先打通"会话 → 画像"闭环：

- **画像文件**：`<vault>/.study-thread/learner.md`（YAML frontmatter），读写与 diff 应用由 `src/utils/learner-profile.ts` 负责（`loadLearnerProfile` / `saveLearnerProfile` / `serializeLearnerProfile` / `applyProfileDiff`：added→新增、updated→更新置信度、removed→移除、suggested_topics→并入 active_topics，`total_sessions` 自增）。
- **自动触发**：MainChatPage / BranchChatPage 的 `finalizeResponse`（一次流式回答结束）调用 `maybeTriggerLearnerUpdate()`——校验 vault / API Key / 消息数 ≥ 3 / 每会话一次（`useLearnerUpdate` 模块级 Set 去重）后，加载现有画像 + 本次新生成笔记调 `generateProfileUpdate`。
- **确认 UI**：`useLearnerUpdate` 编排 diff 生成与确认；`LearnerProfileDialog`（`src/components/learner/`，复用 DiffView）展示画像变更，用户确认 → `applyProfileDiff` + `saveLearnerProfile`；取消或生成失败 → 静默关闭，不打断学习流程。
- **测试**：`src/utils/learner-profile.test.ts`（路径 / 空画像 / round-trip / load-save / diff 应用 8 用例）。

### 11.1 画像概念 → 笔记映射（P3-2，`src/utils/learner-note-link.ts`）

将画像 `known_concepts` 关联到对应原子笔记，供复习提权（P3-3）与难度个性化（P3-4）使用：

- **精确匹配** `matchConceptExact(conceptName, notes)`：概念名 == 笔记标题 或 命中笔记 tags（忽略大小写、去首尾空白）。
- **语义匹配** `matchConceptSemantic(conceptName, notes, topK, threshold)`：对概念名 embedding，与 `NoteIndexer` 已索引向量算余弦相似度，取 Top-K（默认 3）且相似度 ≥ 阈值（默认 `SEMANTIC_THRESHOLD = 0.5`）；**宁缺毋滥**，低于阈值不关联。引擎未就绪 / 无索引 / 出错时静默返回 `[]`（纯增量能力，不阻塞）。
- **主入口** `linkConceptsToNotes(profile, notes, options)`：逐概念执行精确 + 语义并合并去重，无命中的概念不写入映射，返回 `Map<conceptName, notePath[]>`。
- **映射缓存**：`get/set/invalidateLearnerLinkCache(vaultPath)` 按 vault 缓存；笔记变更（`notes store` 的 updateNote / saveNote / deleteNote）时调用 `invalidateLearnerLinkCache` 使缓存失效，下次读取重新计算。
- **测试**：`src/utils/learner-note-link.test.ts`（标题 / 标签 / 语义三种匹配路径、低相似度过滤、合并去重、缓存失效 18 用例）。

### 11.2 低掌握度概念复习提权（P3-3）

画像 low/medium 置信度概念对应的笔记在到期队列中优先安排：

- **调度器**（`src/utils/review-scheduler.ts`）：新增 `priorityWithProfile(task, boostedPaths)`——命中提权集合的笔记优先级提升一档（`Math.max(0, base - 1)`），null/空集合时行为与 `priorityOf` 完全一致（无画像不改变原调度）；`buildDueList` 新增可选第三个参数 `boostedPaths`。
- **提权信号提取**（`learner-note-link.ts`）：`collectWeakNotePaths(profile, map)` 从画像与概念→笔记映射中收集 low/medium 置信度概念对应笔记路径（high 置信度不计入弱项）。
- **review store**（`src/stores/review.ts`）：新增 `boostedNotePaths` 状态；`loadQueue` 加载队列后调用 `refreshBoostedPaths(vaultPath)`——加载画像 → `linkConceptsToNotes` 计算映射 → `collectWeakNotePaths` 提取弱项；任何一步失败静默置空（无画像 / 引擎未就绪 / 笔记未加载都不影响复习）。`dueTasks` 排序时传入提权集合。
- **UI 反馈**：`ReviewDueList` 新增可选 `boostedPaths` prop，命中笔记卡片显示「画像弱项」标记（琥珀色徽章）。
- **测试**：`review-scheduler.test.ts`（提权一档 / 不低于 0 / 排序正确 / 无画像行为不变）、`learner-note-link.test.ts`（弱项提取）、`review.test.ts`（loadQueue 计算提权、失败置空、可单独刷新）。

### 11.3 复习提问难度个性化（P3-4）

`review-quiz` 注入画像后按 confidence 调节提问深度：

- **画像注入文本**（`learner-profile.ts`）：`describeLearnerProfile(profile)` 生成精简文本——概念名 + 置信度（low 刚接触 / medium 能识别不完整 / high 能独立解释）+ 最近学习日期 + 学习主题，供出题 prompt 注入。
- **出题参数**（`review-quiz.ts`）：`generateReviewQuestions(note, relatedNotes, provider, learnerProfile?, graduationHint?)`——画像非空时原样注入 `{learner_profile}` 变量；`graduationHint` 存在时追加在画像之后一并注入。
- **毕业引导**：`shouldSuggestGraduation(note, profile, mastery)`——笔记标题/标签命中画像 **high** 置信度概念且掌握度 ≥ `GRADUATION_MASTERY_THRESHOLD (0.9)` 时返回 true。`LearningHubPage.handleStartReview` 据此生成毕业引导文本（"只出 1-2 道 explain 挑战题，或建议跳过"）传入出题。
- **SKILL.md**（`src/skills/review-quiz/SKILL.md`）：出题要求第 4 条细化难度映射——low/空 → recognize 为主；medium → recognize 与 apply 均衡；high → 减少 recognize 增加 explain；标注"可能已掌握"时只出 explain 挑战题或建议跳过。
- **测试**：`review-quiz.test.ts`（画像字段注入 / 毕业引导注入 / shouldSuggestGraduation 判定 6 用例）、`learner-profile.test.ts`（describeLearnerProfile 3 用例）。

### 11.4 复习评级回写画像（P3-5）

复习评级表现作为下一次画像更新时 confidence 升降档的依据：

- **评级统计**（`review-scheduler.ts`）：`summarizeReviewPerformance(tasks, notePaths, windowSize = 5)` 按笔记汇总最近 N 次评级分布（again/hard/good/easy 计数）与当前掌握度，无复习记录时忽略，全部无记录返回空字符串。
- **回写机制**（`update-learner.ts`）：`generateProfileUpdate(session, existingProfile, newNotes, provider, reviewPerformance?)` 新增第 5 参——复习表现摘要注入 SKILL.md 的 `{review_performance}` 变量（空时占位"（暂无复习表现数据）"），由 AI 综合判断是否升降档，不直接修改画像。
- **触发链路**（`useLearnerUpdate.ts`）：`trigger` 生成 diff 前，取本次会话生成笔记路径，用 `useReviewStore().queue` 计算 `summarizeReviewPerformance` 后传入 `generateProfileUpdate`。
- **SKILL.md**（`src/skills/update-learner/SKILL.md`）：输入新增 `{review_performance}`；分析要求第 6 条——连续 good/easy 或掌握度高 → 对应概念升档；多次 again 或掌握度低 → 降档；表现为空时仅依据会话内容；只通过 updated_concepts 输出建议。
- **测试**：`review-scheduler.test.ts`（评级分布汇总 / windowSize 截取 / 无记录忽略 4 用例）、`update-learner.test.ts`（新增：复习表现注入与默认占位 5 用例）。

## 12. P4 图谱簇复习（已完成 P4-1）

### 12.1 簇选择策略（`src/utils/review-cluster.ts`）

以到期笔记为中心，取 wikilink / 反链 **1 度邻居**构成复习簇：

- **邻居解析**：
  - 正向链接：中心笔记正文中的 `[[wikilink]]` 目标（`extractAllLinks` + `resolveWikiLinkTarget` 解析到笔记路径）。
  - 反向链接：遍历其余笔记正文，解析 wikilink 命中中心笔记（复用 `parseWikiLinks` + `resolveWikiLinkTarget`，与详情页反链同一套解析）。
- **簇构成**（`buildReviewCluster(notePath, allNotes, maxSize = 5)`）：返回中心笔记 + 1 度邻居（去重、截断）；**无邻居 → 退化为仅含中心的单条复习**（保持 P2 行为）；`maxSize ≤ 1` 时仅返回中心；中心不存在返回空数组。
- **排序**（`collectOneHopNeighbors`）：按链接强度降序——双向（正+反）> 仅正向 > 仅反向；同强度按更新时间较新优先。`linkStrength(note, outgoing, incoming)` 为纯函数。
- **测试**：`review-cluster.test.ts`（正向 / 反向 / 双向优先 / 强度排序 / 上限截断 / 无邻居退化单条 / 中心缺失 11 用例）。

### 12.2 review-quiz 簇模式（P4-2）

skill 输入扩展为多笔记，生成概念间**关系型问题**（联系 / 区别 / 因果 / 适用场景）：

- **新 SKILL.md**（`src/skills/review-cluster/SKILL.md`）：输入 `{notes}`（2-5 条，首条为中心）+ `{relations}`（簇内 wikilink 指向）+ `{learner_profile}`；出题侧重概念间关系而非孤立事实；每道问题带 `notes` 标注涉及笔记标题（为 P4-4 缺口定位提供依据）。
- **执行器扩展**（`review-quiz.ts`）：
  - `serializeClusterNotes(notes)`：多笔记序列化（编号 + 中心标记 + 标签 + 正文，每条截断 1200 字防超长）。
  - `serializeClusterRelations(notes)`：提取簇内互相指向的 wikilink，输出 `A → B`；无则占位。
  - `generateClusterQuestions(notes, provider, learnerProfile?)`：非流式出题，返回 `ClusterReviewQuestion[]`（`ReviewQuestion` + 可选 `notes` 字段）；校验兼容缺省 notes 的问题。
  - **单条模式保持兼容**：`generateReviewQuestions` 签名与行为不变。
- **答案缺口定位**：`reviewFollowupStream(question, answer, note, provider, clusterNotes?)` 新增可选簇上下文——注入 `review-feedback` SKILL.md 新增的 `{cluster_notes}` 变量；SKILL.md 反馈要求第 6 条：结合整簇判断完整性，明确指出回答涉及/应涉及哪条笔记。
- **测试**：`review-quiz.test.ts`（簇序列化 4 用例 + generateClusterQuestions 4 用例 + 反馈簇注入 2 用例）。

### 12.3 簇复习 UI（P4-3，`src/views/ReviewChatPage.vue`）

复习会话页面按 `frontmatter.review_cluster` 进入簇模式（簇内笔记 > 1）：

- **簇展示**：对话区首条消息前展示可折叠「复习簇」面板——簇内笔记列表（编号 + 标题，点击跳转笔记详情），当前被复习笔记高亮（品牌色块 + 「当前」徽标，复用 `--brand-soft` / `--brand` tokens，对齐学习地图概念网络视图）。
- **簇上下文出题**：`handleSend` 将 `clusterNotes` 作为第 5 参传入 `reviewFollowupStream`，AI 反馈结合整簇笔记并指出回答涉及/应涉及哪条笔记（P4-2 能力）。
- **逐条评级**：结束面板在簇模式下展示每条簇内笔记的四档自评按钮，**每条笔记独立 `applyReview(notePath, rating)`**；已评级条目标记「已评级」并禁用；全部评级后点击「完成复习」返回学习地图（不自动跳转）。未评级的簇内笔记不改变调度状态（为 P4-4 精准回写留口）。
- **单条模式保持原行为**：无簇（长度 ≤ 1）时维持四档自评、评级后自动返回。
- **持久化**：`createReviewSession` 第 4 参 `cluster` 仅在簇长度 > 1 时写入 `review_cluster`；`loadReviewSession` 解析 frontmatter（兼容 YAML 数组 / JSON 字符串），重开复习会话自动恢复簇面板。
- **测试**：`ReviewChatPage.test.ts`（簇面板渲染与当前高亮、逐条评级独立 applyReview、评级后不自动跳转需手动完成、`reviewFollowupStream` 第 5 参透传）。

### 12.4 复习缺口精准回写（P4-4，`src/utils/review-gap.ts`）

用户回答暴露的知识缺口定位到具体笔记，**仅调整缺口笔记的调度状态**：

- **缺口定位（AI 标注路径）**：review-feedback SKILL 第 6 条已要求 AI 明确指出回答涉及/应涉及哪条笔记（标题）；`parseMentionedNotes(feedbackText, notes)` 纯函数按标题从反馈文本解析提及的簇内笔记路径——优先 `[[wikilink]]`（兼容 `[[标题|别名]]`）匹配，其次纯文本标题包含（标题长度 ≥ 2 防误判）；只匹配簇内笔记，避免误匹配 vault 其他笔记。
- **缺口定位（评级路径）**：簇内每条笔记独立四档评级（P4-3），用户评级即视为对该笔记状态的显式回写。
- **回写**：`ReviewChatPage` 在 AI 反馈完成后解析缺口笔记存入 `gapPaths`，评级面板对缺口笔记显示「AI 缺口」徽标引导用户聚焦；仅用户实际评级的笔记调用 `reviewStore.applyReview`，**未涉及的簇内笔记不改变调度状态**。
- **测试**：`review-gap.test.ts`（wikilink / 别名 / 纯文本匹配、未提及不标记、短标题防误判、去重，6 用例）；`ReviewChatPage.test.ts` 新增 AI 反馈后缺口标记用例（9 用例）。

---

> 上一模块 → [13 Rust 后端](./13-rust-backend.md)
