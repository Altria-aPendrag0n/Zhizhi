# 16 · 主界面与学习统计模块

> 本文档对应 `docs/code-wiki/README.md` 模块索引中的 **16 主界面与学习统计**。
> 负责：左上角知枝按钮跳转的主界面（`/home`）数据总览，以及"问答 / 复习 / 笔记"按天的学习频率聚合与 GitHub 风格格子图。

## 1. 模块职责

主界面是应用的入口总览页：展示累计学习数据（问答 / 复习 / 笔记次数、学习天数、连续学习天数），
并用 GitHub 提交格样式的**学习频率格子图**直观呈现"每天学了多少"。

| 能力 | 说明 |
|------|------|
| 主界面路由 | `/home`（`HomePage.vue`），知枝按钮（`ProjectRail` 品牌位）直达 |
| 学习统计 | `learning-stats.ts`：从 vault 聚合三种学习行为 → 按天计数 |
| 频率格子图 | `ContributionGraph.vue`：53 周 × 7 天绿色分层，hover 显示当日明细 |

## 2. 统计口径（三种学习行为）

| 行为 | 日期来源 | 说明 |
|------|----------|------|
| 问答（qa） | 学习/分支会话文件中的用户消息 | 消息头 `## 用户 · <ISO>` 带时间戳 → 精确到当天；存量文件无时间戳 → 按 frontmatter `created` 近似。**复习会话 `review-*.md` 不计入问答** |
| 复习（review） | `.study-thread/review-state.json` | 队列 `queue[].history[].at`，每次评级记一次复习 |
| 笔记（note） | `notes/*.md` frontmatter `created` | 每篇笔记记一次（当日新增） |

要点：

- **消息级时间戳**由聊天页发送用户消息时写入（`MainChatPage` / `BranchChatPage` / `ReviewChatPage`
  的 `messages.push` 与 `sessionStore.addMessage`），`session-serializer.ts` 持久化为 `## 用户 · <timestamp>`；
  `branch-context.ts` 的 `parseMessages` 前缀匹配兼容该格式。
- **时间键**一律使用本地时区 `YYYY-MM-DD`（`toDateKey`），避免 `toISOString` 的 UTC 偏移造成日期错位。

## 3. 关键文件

| 文件 | 职责 |
|------|------|
| `src/utils/learning-stats.ts` | 纯函数（日期键/提取/聚合/汇总）+ vault 聚合入口 `collectLearningStats` |
| `src/components/stats/ContributionGraph.vue` | 贡献格子图组件（props: `daily: Record<dateKey, DailyCounts>`、`weekCount`） |
| `src/views/HomePage.vue` | 主界面编排：统计卡 + 格子图 + 快速入口 + 空态引导 |
| `src/router/index.ts` | `/home` 路由 |
| `src/components/shell/ProjectRail.vue` | 知枝按钮 `emit('brand')` |
| `src/App.vue` | `@brand` → `push('/home')`；路由联动（隐藏会话栏/面包屑/菜单） |

## 4. 数据流

```
用户点击知枝按钮 → ProjectRail emit brand → App.vue push('/home')
  → HomePage onMounted
      1. vaultPath 为空 → 空态引导（去设置打开 Vault）
      2. noteStore.loadAllNotes（复用元数据，避免重复扫目录）
      3. collectLearningStats(vaultPath, noteMetas)
           ├─ collectSessionQaDates  → sessions/*.md（排除 review-*）逐条用户消息日期
           ├─ collectReviewDates     → review-state.json 评级 history
           └─ extractNoteDates       → 笔记 created（或扫描 notes/ 目录）
         → aggregateDailyCounts → summarizeStats（total / streak）
  → 渲染统计卡 + ContributionGraph（daily 转 plain object）
```

## 5. 统计聚合函数一览

- `toDateKey(date)` / `parseDateKey(value)`：本地时区日期键转换与解析
- `extractUserMessageDates(body, fallbackDate?)`：解析会话正文的用户消息日期
- `extractSessionQaDates(content)`：完整会话文件（frontmatter + 正文）提取
- `extractReviewDates(state)`：review-state.json 评级日期
- `extractNoteDates(notes)`：笔记 created 日期
- `aggregateDailyCounts({qa, review, note})`：三类日期合并为按天计数表
- `summarizeStats(daily, now?)`：总数 / 学习天数 / 连续学习天数（今天未学从昨天起算）
- `collectLearningStats(vaultPath, noteMetas?)`：vault 聚合入口

## 6. 格子图约定

- 默认「当月」视图：只渲染当月 1 号 ~ 月末的格子（当月跨过几周即几列），右侧可切换「全年」（53 周，今天所在周居右）。
- 周一在列顶、周日列底；`row = (getDay() + 6) % 7`。
- 每天一个格子，颜色分 5 档（`--cg-empty` + `--cg-l1..l4` 绿色递增）。
- 分档按**当日最大总次数**动态均分到 1..4 档（单日记录为 1 时全部 lvl1），避免固定阈值失真。
- **对齐**：星期标签（周一/周三/周五）与格子处于同一行容器、共用相同 `grid-template-rows`；月份标签行左侧用与星期列同宽的占位列占位，文字左边缘与对应列对齐；月份行与格子行放在同一横向滚动容器内，窄窗口滚动时标签不偏移。
- hover 显示悬浮卡：日期 + 问答/复习/笔记明细（`role="img"` + `aria-label` 兜底）。

## 7. 相关测试

- `src/utils/learning-stats.test.ts`：日期键、消息日期提取（带/无时间戳、fallback、误匹配防护）、
  review 解析、聚合、汇总（streak 边界）、vault 聚合（mock vault-fs，排除 review-*）
- `src/components/stats/ContributionGraph.test.ts`：格子数量、层级、hover 明细、自定义周数
- `src/views/HomePage.test.ts`：空态引导、统计渲染、开始新会话回调、加载失败容错
- `MainChatPage.test.ts` 断言用户消息携带时间戳（时间戳注入的回归保护）

## 8. 注意事项

- 统计为**每次进入主界面实时扫描**（会话/笔记文件规模通常小，单次聚合成本可接受），未建缓存；
  若未来 vault 规模增大可考虑 `.study-thread` 下缓存 + 变更事件失效。
- 复习会话文件（`review-*`）不计入问答，避免"复习中的回答"与"复习评级"重复计数。
- 存量会话无消息级时间戳，按会话 `created` 近似归属，属已知口径妥协；新会话自动带时间戳后逐步精确。
