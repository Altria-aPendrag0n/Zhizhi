# 15. 复习出题形式模块

> 对应开发报告：`docs/.trae/documents/复习出题形式开发报告.md`（Plan，已批准落地）
> 核心代码：`src/review/question-registry.ts`、`src/utils/review-difficulty.ts`、`src/components/review/*`、`src/skills/review-{quiz,cluster,feedback,debate}/SKILL.md`、`src/api/skills/review-quiz.ts`

## 1. 职责

把复习出题从「单一开放式问答」升级为「**六类题型 + 全结构化交互 + 掌握度难度适配**」：

| 维度 | 实现 |
|---|---|
| 题型 | choice / true_false / fill_blank / ordering / short_answer / debate |
| 认知层级 | recognize / apply / explain（与题型构成 level × type 双轴） |
| 难度信号 | 卡片掌握度（mastery）+ 复习曲线（classic 间隔档位 / fsrs 表现分·波动）+ 画像 confidence |
| 交互 | 选择题/判对错/填空/排序渲染专属组件；辩论多轮对答；简答走文本输入 |
| 可拓展性 | 题型注册表（type → 校验/序列化/渲染），新增题型零散改动 |

## 2. 数据模型（`src/types/index.ts`）

```ts
export type ReviewQuestionType = 'choice' | 'true_false' | 'fill_blank' | 'ordering' | 'short_answer' | 'debate'

export interface ReviewQuestion {
  level: ReviewQuestionLevel          // recognize | apply | explain（必填）
  type: ReviewQuestionType            // 必填；LLM 缺省/非法时由校验降级 short_answer
  question: string
  options?: string[]                  // choice：2-4 个选项（题干不含字母，前端渲染 A/B/C/D）
  steps?: string[]                    // ordering：乱序步骤
  blanks?: number                     // fill_blank：空位数（默认 1）
  position?: string                   // debate：AI 持方观点
  maxRounds?: number                  // debate：最大辩论轮次（默认 3）
}
```

**兼容性**：旧会话 frontmatter 中的 `review_questions` 无 `type`，`review-session.ts` 的 `parseReviewQuestions` 经 `normalizeQuizQuestion` 自动降级为 `short_answer`，不破坏既有会话。

## 3. 题型注册表（`src/review/question-registry.ts`）

纯逻辑模块（无 Vue 依赖，可单测），集中管理：

- `REVIEW_QUESTION_TYPES` / `REVIEW_QUESTION_LEVELS`：枚举常量
- `QUESTION_TYPE_LABELS` / `QUESTION_TYPE_DIFFICULTY`：标签与难度档（★ 1-4）
- `FIELD_VALIDATORS`：题型特定字段校验（choice 需 options≥2；ordering 需 steps≥2）
- `normalizeQuizQuestion(raw)`：出题响应规范化——level 非法丢弃、type 缺省/未知降级 `short_answer`、可选字段补默认值（`DEFAULT_MAX_ROUNDS=3` / `DEFAULT_BLANKS=1`）
- `serializeAnswer(type, payload)`：组件作答 payload → 消息文本（走既有 `handleSend(content)` 消息流，session 持久化零破坏）
- `shouldEndDebate(type, round, maxRounds)`：辩论轮次判定（`round >= maxRounds` 结束）
- `formatQuestionForDisplay(question)`：反馈 prompt 注入文本（含题型标签与选项/步骤）

**新增题型流程**：加枚举 → 加 `FIELD_VALIDATORS`/label/difficulty → 加作答组件并在页面分派处挂载 → 补 `serializeAnswer` 分支。不修改既有代码路径。

## 4. 掌握度 × 复习曲线难度信号（`src/utils/review-difficulty.ts`）

- `difficultyBandFromMastery(mastery)`：档位映射 `<0.3 low / 0.3-0.6 medium / 0.6-0.9 high / ≥0.9 graduate`
- `describeDifficultyContext(task, algorithm)`：生成注入出题 prompt 的难度依据文本
  - `classic`：掌握度 + 当前 interval 在类型序列（如 concept `[1,3,7,14,30,60]`）中的档位；间隔位于序列后半段 → 建议题单首题放识别题校验遗忘
  - `fsrs`：掌握度 + `estimatePerformance`（近 6 次加权表现分）+ `estimateDifficulty`（评级波动）；波动大 → 建议补低难度题稳定信心

