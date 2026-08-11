# 09 · Skill 系统

> 本模块覆盖：SKILL.md 提示词模板的加载/变量替换，以及四个 LLM Skill 执行器（划线摘录 / 分支追问 / 学习者画像更新 / 复习出题与反馈）。
> 相关代码：`study-thread/src/skills/`、`study-thread/src/api/skills/`。

---

## 1. 模块职责

- 采用 DeepTutor 风格的 **SKILL.md 格式**：YAML frontmatter（name/description/version）+ Markdown body 提示词模板。
- V1 采用**固定流程调用**：所有 Skill 触发点都是确定的用户操作路径，不引入动态 Skill 选择。
- 执行器负责：加载模板 → `buildPrompt` 注入变量 → 调用 LLM → 解析/校验结构化输出。

## 2. Skill 加载器（`src/skills/loader.ts`）

| 函数 | 说明 |
|------|------|
| `parseSkill(raw)` | 正则提取 `^---\s*\n(.*?)\n---\s*\n` frontmatter → `yaml.load` → 校验 `name` 必填 → 返回 `{name, description, body}`；格式错误抛异常 |
| `buildPrompt(skill, vars)` | 将 body 中的 `{key}` 占位符全局替换为实际值（正则转义 key）；替换后校验占位符完整性：残留未注入的 `{xxx}` 时开发环境抛错、生产降级警告（`findUnresolvedPlaceholders` 按出现顺序去重返回残留占位符） |
| `loadSkillFromFile(filePath)` | 通过 `vault-fs.readFile` 读取文件系统上的 SKILL.md |

> 执行器内通过 Vite `?raw` import 直接内联 SKILL.md：`import skillRaw from '../../skills/extract-note/SKILL.md?raw'`（构建时内联，且 `tauri.conf.json` 的 bundle.resources 也会携带 `../src/skills/**/*.md`）。

## 3. Skill 清单

| Skill | 触发方式 | 执行器 | 输入变量 | 输出 |
|-------|---------|--------|----------|------|
| **extract-note** | 用户划线 → 点"生成笔记" | `api/skills/extract-note.ts` | `highlighted_text`、`session_context`、`user_title_block` | JSON `{title, description, tags}` |
| **branch-followup** | 进入分支会话追问 | `api/skills/branch-followup.ts` | `fork_context`、`user_question`、`related_notes` | 流式 Markdown（回顾/深入解答/延伸思考） |
| **update-learner** | 会话结束后生成画像 diff | `api/skills/update-learner.ts` | `session_transcript`、`existing_profile`、`new_notes` | JSON `ProfileDiff` |
| **review-quiz** | 到期笔记开始复习 | `api/skills/review-quiz.ts` | `note_content`、`related_notes`、`learner_profile` | 出题 JSON `{questions[]}` + 反馈流式 Markdown |
| **review-feedback** | 复习作答后反馈 | `api/skills/review-quiz.ts`（`reviewFollowupStream`） | `note_content`、`cluster_notes` | 流式 Markdown（费曼式反馈 + 涉及笔记标注） |
| **review-cluster-quiz** | 簇复习（P4）出题 | `api/skills/review-quiz.ts`（`generateClusterQuestions`） | `notes`、`relations`、`learner_profile` | 关系型出题 JSON `{questions[{level,question,notes}]}` |

## 4. 执行器详解

### 4.1 `extract-note.ts` — 划线摘录笔记

```ts
extractNote(highlightedText, sessionContext, provider, userTitle?): Promise<ExtractedNote>
```

流程：
1. `getSkill()`（模块级缓存解析结果）→ `buildPrompt` 注入划线文本、会话上下文、用户标题块。
2. `provider.chat([{role:'user', content:'请为上述划线内容生成笔记元信息。'}], {systemPrompt, temperature:0.3, maxTokens:1024})` 收集完整响应。
3. `extractJSON` 支持 ```json 代码块``` 或裸 `{}` → `JSON.parse`。
4. `validateExtractedMeta`：`title` 可选、`description`/`tags` 必填。
5. 组装 `ExtractedNote`：
   - 标题优先级：用户指定 > LLM 生成 > `fallbackTitle`（划线前 20 字）。
   - **原文不加工**：`proposition: ''`、`explanation: ''`、`type: 'concept'`（保守默认）、`confidence: 0.5`。
   - 正文由 `note-serializer.serializeNote` 原样写入（见 [03-notes-module.md](./03-notes-module.md)）。

**SKILL.md 要点**（version 2.0.0）：角色为"笔记整理助手"，仅补充元信息、不改写原文；输出 `{title(≤20字), description(≤30字), tags(2-5个)}`；禁止改写/总结/扩充原文。

### 4.2 `branch-followup.ts` — 分支深度追问

```ts
branchFollowupStream(question, forkContext, history, relatedNotes, provider, knowledgeContext?, toolContext?): AsyncIterable<StreamChunk>
```

