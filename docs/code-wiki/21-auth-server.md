# 21 · 登录系统服务端（Auth Server）

> 模块：官方 API 服务端（Phase 1：账号体系）
> 涉及文件：`server/`（独立 Node 包：`src/db/`、`src/services/`、`src/middleware/`、`src/routes/`、`src/app.ts`、`src/index.ts`）
> 依据：`docs/todo/登录系统与服务端实施方案.md`、《账号系统与服务器通信设计调研》、《短信与邮箱验证码实现调研》

## 背景

桌面应用「知枝」目前是纯本地优先：LLM 请求由前端直连各服务商（BYOK）。为了提供**官方 API 分发**（购买套餐、统一下发 `sk-zhizhi-*` Key、按 token 用量计费），需要一套账号体系。本模块为 **Phase 1：仅服务端**——在仓库根新建独立 Node 包 `server/`（独立进程，不干扰 `study-thread/` 构建），交付数据库 schema（全量表）+ 登录系统 API + 单元测试。客户端接入（keyring 存储、auth store、登录 UI）为下一任务。

## 目录结构

```
server/  （仓库根，独立 Node 包，ESM）
  ├─ src/
  │   ├─ index.ts          入口：JWT_SECRET 校验 + @hono/node-server 启动（默认 8787）
  │   ├─ app.ts            Hono app：cors + 路由注册 + 统一错误处理（createApp 支持注入 notifier）
  │   ├─ db/
  │   │   ├─ index.ts      better-sqlite3 + drizzle 连接（createDb(path) / getDb() 单例）
  │   │   ├─ schema.ts     全量表定义（drizzle sqliteTable）
  │   │   ├─ ddl.ts        建表 SQL（CREATE_TABLES）与 plans 种子（SEED_PLANS）
  │   │   └─ migrate.ts    建表脚本（npm run db:migrate，含种子）
  │   ├─ services/
  │   │   ├─ notifier.ts   Notifier 接口 + LogNotifier（MVP）| email/sms 预留分支
  │   │   ├─ verify-code.ts 验证码生成/存储/校验（hash/TTL/一次性/尝试次数/重发冷却/日限额）
  │   │   ├─ jwt.ts        access_token 签发/校验（jose, HS256, 2h）
  │   │   ├─ auth.ts       login/refresh/logout 业务编排（含 api_key 首次签发）
  │   │   └─ api-key.ts    官方 Key 生成（明文一次返回，库存 sha256）
  │   ├─ middleware/
  │   │   ├─ auth.ts       Bearer access_token 校验（/api/me）
  │   │   └─ rate-limit.ts 内存滑动窗口限流（IP / identifier key）
  │   └─ routes/
  │       ├─ auth.ts       POST /api/auth/send-code | login | refresh | logout
  │       └─ me.ts         GET /api/me
  └─ test/                 vitest：verify-code / jwt / rate-limit / auth 集成
```

## 技术栈与运行

| 项 | 选择 |
|---|---|
| 框架 | Hono + @hono/node-server + @hono/zod-validator |
| ORM / 驱动 | drizzle-orm + better-sqlite3（同步驱动，Node ≥ 20） |
| 鉴权 | jose（HS256）：access_token 2h + 不透明 refresh_token 30d（轮换，库存 sha256） |
| 验证码 | 6 位数字、10min TTL、sha256(identifier:code) 存储、一次性消费、错 5 次作废、60s 重发、日 5 条、IP 限频 |
| 类型 | TypeScript ~5.6（`module: NodeNext`，相对导入带 `.js` 后缀），vitest 4 |

常用脚本（`cd server`）：

| 命令 | 说明 |
|---|---|
| `npm run dev` | tsx watch 开发模式 |
| `npm run build` | tsc 类型检查并输出 `dist/` |
| `npm run start` | `node dist/index.js` 生产启动 |
| `npm run db:migrate` | 建表 + plans 种子（`DB_PATH` 可覆盖） |
| `npm test` | vitest 运行全部测试（4 个文件 30 例） |

环境变量（见 `server/.env.example`）：`PORT`（默认 8787）、`JWT_SECRET`（**必填**，缺失启动即退出）、`DB_PATH`（默认 `./data/zhizhi.db`）、`VERIFY_CODE`（`log` 默认，`email`/`sms` 预留）、`NODE_ENV`（production 隐藏内部错误细节）。

## 数据库设计（全量表）

| 表 | 字段要点 | 说明 |
|---|---|---|
| `users` | id(PK), identifier(UNIQUE), plan_id, plan_expires_at, quota_tokens | identifier 为邮箱或手机号，首次登录即注册 |
| `refresh_tokens` | id(PK), user_id, token_hash(UNIQUE), device_id, expires_at, revoked_at | 不透明 token 只存 sha256 |
| `api_keys` | id(PK), user_id, key_hash(UNIQUE), enabled, last_used_at, revoked_at | 官方 Key 明文仅登录/签发时返回一次 |
| `verify_codes` | id(PK), identifier, code_hash, expires_at, attempts, last_sent_at | 不存明文验证码 |
| `verify_send_logs` | id(PK), identifier, created_at | 发送流水，用于日限额统计（create 会删除旧 verify_codes 行，故不能靠 verify_codes 行数计数） |
| `plans` | id(PK), name, price_cents, token_quota, model_group | 种子 3 条（轻量/标准/专业） |
| `orders` | id(PK), order_no(UNIQUE), user_id, plan_id, amount_cents, status | Phase 2 支付预留 |
| `usage_logs` | id(PK), user_id, api_key_id, model, prompt/completion_tokens, cost_cents | Phase 2 用量扣费预留 |

