# 23 · 综合管理控制台（db:ui）

> 服务端本地管理工具：**数据库管理 + API 分发运营**一体化的图形控制台。`npm run db:ui` 一次启动控制台与主 API，运营者无需手敲 SQL 即可完成渠道配置、发额度、管 Key、看用量。

## 定位与边界

- **同进程双服务**：控制台（仅 `127.0.0.1:8790`，`DB_UI_PORT` 可覆盖）+ 主 API（复用 `createApp()`，`PORT ?? 8787`）。
- **优雅降级**：`JWT_SECRET` 未设置 → 仅控制台可用；主 API 端口被占用 → 警告跳过；控制台端口被占用 → 报错退出。
- **本地信任边界**：所有管理端点不做鉴权，安全前提是仅监听回环地址——**严禁将 8790 端口暴露到公网**。
- 直接用 better-sqlite3 打开同一数据库文件（WAL 允许与主服务并发）；`DB_PATH` 可指定库文件。
- 纯本地单文件 UI（`DB_UI_HTML` 内嵌 TS 模板字符串，页面 JS 全部字符串拼接、不含反引号与 `${`），零依赖、完全离线。

## 代码位置

| 文件 | 职责 |
|---|---|
| `server/src/db-ui.ts` | `createDbUiApp(sqlite)`：数据库管理 5 路由 + 挂载 `registerAdminRoutes` + 主进程守卫 |
| `server/src/db-ui-admin.ts` | 运营端点：渠道 CRUD/测试、用户/子 Key 管理、总览统计；`HttpError`、`likeEscape`、`maskSecret` 定义于此（供 db-ui.ts 复用，避免循环依赖） |
| `server/src/db-ui-page.ts` | 内嵌单页（暗色工业风）：五视图（总览/渠道/用户/子 Key/数据库）+ 全局 SQL 抽屉 + 表单/确认弹窗 + toast |
| `server/test/db-ui.test.ts` | 数据库管理 19 例 |
| `server/test/db-ui-admin.test.ts` | 运营端点 20 例（CRUD/掩码/加密/连通性/统计） |
| `server/package.json` | `"db:ui": "tsx src/db-ui.ts"` |

## 五个视图

| 视图 | 数据源 | 能做什么 |
|---|---|---|
| **总览** | `GET /api/admin/overview?days=7/14/30` | 卡片（今日/窗口期 请求·Token·成本、用户数、启用子 Key、启用渠道、用户剩余额度）+ 每日用量趋势 + 质量指标（estimated/aborted 计数）+ 模型 Top / 用户 Top |
| **渠道管理** | `/api/admin/channels` CRUD + `POST /:id/test` | 新建/编辑（名称、Base URL、上游 Key、模型列表、分组、权重、启停）、**连通性测试**（请求 `{base_url}/v1/models`，10s 超时，回显状态与预览）、删除 |
| **用户** | `/api/admin/users?search=` + `POST /:id/quota` | 搜索、查看套餐/剩余额度/累计消耗/活跃 Key 数；**发额度**（delta 增减或 set 直设）；一键跳转子 Key 视图 |
| **子 Key** | `/api/admin/keys?search=&status=` + `PATCH/DELETE /:id` | 搜索/状态筛选（启用中/已禁用/已吊销）、编辑备注/独立额度/模型白名单/RPM/过期时间、启停、吊销 |
| **数据库** | `/api/meta`、`/api/tables/:name`、`POST .../delete` | 原有功能：表浏览/搜索/排序/分页/删行（见下文 API 与安全设计） |

SQL 控制台为全局抽屉（数据库视图工具栏打开）：单条语句，`SELECT/PRAGMA/EXPLAIN/WITH` 返回结果集（500 行截断），其余语句返回影响行数。

## 运营端点清单（/api/admin/*）

