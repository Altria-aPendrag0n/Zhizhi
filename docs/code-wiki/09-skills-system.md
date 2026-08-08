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
| `buildPrompt(skill, vars)` | 将 body 中的 `{key}` 占位符全局替换为实际值（正则转义 key） |
| `loadSkillFromFile(filePath)` | 通过 `vault-fs.readFile` 读取文件系统上的 SKILL.md |

> 执行器内通过 Vite `?raw` import 直接内联 SKILL.md：`import skillRaw from '../../skills/extract-note/SKILL.md?raw'`（构建时内联，且 `tauri.conf.json` 的 bundle.resources 也会携带 `../src/skills/**/*.md`）。

## 3. Skill 清单

| Skill | 触发方式 | 执行器 | 输入变量 | 输出 |
|-------|---------|--------|----------|------|
| **extract-note** | 用户划线 → 点"生成笔记" | `api/skills/extract-note.ts` | `highlighted_text`、`session_context`、`user_title_block` | JSON `{title, description, tags}` |
| **branch-followup** | 进入分支会话追问 | `api/skills/branch-followup.ts` | `fork_context`、`user_question`、`related_notes` | 流式 Markdown（回顾/深入解答/延伸思考） |
| **update-learner** | 会话结束后生成画像 diff | `api/skills/update-learner.ts` | `session_transcript`、`existing_profile`、`new_notes` | JSON `ProfileDiff` |
| **review-quiz** | 到期笔记开始复习 | `api/skills/review-quiz.ts` | `note_content`、`related_notes`、`learner_profile` | 出题 JSON `{questions[]}` + 反馈流式 Markdown |
| **review-feedback** | 复习作答后反馈 | `api/skills/review-quiz.ts`（`reviewFollowupStream`） | `note_content` | 流式 Markdown（费曼式反馈） |

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

### 4.4 `review-quiz.ts` — 复习出题与反馈（P2 AI 复习会话）

```ts
generateReviewQuestions(note, relatedNotes, provider, learnerProfile?): Promise<ReviewQuestion[]>
reviewFollowupStream(question, answer, note, provider): AsyncIterable<StreamChunk>
```

流程（出题）：
1. `getQuizSkill()` → `buildPrompt` 注入：`note_content`（`serializeNoteForReview`：标题/描述/类型/标签/正文，正文截断 4000 字）、`related_notes`（`serializeRelatedNotes`：每条截断 800 字，空则占位）、`learner_profile`（空则占位"按默认难度出题"）。
2. `provider.chat` 收集完整响应（temperature 0.3，maxTokens 1024）。
3. `extractJSON` + `JSON.parse` + `validateQuizResponse`（questions 非空、每条含合法 `level` 与 `question`）。
4. 返回 `ReviewQuestion[]`（`{level: 'recognize'|'apply'|'explain', question}`）。

流程（反馈）：`getFeedbackSkill()` → 注入 `note_content` → 以「复习问题/我的回答」两条 user 消息流式调用（temperature 0.5，maxTokens 2048），异常包装为 `error` chunk。

**SKILL.md 要点**：
- `review-quiz`（version 1.0.0）：复习伴读出题，3-5 个递进问题（识别→应用→解释），问题不透露答案，按画像调整难度分布（low/空→recognize 为主；medium→recognize+apply 均衡；high→explain 为主；标注"可能已掌握"→只出 explain 挑战题或建议跳过，P3-4）。
- `review-feedback`（version 1.0.0）：费曼式反馈，先肯定再指出缺口，用引导性问题让用户自己补齐，不重复基础概念。

## 5. 为什么 V1 不做动态 Skill 选择

所有 Skill 触发点都是固定用户操作路径（点"生成笔记" / 进入分支 / 会话结束），没有"用户自由说话、LLM 自行判断用哪个 skill"的场景，因此直接由代码按路径加载对应 SKILL.md。V2 如需多能力动态路由再引入 manifest 模式。

## 6. 协作链路

```
MainChatPage.handleExtractNote ──► extractNote ──► noteStore.saveNote
BranchChatPage.handleSend ──► branchFollowupStream ──► chatWithTools ──► CLIENT_TOOLS
（会话结束，P3）──► maybeTriggerLearnerUpdate ──► generateProfileUpdate ──► LearnerProfileDialog（DiffView 确认/取消）──► applyProfileDiff + saveLearnerProfile
（复习会话，P2）──► generateReviewQuestions ──► 逐题作答 ──► reviewFollowupStream ──► reviewStore.applyReview
```

## 7. 相关测试

- `src/skills/loader.test.ts`
- `src/api/skills/extract-note.test.ts`、`branch-followup.test.ts`、`update-learner.test.ts`

---

> 上一模块 → [08 LLM API 适配层](./08-llm-api-layer.md)  
> 下一模块 → [10 Embedding 向量引擎](./10-embedding-module.md)