流程：
1. `buildPrompt` 注入：`fork_context`（分叉点前消息，`serializeMessages` 序列化为 `## 用户/知枝` 文本）、`user_question`、`related_notes`（`serializeNotes`：标题/类型/标签/内容前 200 字）。
2. 可选 `knowledgeContext`（RAG 检索结果）拼接到 systemPrompt 之后。
3. `messages = [...history, {role:'user', content:question}]`。
4. 走 `chatWithTools`（含 `CLIENT_TOOLS`，支持模型按需读取参考资料全文），temperature 0.7，maxTokens 4096；异常包装为 `error` chunk。

**SKILL.md 要点**（version 1.0.0）：深度追问伴读角色，比主对话更深入、不重复基础概念、优先引用已有笔记；输出固定结构 `## 回顾` → `## 深入解答` → `## 延伸思考`（1-2 个问题）。

### 4.3 `update-learner.ts` — 学习者画像更新

```ts
generateProfileUpdate(session, existingProfile, newNotes, provider): Promise<ProfileDiff>
```

输出类型：

```ts
interface ProfileDiff {
  added_concepts: ConceptChange[]        // {name, confidence, description, prerequisites?, complements?}
  updated_concepts: ConceptChange[]      // {name, old_confidence, new_confidence, change_description?}
  removed_concepts: ConceptChange[]      // {name, reason?}
  suggested_topics: SuggestedTopic[]     // {topic, reason}
  summary: string
}
```

流程：序列化会话/笔记 → `buildPrompt` 注入 → 收集响应 → `extractJSON` → `validateProfileDiff`（五个字段类型校验）→ 返回。

**SKILL.md 要点**（version 1.0.0）：学习者画像分析师角色，只标注用户"能解释的"概念（严格区分听过与掌握）；置信度 high（能独立解释）/ medium（能识别不完整）/ low（刚接触）；标注概念关系；推荐 2-3 个主题；规则强调**宁漏勿虚**、未变化的概念不放入 updated_concepts。

**画像文件与自动触发（P3）**：
- 画像持久化于 `<vault>/.study-thread/learner.md`（YAML frontmatter：`known_concepts[{name, confidence, last_session}]`、`active_topics`、`total_sessions`、`total_notes`、`preferred_depth`、`preferred_style`），读写由 `src/utils/learner-profile.ts` 负责（`loadLearnerProfile` / `saveLearnerProfile` / `applyProfileDiff`）。
- MainChatPage / BranchChatPage 在一次流式回答结束（`finalizeResponse`）时调用 `maybeTriggerLearnerUpdate()`：校验 vault 与 API Key、消息数 ≥ 3、每会话仅触发一次（`useLearnerUpdate` 模块级 Set 去重），组装本次新生成笔记后调 `triggerLearnerUpdate`。
- `useLearnerUpdate`（`src/composables/useLearnerUpdate.ts`）编排：加载现有画像 → `generateProfileUpdate` 生成 diff → `LearnerProfileDialog`（复用 DiffView）展示 → 用户确认后 `applyProfileDiff` + `saveLearnerProfile`（`total_sessions` 自增）；生成失败静默关闭，不打断学习流程。
- **复习表现回写（P3-5）**：`generateProfileUpdate` 第 5 参 `reviewPerformance`（`summarizeReviewPerformance` 汇总的最近 N 次评级分布 + 掌握度）注入 SKILL.md `{review_performance}`，由 AI 判断 confidence 升降档，仅通过 `updated_concepts` 输出建议、不直接改画像。

### 4.4 `review-quiz.ts` — 复习出题与反馈（P2 AI 复习会话）

```ts
generateReviewQuestions(note, relatedNotes, provider, learnerProfile?): Promise<ReviewQuestion[]>
reviewFollowupStream(question, answer, note, provider): AsyncIterable<StreamChunk>
```

流程（出题）：
1. `getQuizSkill()` → `buildPrompt` 注入：`note_content`（`serializeNoteForReview`：标题/描述/类型/标签/正文，正文截断 4000 字）、`related_notes`（`serializeRelatedNotes`：每条截断 800 字，空则占位）、`learner_profile`（空则占位"按默认难度出题"）。
2. `provider.chat` 收集完整响应（temperature 0.3，maxTokens 4096，`disableThinking: true`——显式关闭思考模式，防止 DeepSeek V4-Flash 等模型思考挤空正文；簇模式同参数）。
3. `extractJSON` + `JSON.parse` + `validateQuizResponse`（questions 非空、每条含合法 `level` 与 `question`）。
4. 返回 `ReviewQuestion[]`（`{level: 'recognize'|'apply'|'explain', question}`）。

> **空响应防护**（P6）：`parseQuizResponseText` 先检查响应是否为空/纯空白——若为空单独抛出「AI 返回了空响应」提示（指向思考模式挤空预算/服务商异常），避免误报为 JSON 解析失败。`disableThinking` 选项已下沉到 `AnthropicProvider` 与 `OpenAICompatProvider`（请求体 `thinking: {type: 'disabled'}`），供出题/摘录等结构化输出场景复用。

流程（反馈）：`getFeedbackSkill()` → 注入 `note_content` → 以「复习问题/我的回答」两条 user 消息流式调用（temperature 0.5，maxTokens 2048），异常包装为 `error` chunk。