| 方法与路径 | 作用 | 要点 |
|---|---|---|
| `GET /api/admin/channels` | 渠道列表 | 上游 Key 仅返回掩码 `key_masked`（前 6 + •••• + 后 4），另有 `has_key` / `key_is_encrypted`；**永不回传完整 Key 或密文** |
| `POST /api/admin/channels` | 新建 | `name/base_url` 必填（base_url 校验 http(s) 前缀并去尾斜杠）；`api_key` 提供时经 `encryptSecret` 落库（`CHANNEL_ENC_KEY` 未设置则原样存储） |
| `PATCH /api/admin/channels/:id` | 更新 | 字段级更新；`api_key` 留空则不修改 |
| `DELETE /api/admin/channels/:id` | 删除 | 硬删除；历史 usage_logs 的 channel_id 保留 |
| `POST /api/admin/channels/:id/test` | 连通性测试 | 解密 Key 请求上游 `/v1/models`；无 Key 400、解密失败 400；网络错误/超时返回 `ok:false` |
| `GET /api/admin/keys` | 子 Key 列表 | 联表 users（username/identifier）；`search`（key_preview/name/用户名/邮箱）+ `userId` + `status=active/disabled/revoked`；上限 500 |
| `PATCH /api/admin/keys/:id` | 调整子 Key | `name/enabled`；`quota_tokens/rpm_limit/expired_at` 数字或 null（清空）；`allowed_models` 字符串或 null；`enabled` 仅允许 0/1 |
| `DELETE /api/admin/keys/:id` | 吊销 | `revoked_at=now, enabled=0`（幂等） |
| `GET /api/admin/users` | 用户列表 | 联表 plans（套餐名/分组）+ 子查询（活跃 Key 数、累计消耗）；`search` 按用户名/邮箱 |
| `POST /api/admin/users/:id/quota` | 发额度 | `{delta}` 整数增减 或 `{set}` 非负直设（set 优先） |
| `GET /api/admin/overview` | 总览 | `days` 夹取 [1,90] 默认 7；今日按本地零点切分；窗口期含 daily/top_models/top_users/quality（estimated、aborted 计数） |

## 数据库管理 API（原有）

| 方法与路径 | 作用 | 要点 |
|---|---|---|
| `GET /api/meta` | 表清单 + 行数 + dbPath | `sqlite_master` 白名单（排除 `sqlite_%`） |
| `GET /api/tables/:name` | 分页浏览 | `page/size/search/order/dir`；size ∈ [1,200]；行附 `rowid AS __rid` |
| `POST /api/tables/:name/delete` | 删行 | `{rid:number}`，按 rowid 删除 |
| `POST /api/sql` | SQL 控制台 | 单条语句；查询模式 500 行截断；写模式返回 changes + lastInsertRowid |

## 安全设计

- **边界**：仅 127.0.0.1 + 无鉴权 = 本地信任；上游 Key 掩码展示（`maskSecret`），即使页面被截屏也不泄露完整 Key。
- **加密落库**：设置 `CHANNEL_ENC_KEY` 后，控制台写入的渠道 Key 一律 AES-256-GCM 加密（`enc:v1:` 前缀）；密钥丢失时掩码显示"解密失败"提示而非报错崩溃。
- **防注入**：标识符白名单（表名查 `sqlite_master`、排序列查 `PRAGMA table_info`）+ `quoteIdent` 双写转义；LIKE 对 `\ % _` 转义；SQL 控制台单语句限制。管理端点全部参数化查询。
- **错误统一**：`app.onError` 返回 `{error}` JSON（`HttpError` → 400/404，其余 500）。

## 使用与验证

- 启动：`cd server && npm run db:ui` → http://127.0.0.1:8790（主服务自动启动需 `JWT_SECRET`）
- 典型运营流程：
  1. **渠道** → 新建渠道（填 Base URL + 上游 Key）→ 点「测试」确认连通；
  2. **用户** → 找到用户 → 「发额度」（如 delta 1000000 = 100 万 Token）；
  3. **总览** → 观察请求量/成本/估算占比，异常时到「子 Key」吊销泄露 Key。
- 测试：`npm test`（`db-ui.test.ts` 19 例 + `db-ui-admin.test.ts` 20 例，全套 125 例）；类型 `npm run build`。
