# 17 全局 AI 忙碌遮罩（Busy Overlay）

> 模块编号：17
> 核心文件：`src/stores/busy.ts`、`src/components/common/AiBusyOverlay.vue`
> 挂载点：`src/App.vue`

## 1. 职责

除「知枝学习会话」的流式聊天外，所有**提交给 AI 后等待输出**的操作（复习出题、笔记摘录/重新提炼、学习者画像更新、连接测试等）在等待期间弹出**全屏遮罩**：

- 屏幕中间显示「AI 正在思考…」弹窗（品牌绿 spinner + 提示文案）；
- 遮罩期间用户**无法进行任何操作**（`cursor: wait` + 禁用全局快捷键），避免反复创建或提交。

流式会话聊天（MainChatPage / BranchChatPage / ReviewChatPage 的 `isStreaming` 状态）**不弹**全局遮罩，由各自的 Composer disabled + 等待提示条承担，以保留流式阅读体验。

## 2. 状态层：`stores/busy.ts`

`useBusyStore` 是一个模块级 Pinia store（不持久化）：

| 成员 | 类型 | 说明 |
|------|------|------|
| `active` | `ref<boolean>` | 遮罩是否可见 |
| `message` | `ref<string>` | 遮罩上的提示文案（默认「AI 正在思考…」） |
| `start(msg?)` | `function` | 打开遮罩；**并发计数 +1**，可覆盖提示文案 |
| `stop()` | `function` | 计数 -1；仅当计数归零时关闭遮罩 |

并发计数保证嵌套调用（如多个 AI 请求同时进行）时遮罩不会提前消失：只有所有 `start` 都被配对 `stop` 后才关闭。

## 3. UI 组件：`components/common/AiBusyOverlay.vue`

- 使用 `<Teleport to="body">` 挂载到 body；
- `v-if="busy.active"` 全屏 `position: fixed; inset: 0; z-index: 2000`（高于所有对话框 z-index 1100）；
- 背景 `rgba(25,49,43,0.28)` + backdrop blur，`cursor: wait` 阻止交互；
- 卡片：品牌绿 spinner（`--brand-soft` 边框 + `--brand` 顶色旋转）+「AI 正在思考…」+「请稍候，不要重复操作」；
- `role="alertdialog"` + `aria-modal="true"` 无障碍语义。

## 4. 接入点

调用方式统一为：

```ts
busyStore.start('AI 正在生成复习题…')
try {
  // ... AI 调用（await）...
} finally {
  busyStore.stop()
}
```

已接入的调用点：

| 文件 | 调用 | 提示文案 |
|------|------|----------|
| `views/LearningHubPage.vue` | 开始复习出题（`generateClusterQuestions` / `generateReviewQuestions`） | AI 正在生成复习题… |
| `views/MainChatPage.vue` | 划线提炼笔记（`extractNote`） | AI 正在提炼笔记… |
| `views/MainChatPage.vue` | 会话结束画像更新（`triggerLearnerUpdate`） | AI 正在分析学习画像… |
| `views/NoteDetailPage.vue` | 笔记详情划线提炼 / 弹窗改标题重新生成 | AI 正在提炼笔记… / AI 正在重新提炼笔记… |
| `views/BranchChatPage.vue` | 分支会话划线提炼 / 弹窗改标题重新生成 | AI 正在提炼笔记… / AI 正在重新提炼笔记… |
| `views/ReviewChatPage.vue` | 复习会话划线提炼 | AI 正在提炼笔记… |
| `views/SettingsPage.vue` | 连接测试（`provider.chat` 流式验证） | AI 正在测试连接… |

## 5. 全局快捷键禁用

`App.vue` 的 `handleKeydown` 开头：

```ts
if (busyStore.active) return
```

遮罩期间所有全局快捷键（新建会话、切换项目、返回等）一律忽略，从源头杜绝误操作。

## 6. 测试

- 三个涉及组件的测试文件（`App.test.ts`、`views/MainChatPage.test.ts`、`views/ReviewChatPage.test.ts`）通过 `vi.mock('../stores/busy')` 提供 `{ active, message, start, stop }` 桩，避免组件挂载时因无活动 Pinia 报错。