约定：`id` 一律 `crypto.randomUUID()` 文本主键；时间一律 **epoch 毫秒 INTEGER**；表结构从书写起兼容 PostgreSQL（未来 Drizzle 切方言即可）。

## 接口

| 端点 | 请求体 | 响应 |
|---|---|---|
| `POST /api/auth/send-code` | `{ identifier, channel?: 'email'\|'sms' }` | 200 `{ success, cooldown_seconds: 60 }`；429 冷却/限频；400 非法邮箱/手机号 |
| `POST /api/auth/login` | `{ identifier, code, device_id? }` | 200 `{ access_token, refresh_token, user, api_key? }`（首登含 api_key）；401 验证码错误/过期；400 code 非 6 位数字 |
| `POST /api/auth/refresh` | `{ refresh_token }` | 200 新 tokens（**旧 token 立即作废，轮换**）；401 无效/已吊销/过期 |
| `POST /api/auth/logout` | `{ refresh_token }` | 200 `{ success }` |
| `GET /api/me` | Bearer access_token | 200 `{ id, identifier, plan_id, plan_expires_at, quota_tokens, api_key_created, plan }`；401 无/伪 token |

## 安全设计要点

1. **验证码**（`services/verify-code.ts`）：
   - `generateCode()`：`randomInt(0, 1_000_000)` 补齐 6 位；`hashCode(id, code)` = `sha256(identifier + ':' + code)`（防库泄露撞码，比对用 `timingSafeEqual`）。
   - `create()`：删除旧记录 → 插入新记录（10min TTL）→ 写 `verify_send_logs` → 调 notifier。
   - `verify()`：不存在/过期/错满 5 次 → 失败（错满 5 次记录删除防爆破）；成功 → **立即删除记录（一次性消费，防重放）**；失败 → attempts+1。
   - `canSend()`：60s 重发冷却（读 `last_sent_at`）+ 当日发送 ≤ 5 条（数 `verify_send_logs`）。
2. **限流**（`middleware/rate-limit.ts`）：内存滑动窗口；`send-code` 每 identifier 60s/1 次 + 每 IP 10min/5 次；`login` 每 IP 10min/10 次；超限 429（带 `retry_after`）。
3. **JWT**（`services/jwt.ts`）：jose HS256，`{ sub, plan_id }`，2h；`JWT_SECRET` 启动时校验非空。
4. **官方 Key**（`services/api-key.ts`）：`sk-zhizhi-` + 24 字节 base64url；明文**仅在登录/签发时返回一次**，库中只存 sha256。
5. **Refresh 轮换**（`services/auth.ts`）：每次 refresh 先吊销旧记录再签发新 refresh（reuse 检测天然成立）；logout 吊销对应记录。
6. **错误处理**（`app.ts`）：统一 `{ error }` JSON；`NODE_ENV=production` 时隐藏内部错误细节。
7. **验证码通道抽象**（`services/notifier.ts`）：`Notifier.send(to, code, channel)`；MVP 为 `LogNotifier`（`[verify-code]` 日志，冒烟时从日志取码）；`VERIFY_CODE=email|sms` 预留（暂回退 LogNotifier 并告警，后续填 Resend/阿里云，调用方零改动）。

## 测试

| 文件 | 覆盖 |
|---|---|
| `verify-code.test.ts` | 6 位/随机性、hash 不含明文、60s 重发拦截、日限额 5 条、一次性消费（重放拒绝）、错 5 次作废、过期失效、成功后删记录 |
| `jwt.test.ts` | 签发/校验、plan_id 往返、错误 secret 拒绝、过期 token 拒绝 |
| `rate-limit.test.ts` | 窗口内超限、窗口重置放行、key 独立、reset |
| `auth.test.ts` | app 级集成（临时 DB + 注入 fake notifier 捕获验证码）：send-code → login 成功（首登返回 api_key）→ 库中仅存 hash → 错误码 401 → 重放 401 → refresh 轮换（旧 token 失效）→ `/api/me` 401/200 → logout 后 refresh 401 |

运行：`cd server && npm test`。

## 后续任务（Phase 2+，本模块不做）

- 客户端接入：Rust `tauri-plugin-keyring` + `stores/auth.ts` + `api/zhizhi-api.ts`（401 自动刷新）+ OfficialModelPage 真实登录流。
- Phase 2：plans/orders/usage 接口 + 支付；LLM 网关（鉴权 → 额度 → 转发 → 扣费 → 审计）。
- Phase 3：迁 PostgreSQL、Redis 限流。