**SKILL.md 要点**：
- `review-quiz`（version 1.2.0）：复习伴读出题，3-5 个递进问题（识别→应用→解释），问题不透露答案，按画像调整难度分布（low/空→recognize 为主；medium→recognize+apply 均衡；high→explain 为主；标注"可能已掌握"→只出 explain 挑战题或建议跳过，P3-4）；**题型覆盖强制约束**——整组尽量覆盖多种题型（优先六类各一题，debate 至少一道），避免单一题型（P5 测试各题型交互）。
- `review-feedback`（version 1.0.0）：费曼式反馈，先肯定再指出缺口，用引导性问题让用户自己补齐，不重复基础概念；提供簇上下文时明确指出回答涉及/应涉及哪条笔记（P4-2）。
- `review-cluster-quiz`（version 1.0.0，P4-2）：知识网络复习伴读，基于 2-5 条簇内笔记 + wikilink 关系生成关系型问题（联系/区别/因果/适用场景），每问携带 `notes` 标注涉及笔记标题。

## 5. 为什么 V1 不做动态 Skill 选择

所有 Skill 触发点都是固定用户操作路径（点"生成笔记" / 进入分支 / 会话结束），没有"用户自由说话、LLM 自行判断用哪个 skill"的场景，因此直接由代码按路径加载对应 SKILL.md。V2 如需多能力动态路由再引入 manifest 模式。

## 5.1 触发机制与场景边界（确保只在正确场景传入 skill 全文）

### 触发矩阵

| Skill 全文 | 注入场景 | 触发条件 | 调用方 |
|-----------|---------|---------|--------|
| `extract-note` | 任意页面划线 → 生成笔记 | 用户显式点「生成笔记」且标题/标签至少一个开启 LLM | MainChatPage / BranchChatPage / ReviewChatPage / NoteDetailPage |
| `branch-followup` | 分支会话每轮追问 | 分支会话发送消息 | BranchChatPage |
| `update-learner` | 学习会话（主/分支）一轮回答结束 | 消息数 ≥ 3、每会话仅一次、非复习会话 | useLearnerUpdate（MainChatPage / BranchChatPage 回调） |
| `review-quiz` | 学习地图单条复习出题 | 到期笔记点「开始复习」（簇 ≤ 1） | LearningHubPage |
| `review-cluster-quiz` | 学习地图簇复习出题 | 「开始复习」且复习簇 > 1 | LearningHubPage |
| `review-feedback` | 复习会话逐题作答反馈 | 复习会话发送回答 | ReviewChatPage |
| （无 skill） | 主会话自由学习对话 | 普通聊天 | MainChatPage（硬编码 SYSTEM_PROMPT） |

### 五条约束（新增 skill / 执行器时必须遵守）

1. **场景 → skill 一对一绑定**：每个用户操作路径只注入其专属 skill 全文，禁止跨场景复用其他 skill 模板。
2. **固定流程优于动态选择**：skill 全文只在确定性操作路径注入，不引入"LLM 自行判断用哪个 skill"，避免全文被错误注入；V2 动态路由需走 manifest 并显式评审。
3. **场景边界**：
   - 自由学习对话（主会话）→ 普通 `SYSTEM_PROMPT`，不注入任何 skill；
   - 复习会话 → 仅允许 `review-quiz` / `review-feedback` / `review-cluster-quiz` + `extract-note`（划线），**不触发 `update-learner`**（画像通过 `review_performance` 回写，而非复习会话文本）；
   - 画像更新 → 仅学习会话（主/分支），且每会话一次（`useLearnerUpdate` 模块级 `updatedSessionIds` 去重）。
4. **占位符完整性**：`buildPrompt` 会对残留 `{xxx}` 报错（开发）/警告（生产），新增 SKILL.md 变量必须同步注入，防止 skill 全文带占位符原样传给 LLM。
5. **无 LLM 场景不传 skill**：如 `extract-note` 在标题/标签开关全关时走本地兜底、完全不调用 LLM，连 skill 全文也不下发。

## 6. 协作链路

```
MainChatPage.handleExtractNote ──► extractNote ──► noteStore.saveNote
BranchChatPage.handleSend ──► branchFollowupStream ──► chatWithTools ──► CLIENT_TOOLS
（会话结束，P3）──► maybeTriggerLearnerUpdate ──► generateProfileUpdate ──► LearnerProfileDialog（DiffView 确认/取消）──► applyProfileDiff + saveLearnerProfile
（复习会话，P2）──► generateReviewQuestions ──► 逐题作答 ──► reviewFollowupStream ──► reviewStore.applyReview
```

## 7. 相关测试

- `src/skills/loader.test.ts`（含占位符残留校验：全部注入无残留 / 残留报错 / `findUnresolvedPlaceholders` 去重与 JSON 花括号不误报）
- `src/api/skills/extract-note.test.ts`、`branch-followup.test.ts`、`update-learner.test.ts`

---

> 上一模块 → [08 LLM API 适配层](./08-llm-api-layer.md)  
> 下一模块 → [10 Embedding 向量引擎](./10-embedding-module.md)
