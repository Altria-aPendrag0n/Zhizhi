# 18 · 调试日志系统

> 模块覆盖：统一运行时日志（console + localStorage 环形缓冲）与设置页「调试日志」查看面板。
> 相关代码：`study-thread/src/utils/logger.ts`、`study-thread/src/views/SettingsPage.vue`（调试日志区块）。

---

## 1. 模块职责

- **统一日志**：`info` / `warn` / `error` 三级，带时间戳与来源模块，替代散落的 `console.*` 调用。
- **持久化缓冲**：日志写入 `localStorage` 环形缓冲（保留最近 300 条），应用内可直接回看，不依赖 DevTools。
- **排查支持**：LLM 出题解析失败等关键错误把完整上下文（如 LLM 原始响应）写入日志，设置页可直接查看/清空。
- **低侵入**：日志读写异常一律静默忽略，不阻塞主流程；纯前端实现、无外部依赖、可单测。

## 2. 数据模型与存储

```ts
interface LogEntry {
  at: string        // ISO 时间戳
  level: 'info' | 'warn' | 'error'
  module: string    // 来源模块，如 review-quiz / extract-note
  message: string
  meta?: string     // 附加结构化信息（JSON 字符串），可为空
}
```

存储：`localStorage['study-thread-logs']`，环形缓冲上限 `MAX_LOGS = 300` 条。

## 3. API（`src/utils/logger.ts`）

| 函数 | 说明 |
|------|------|
| `logInfo(module, message, meta?)` | 记录 info 日志 |
| `logWarn(module, message, meta?)` | 记录 warn 日志 |
| `logError(module, message, meta?)` | 记录 error 日志（meta 建议传入完整上下文） |
| `getLogs()` | 读取最近日志（按时间正序） |
| `clearLogs()` | 清空全部日志 |

每次写入同时输出到 console（`[zhizhi:<module>]` 前缀），开发者可直接在 DevTools 查看，前端界面可在设置页回看。

## 4. 设置页调试日志面板（`SettingsPage.vue`）

- 设置页底部「调试日志」区块：展示最近日志（时间 / 模块 / 消息 / meta），error 红 / warn 琥珀 / info 灰左边条区分级别。
- 「清空」按钮调用 `clearLogs()` 并刷新列表。
- `onMounted` 时 `loadLogs()` 读取一次；V1 不做实时订阅，查看新日志需重新进入设置页。

## 5. 接入示例（出题解析失败）

`src/api/skills/review-quiz.ts` 的 `parseQuizResponseText`：

- 整体 JSON 解析失败且逐题提取也失败时：`logError('review-quiz', '复习出题失败: 无法解析 LLM 响应为 JSON', { response, extracted })`——完整响应写入日志，界面错误提示注明"完整响应见设置页「调试日志」"。
- 降级成功（响应被截断但存在完整题目）：`logWarn('review-quiz', 'LLM 出题响应 JSON 不完整，已降级保留可解析题目', { recovered, responseLength, snippet })`。

## 6. 测试

`src/utils/logger.test.ts`（4 用例）：三级日志写入（时间戳 / 模块 / meta）、环形截断（只保留最近 `MAX_LOGS` 条）、清空、存储损坏容错（返回空数组并恢复写入）。

---

> 上一模块 → [17 全局 AI 忙碌遮罩](./17-busy-overlay.md)
