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

## 10. 后续扩展（本阶段不含）

- P2 剩余：复习会话交互 UI（提问→作答→反馈→划线摘录→自评评级）、无 API Key 兜底。
- P3：学习者画像驱动——`update-learner` 接入会话结束流程，画像 low/medium 概念对应笔记提权、复习难度个性化。
- P4：图谱簇复习——按 wikilink 网络整簇提问（关系型问题）。
- 间隔算法演进：`history` 字段已预留，可升级为 FSRS 式个性化遗忘预测。

---

> 上一模块 → [13 Rust 后端](./13-rust-backend.md)