**注入链路**：`LearningHubPage.handleStartReview` → 从 `reviewStore.queue` 取当前卡 `ReviewTask` → `describeDifficultyContext(task, settingsStore.reviewAlgorithm)` → 传入 `generateReviewQuestions/generateClusterQuestions` 的 `difficultySignal` 参数 → 以 `{difficulty_signal}` 占位符注入 SKILL。

**闭环**：评级 → `applyReview()` 回写 mastery → 下次复习自动按新掌握度出题（会话内动态追加列为后续增强，V1 不做）。

## 5. 出题与反馈 SKILL

| SKILL | 变更 |
|---|---|
| `review-quiz` / `review-cluster`（1.1.0） | 新增「题型选择」章节（六类定义 + 笔记类型引导 + 难度矩阵）；`{difficulty_signal}` 输入；支架式回忆规则（低掌握给线索，避免裸默写）；JSON 输出示例含 `type/options/steps/position/maxRounds` |
| `review-feedback`（1.1.0） | 新增「按题型反馈」：choice 解释错选、true_false 辨析、fill_blank 逐空判错、ordering 定位错位步骤；`{review_question}` 输入 |
| `review-debate`（新增 1.0.0） | 辩论对答 prompt：中段反驳/追问、末轮总结评估（立场评价 + 缺口 + 给分） |

**执行器**（`src/api/skills/review-quiz.ts`）：

- `parseQuizResponse` / `parseClusterQuizResponse`：接入 `normalizeQuizQuestion`，全部题目非法时抛错
- `reviewFollowupStream(question: ReviewQuestion, ...)`：注入题型上下文
- `reviewDebateStream(question, turns, note, provider, clusterNotes?, round, maxRounds)`：辩论流式回复，末轮（`shouldEndDebate` 为真）输出总结

## 6. 交互 UI（`src/components/review/*` + `ReviewChatPage.vue`）

| 组件 | 题型 | 交互 |
|---|---|---|
| `ChoiceAnswer.vue` | choice | 选项按钮（A/B/C/D），点选即答，emit `{index, text}` |
| `TrueFalseAnswer.vue` | true_false | 「正确/错误」按钮，emit `boolean` |
| `FillBlankAnswer.vue` | fill_blank | 输入框（多空用「；」分隔），emit `string` |
| `OrderingAnswer.vue` | ordering | 乱序步骤列表 + 上移/下移重排，emit 重排后 `string[]` |
| `DebateView.vue` | debate | 轮次指示（第 X/Y 轮）+ AI 持方；辩论仍走 Composer 文本输入 |

**分派逻辑**（`ReviewChatPage.vue`）：`activeQuestion.type` 经 `STRUCTURED_TYPES` 判断——结构化题型渲染组件并 `serializeAnswer` 后走 `handleSend`；`debate` 渲染轮次指示 + Composer，由 `debateRound`/`debateTurns` 状态机驱动（未达 `maxRounds` 不推进题号，末轮总结后推进）。

## 7. 测试覆盖

- `src/review/question-registry.test.ts`（21 例）：normalize 各题型/降级/丢弃、serialize、shouldEndDebate
- `src/utils/review-difficulty.test.ts`（6 例）：档位阈值边界、classic/fsrs 文本差异、空队列回退
- `src/api/skills/review-quiz.test.ts`（37 例）：题型字段透传、反馈题型注入、辩论轮次/总结
- `src/components/review/answers.test.ts`（9 例）：四组件渲染/交互/disabled
- `src/views/ReviewChatPage.test.ts`（10 例）：结构化分派、3 轮辩论状态机
- `src/utils/review-session.test.ts`：旧会话 type 降级兼容

## 8. 降级与风险

- LLM 出题字段不稳定（options 缺项、steps 乱序）→ 校验丢弃该题或降级 `short_answer`，会话不中断
- debate 拉长会话 → `maxRounds` 默认 3
- 旧 session 兼容 → 消息流仍为纯字符串，`review_questions` 解析自动补 `type`
