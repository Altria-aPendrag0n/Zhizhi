# 17 全局 AI 忙碌遮罩（Busy Overlay）

> 模块编号：17
> 核心文件：`src/stores/busy.ts`、`src/components/common/AiBusyOverlay.vue`、`src/utils/busy-guard.ts`、`src/api/provider-factory.ts`
> 挂载点：`src/App.vue`

## 1. 职责

除「知枝学习会话」的流式聊天外，所有**提交给 AI 后等待输出**的操作（复习出题、笔记摘录/重新提炼、学习者画像更新、连接测试等）在等待期间弹出**全屏遮罩**：

- 屏幕中间显示「AI 正在思考…」弹窗（品牌绿 spinner + 提示文案）；
- 遮罩期间用户**无法进行任何操作**（`cursor: wait` + 禁用全局快捷键），避免反复创建或提交。

流式会话聊天（MainChatPage / BranchChatPage / ReviewChatPage 的 `isStreaming` 状态）**不弹**全局遮罩，由各自的 Composer disabled + 等待提示条承担，以保留流式阅读体验。

## 2. 统一机制（自动适配）

忙碌遮罩**统一由 LLM 调用层驱动**，页面无需关心：

```
非流式 AI 封装函数 / 连接测试
   └─ provider.chat(messages, { ..., busyMessage: 'AI 正在生成复习题…' })
        └─ createProvider 包装：迭代输出期间自动 busyStart() → … → finally busyStop()
             └─ busy-guard 桥接 → useBusyStore（全屏遮罩）
```

- **`ChatOptions.busyMessage`**（`api/llm-provider.ts`）：非流式调用传入此选项即声明"需要全屏忙碌遮罩"。
- **`provider-factory.ts` 的 `withBusyOverlay` 包装**：在实例的 `chat` 方法上包装（不改变 `instanceof`）。传 `busyMessage` 时返回包一层 async generator——首次消费时 `busyStart(msg)`，迭代结束/异常/调用方提前 `break` 都经 `finally` 执行 `busyStop()`（**延迟语义**：只创建不消费则不弹遮罩；**兜底语义**：提前 break 也会关闭）。
- **流式聊天**（`chat-loop`、`stream.ts`、`reviewFollowupStream`、`reviewDebateStream`）不传 `busyMessage` → 原样透传，无遮罩。

### 2.1 桥接层 `utils/busy-guard.ts`

`api/` 层不依赖 Vue/Pinia。桥接层提供：

| 成员 | 说明 |
|------|------|
| `attachBusyController(controller)` | 注册全局控制器（`useBusyStore` 首次实例化时调用） |
| `busyStart(msg?)` / `busyStop()` | 转发到已注册控制器；**未注册时为安全 no-op**（单元测试、App 未挂载时不抛错） |

## 3. 状态层：`stores/busy.ts`

`useBusyStore` 是一个模块级 Pinia store（不持久化）：

| 成员 | 类型 | 说明 |
|------|------|------|
| `active` | `ref<boolean>` | 遮罩是否可见 |
| `message` | `ref<string>` | 遮罩上的提示文案（默认「AI 正在思考…」） |
| `start(msg?)` | `function` | 打开遮罩；**并发计数 +1**，可覆盖提示文案 |
| `stop()` | `function` | 计数 -1；仅当计数归零时关闭遮罩 |

并发计数保证嵌套调用（如多个 AI 请求同时进行）时遮罩不会提前消失：只有所有 `start` 都被配对 `stop` 后才关闭。实例化时自动 `attachBusyController({ start, stop })` 注册为全局控制器。

## 4. UI 组件：`components/common/AiBusyOverlay.vue`

- 使用 `<Teleport to="body">` 挂载到 body；
- `v-if="busy.active"` 全屏 `position: fixed; inset: 0; z-index: 2000`（高于所有对话框 z-index 1100）；
- 背景 `rgba(25,49,43,0.28)` + backdrop blur，`cursor: wait` 阻止交互；
- 卡片：品牌绿 spinner（`--brand-soft` 边框 + `--brand` 顶色旋转）+「AI 正在思考…」+「请稍候，不要重复操作」；
- `role="alertdialog"` + `aria-modal="true"` 无障碍语义。

## 5. 当前接入点

| 文件 | 调用 | busyMessage 文案 |
|------|------|----------|
| `api/skills/extract-note.ts` | `extractNote` 划线提炼笔记 | AI 正在提炼笔记… |
| `api/skills/update-learner.ts` | `generateProfileUpdate` 会话后画像更新 | AI 正在分析学习画像… |
| `api/skills/review-quiz.ts` | `generateReviewQuestions` / `generateClusterQuestions` 复习出题 | AI 正在生成复习题… |
| `views/SettingsPage.vue` | 连接测试（`provider.chat` 流式验证） | AI 正在测试连接… |

> 页面（MainChatPage / NoteDetailPage / BranchChatPage / ReviewChatPage / LearningHubPage）已**不再手动调用** busy store——只要走封装函数或 `createProvider`，遮罩自动生效。

## 6. 为未来新增 AI 调用接入

新开发的非学习会话 AI 调用（无论封装函数还是页面直接调用），只需在调用 `provider.chat` 时传：

```ts
provider.chat(messages, { ..., busyMessage: 'AI 正在处理…' })
```

- 通过 `createProvider()` 创建的 provider 均自动获得遮罩（`anthropic` / `openai-compat` / DeepSeek 特例路由均覆盖）；
- 若封装函数内调用（推荐），在封装函数内传 `busyMessage`，页面无需任何改动；
- **学习会话的流式聊天一律不要传** `busyMessage`。

## 7. 全局快捷键禁用

`App.vue` 的 `handleKeydown` 开头：

```ts
if (busyStore.active) return
```

遮罩期间所有全局快捷键（新建会话、切换项目、返回等）一律忽略，从源头杜绝误操作。

## 8. 测试

- `src/utils/busy-guard.test.ts`：未注册 no-op、注册后转发、重复注册以最后一次为准。
- `src/api/provider-factory.test.ts`：mock 底层 Provider 后验证包装行为——传 `busyMessage` 时迭代期间 `start→stop`、不传时无遮罩、提前 `break` 仍关闭、只创建不消费不弹遮罩；同时保持 `instanceof` 与路由断言不变。
- 组件测试（`App.test.ts`）通过 `vi.mock('../stores/busy')` 提供桩；页面不再使用 busy store 后，相关组件测试不再需要该 mock。
