# 23 · 数据库管理控制台（db:ui）

> 服务端本地开发工具：为 `server/data/zhizhi.db` 提供图形化管理界面，替代手敲 sqlite3 / PowerShell 命令查看数据。

## 定位与边界

- **同进程双服务**：`npm run db:ui` 一次启动两个服务——SQLite 控制台（仅 `127.0.0.1:8790`，`DB_UI_PORT` 可覆盖）+ 主 API（复用 `createApp()`，`PORT ?? 8787`），省去另开终端跑 `npm run dev`；开发便利工具，零生产暴露面。
- **优雅降级**：`JWT_SECRET` 未设置 → 打印警告、仅启动控制台；主 API 端口被占用（如 `npm run dev` 已在运行）→ 警告并跳过，控制台照常可用；控制台端口被占用 → 报错退出（exit 1）。
- 直接用 better-sqlite3 打开同一数据库文件（WAL 模式允许与主服务并发读写）；`DB_PATH` 环境变量可指定其他库文件。
- 纯本地单文件 UI（`DB_UI_HTML` 内嵌于 TS 模板字符串，客户端 JS 全部字符串拼接、不含反引号与 `${`），零外部依赖、完全离线。

## 代码位置

| 文件 | 职责 |
|---|---|
| `server/src/db-ui.ts` | Hono 应用工厂 `createDbUiApp(sqlite)` + 5 个路由 + 主进程守卫（`import.meta.url === pathToFileURL(process.argv[1]).href` 判定，测试导入不会启动服务器） |
| `server/src/db-ui-page.ts` | 内嵌单页 HTML（暗色工业风控制台）：侧栏表列表 / 工具栏 / 可排序表格 / SQL 抽屉 / 单元格与删除确认弹窗 / toast |
| `server/test/db-ui.test.ts` | 19 个用例（临时目录建库 + `CREATE_TABLES` + `app.request()` 直调，delete 用例置于最后保证顺序正确） |
| `server/package.json` | `"db:ui": "tsx src/db-ui.ts"` |

## HTTP API

| 方法与路径 | 作用 | 要点 |
|---|---|---|
| `GET /` | 返回控制台页面 | `c.html(DB_UI_HTML)` |
| `GET /api/meta` | 表清单 + 行数 + dbPath | 表名来自 `sqlite_master` 白名单（排除 `sqlite_%`） |
| `GET /api/tables/:name` | 分页浏览 | `page/size/search/order/dir`；size 夹取 [1,200]（默认 50）；返回 `columns/rows/total/page/pages`，每行附 `rowid AS __rid`（隐藏列，供删除用） |
| `POST /api/tables/:name/delete` | 删行 | body `{rid:number}`；`DELETE ... WHERE rowid = ?`，返回 `{deleted}`（0 表示行已不存在） |
| `POST /api/sql` | SQL 控制台 | 仅允许**单条**语句；`select/pragma/explain/with` 开头走 `.all()`（rows 模式，500 行截断，报错含 "run() instead" 时回退 exec 以兼容写型 CTE），其余走 `.run()`（exec 模式，返回 changes + lastInsertRowid）；错误统一 400 |

## 安全设计（防注入）

- **标识符白名单**：表名查 `sqlite_master`（不存在返回 404），排序列查 `PRAGMA table_info`（非法返回 400）；动态标识符统一经 `quoteIdent()` 双写 `"` 转义。
- **LIKE 转义**：搜索词对 `\` `%` `_` 转义并拼接 `ESCAPE '\'`，杜绝通配符注入。
- **单语句限制**：去掉尾部 `;` 后内部仍含 `;` 即拒绝，防止堆叠语句。
- 错误经 `app.onError` 统一返回 `{error}` JSON（`HttpError` 映射 400/404，其余 500）。

## UI 功能对照

| 功能 | 前端实现（db-ui-page.ts 内 IIFE，无框架） |
|---|---|
| 表切换 / 行数 | `loadMeta` → 侧栏 `.tbl-item`（交错入场动画） |
| 搜索（防抖 300ms）/ 排序 / 分页 | `loadRows` 拼 query；点表头切换升/降序（同列再点反向） |
| 时间戳可读化 | 列名匹配 `/_at$|^expires/` 且值在 epoch 区间（1e12–1e14 视为毫秒、1e9–1e11 视为秒）→ 追加青色日期时间 |
| 单元格详情 / 复制 | 点击弹窗展示完整值 + `navigator.clipboard`（`execCommand` 兜底） |
| 删行 | 行 hover 显示 ✕ → 确认弹窗 → delete 接口 → `loadMeta(true)` 刷新计数 |
| SQL 控制台 | 抽屉 + Ctrl+Enter；rows 模式复用表格渲染，exec 模式显示影响行数与 last_insert_rowid，随后自动刷新表计数 |
| 空库引导 | 侧栏与表格区提示运行 `npm run db:migrate` |

## 使用与验证

- 启动：`cd server && npm run db:ui` → 控制台 http://127.0.0.1:8790 + 主服务自动启动（需 `JWT_SECRET`，如 `[db-ui] 主服务已自动启动: http://localhost:8787`）
- 降级验证：不带 `JWT_SECRET` 启动 → 警告且仅控制台可用；另开 `npm run dev` 后再启动 → 8787 被占用的警告且控制台正常
- 测试：`npm test`（含 `test/db-ui.test.ts` 19 例，全套 58 例）
- 类型：`npm run build`（tsc 严格检查通过）
