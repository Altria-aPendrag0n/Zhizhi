# API 分发网关实现调研：一个上游 API 分发多个子 Key 的独立控制与统计

> 目标：回答"**我持有一个上游 API（如智谱/DeepSeek 的官方 Key），如何把它通过一个统一入口分发成多个子 API Key 给不同用户/设备使用，且每个子 Key 可独立启停、限额、限速、限模型，并独立统计用量**"。
> 本文聚焦**技术实现**；业务选型（One API vs 自研、上游模型、定价、合规）见 [官方API分发机制调研与开发方案.md](../官方API分发机制调研与开发方案.md)。

---

## 一、问题定义与核心概念

"一个 API 分发给多个 API"本质是**API 网关 + 虚拟密钥（Virtual Key）模式**，业界标准的三层抽象：

```
使用者（用户/设备）
    │  持有 子 Key（sk-zhizhi-xxx）
    ▼
┌─────────── 网关（你的服务端）───────────┐
│  鉴权 → 独立控制（启停/额度/限速/模型）  │
│  → 渠道路由 → 转发 → 计量 → 扣费/统计   │
└─────────────────────────────────────────┘
    │  持有 上游 Key（master key）
    ▼
上游 API（智谱 / DeepSeek / OpenAI / 百炼 …）—— 渠道（Channel）
```

- **渠道（Channel）**：你与上游厂商之间的连接。一个渠道 = { 上游 baseUrl, 上游 Key, 支持的模型列表, 分组, 权重, 状态 }。这就是"我通过的一个 API"，**永远不暴露给使用者**。
- **子 Key（Token / Virtual Key）**：你签发给使用者的凭证。每个子 Key 挂载一套独立的控制策略与独立的用量账本。
- 使用者以 OpenAI 兼容协议请求你的网关，网关替换凭证后转发上游——对使用者而言"这就是他们的 API"。

关键结论：**子 Key 不是上游 Key 的"分片"，而是你自己数据库里的一行记录**。控制与统计全部发生在你的网关内，与上游无关。

---

## 二、业界参照实现

### 2.1 One API（MIT，Go）—— 令牌模型最经典

One API 的 Token（子 Key）数据模型（[令牌系统解析](https://blog.csdn.net/gitblog_00081/article/details/151847934)）：

```go
type Token struct {
    Id             int
    UserId         int      // 归属用户
    Key            string   // 访问凭证（char(48)，库存 hash/明文 key）
    Status         int      // 1启用 2禁用 3过期 4额度用尽
    CreatedTime    int64
    AccessedTime   int64    // 最后使用时间
    ExpiredTime    int64    // -1 = 永不过期
    RemainQuota    int64    // 剩余额度
    UnlimitedQuota bool     // 无限额度
    UsedQuota      int64    // 已用额度
    Models         *string  // 允许访问的模型列表（逗号分隔）
    Subnet         *string  // 允许的 IP 子网（如 192.168.1.0/24）
}
```

对应的 Channel 模型（[渠道管理详解](https://blog.csdn.net/gitblog_00204/article/details/150635759)）：

```go
type Channel struct {
    Type    int     // 渠道类型（OpenAI/Azure/Anthropic/国产…）
    Key     string  // 上游 API Key
    BaseURL *string // 自定义端点
    Models  string  // 支持的模型列表
    Group   string  // 渠道分组
    Weight  *uint   // 负载均衡权重
    Status  int
}
```

设计要点：
1. **子 Key 控制维度**：状态（启停/过期/用尽）+ 额度（Remain/Used/Unlimited）+ 模型白名单 + IP 子网。
2. **额度双维度**：额度可配在用户维度（总池）或令牌维度（单 Key 池），实现[多租户配额隔离](https://wenku.csdn.net/answer/pcgg35z4ype)——"每个租户独立的额度池，用超自动拒绝，不越界"。
3. **渠道路由**：按请求模型筛出可用渠道 → 分组匹配 → 加权负载均衡 → 失败自动重试下一渠道；渠道可设**倍率**（成本加价系数）。

### 2.2 LiteLLM（MIT，Python）—— Virtual Key 语义最完整

LiteLLM Proxy 的 [Virtual Keys](https://docs.litellm.ai/docs/proxy/virtual_keys) 提供（[Virtual Keys 详解](https://mintlify.wiki/BerriAI/litellm/proxy/virtual-keys)）：

```jsonc
// POST /key/generate（用 master key 调用）
{
  "key_name": "production-backend",
  "duration": "90d",                    // 过期时间
  "models": ["gpt-3.5-turbo", "gpt-4"], // 模型白名单
  "max_budget": 100.0,                  // 硬预算（美元）
  "budget_duration": "30d",             // 预算周期性重置
  "soft_budget": 80.0,                  // 软预算（告警阈值）
  "rpm": 100,                           // 每分钟请求数
  "tpm": 100000,                        // 每分钟 token 数
  "max_parallel_requests": 10,          // 并发上限
  "team_id": "team-abc",                // 团队归属
  "metadata": {}                        // 自定义元数据
}
```

- **Spend 自动追踪**：每次调用后 spend 写入数据库（key / user / team 三级账本），通过 `/key/info` 查询（[官方文档](https://docs.litellm.ai/docs/proxy/virtual_keys)）。成本按 `model_prices_and_context_window.json` 单价计算。
- **注意**：LiteLLM 的预算强制依赖数据库（Postgres）；DB-less 部署下预算会"fail open"不拦截（[Budgets 文档](https://docs.litellm.ai/docs/proxy/users)）。印证了**控制策略必须落在自己的持久化存储里**这条原则。

### 2.3 OpenRouter —— 商业形态参照

预充值 Credits、统一 OpenAI 兼容端点、按 token 扣费、模型价格透传（详见[既有调研](../官方API分发机制调研与开发方案.md)§3.1）。它证明该模式的可运营性，技术上是本文模式的商业封装。

### 2.4 小结：任何方案都逃不开这四件事

| 能力 | 实现位置 | 说明 |
|---|---|---|
| 子 Key 签发/验证 | 自有数据库 | 生成 → 哈希存储 → 每次请求查库验证 |
| 独立控制 | 请求管道里的检查链 | 启停、过期、额度、限速、模型白名单、（可选 IP） |
| 统计 | usage 明细表 + 聚合 | 从上游响应提取 usage → 记账 → 聚合查询 |
| 渠道管理 | 渠道表 + 路由策略 | 按模型选渠道、加权、故障转移 |

---

## 三、核心数据模型设计

结合本项目已有 schema（[schema.ts](../../server/src/db/schema.ts)：`api_keys`、`usage_logs`、`plans.model_group`、`users.quota_tokens` 均已预留），推荐的最小模型：

```sql
-- 渠道表（新增）：上游 API
CREATE TABLE channels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,          -- 上游端点
  api_key_enc TEXT NOT NULL,       -- 上游 Key（加密存储，绝不下发）
  models TEXT NOT NULL,            -- 支持的模型，逗号分隔
  group_tag TEXT,                  -- 分组，与 plans.model_group 对应
  weight INTEGER DEFAULT 100,      -- 负载均衡权重
  status INTEGER DEFAULT 1,        -- 1启用 0禁用（可自动熔断）
  created_at INTEGER
);

-- 子 Key 表（扩展现有 api_keys）
ALTER TABLE api_keys ADD COLUMN name TEXT;             -- 备注（发给谁/什么设备）
ALTER TABLE api_keys ADD COLUMN quota_tokens INTEGER DEFAULT 0;   -- 子Key额度（-1无限）
ALTER TABLE api_keys ADD COLUMN used_tokens INTEGER DEFAULT 0;
ALTER TABLE api_keys ADD COLUMN expired_at INTEGER;    -- 过期时间（NULL永久）
ALTER TABLE api_keys ADD COLUMN allowed_models TEXT;   -- 模型白名单（NULL=跟随plan分组）
ALTER TABLE api_keys ADD COLUMN rpm_limit INTEGER;     -- 每分钟请求数限制

-- usage_logs（已有，建议增补）
ALTER TABLE usage_logs ADD COLUMN channel_id TEXT;     -- 命中哪个渠道
ALTER TABLE usage_logs ADD COLUMN status TEXT;         -- success / failed / aborted
ALTER TABLE usage_logs ADD COLUMN latency_ms INTEGER;
CREATE INDEX idx_usage_key_time ON usage_logs(api_key_id, created_at);
CREATE INDEX idx_usage_user_time ON usage_logs(user_id, created_at);
```

要点：
1. **Key 只存哈希**：现有 [api-key.ts](../../server/src/services/api-key.ts) 已是 `generateApiKey()` + SHA-256 `hashKey()`，符合规范。前缀 `sk-zhizhi-` 便于识别与扫描泄露。
2. **额度字段用 token 而非金额**：与现有 `users.quota_tokens`、`plans.token_quota` 一致；金额可在统计层按模型单价换算。
3. **模型控制三层递进**：子 Key 白名单 → 用户 plan 的 `model_group` → 渠道实际支持的模型。请求模型必须同时通过三层。

---

## 四、请求处理链路（网关管道）

新增路由 `POST /v1/chat/completions`（对外 OpenAI 兼容，客户端 `openai-compat` 适配器零改造）：

```
① 提取凭证    Authorization: Bearer sk-zhizhi-xxx
② 鉴权        sha256(key) 查 api_keys → 拿到 key 行 + 所属 user
              （现有 middleware/auth.ts 扩展出 apiKeyAuth 中间件）
③ 独立控制链（任一失败即短路返回，各控制点互相独立、可单独开关）
   ├─ enabled=1？ revoked_at IS NULL？        → 否: 401/403
   ├─ expired_at 未过期？                      → 否: 403 token_expired
   ├─ 请求 model 在 allowed_models / plan分组？→ 否: 403 model_not_allowed
   ├─ 限速：rateLimiter.check(keyId)（复用 middleware/rate-limit.ts，把 ipKeyOf 换成 keyId）
   │                                          → 超限: 429 + Retry-After
   └─ 剩余额度 > 0？（user.quota_tokens 或 key.quota_tokens）→ 否: 402/429 quota_exhausted
④ 渠道路由    按 model 找 channels(status=1 ∧ models∋model ∧ group 匹配)
              → 加权随机选一个；失败换下一个（重试 1~2 次）
⑤ 转发上游    替换 Authorization 为上游 Key；注入 stream_options.include_usage
⑥ 透传响应    非流式：整包回传；流式：SSE 逐 chunk 透传
⑦ 计量记账    从响应提取 usage → 写 usage_logs → 原子扣减额度 → 更新 last_used_at
⑧ 统计查询    管理端/用户端按 api_key_id / user_id / model / 天 聚合
```

每一步都是独立中间件，Hono 的中间件管道天然适合（现有 [app.ts](../../server/src/app.ts) 已用 `app.use`/`app.route` 组织）。

---

## 五、"独立控制"的具体实现

### 5.1 控制点清单与实现方式

| 控制点 | 实现 | 失败响应 |
|---|---|---|
| 启用/禁用/吊销 | `api_keys.enabled` / `revoked_at`，管理端 UPDATE 即生效（无缓存或短 TTL 缓存） | 401/403 |
| 过期时间 | `expired_at` 与当前时间比较 | 403 |
| 模型白名单 | 请求体 `model` 字段 ∩ `allowed_models` | 403 |
| 限速（RPM） | 复用 [rate-limit.ts](../../server/src/middleware/rate-limit.ts) 的滑动窗口，key 用 `keyId` 而非 IP | 429 + `Retry-After` |
| Token 限速（TPM） | 窗口内累加 usage tokens（内存 Map 或 SQLite），超限拒绝 | 429 |
| 并发上限 | 每子 Key 计数器（进请求 +1，出 finally -1） | 429 |
| 额度 | 请求前查余量（粗检），请求后精确扣减（§六） | 402/429 |
| IP 白名单（可选） | One API 的 Subnet 思路，`getConnInfo` 比对 CIDR | 403 |

**设计原则：控制策略存在数据库、每次请求现读**。LiteLLM DB-less 下预算失效的教训（§2.2）说明不能把控制状态只放内存；本项目单机 SQLite 直接查行即可，量级完全够（一次主键查询 < 1ms）。若要优化，可加 30~60s 的进程内缓存，但"禁用"类操作要求立即生效的，禁用时可主动清缓存。

### 5.2 管理端路由（给谁发、随时管）

```
POST   /api/keys              签发子 Key（返回明文，仅此一次）
GET    /api/keys              列出我的子 Key（含用量/余量）
PATCH  /api/keys/:id          改名/改白名单/改限速/续期
DELETE /api/keys/:id          吊销（revoked_at = now）
GET    /api/keys/:id/usage    该子 Key 的用量统计
```

复用现有 JWT 用户鉴权（[auth.ts](../../server/src/middleware/auth.ts)）保护这些管理路由；子 Key 只用于 `/v1/*` 推理路由。**两套凭证体系分离**：JWT 管"人"，子 Key 管"调用"。

---

## 六、统计与计量实现

### 6.1 用量从哪里来：上游响应的 usage 字段

**非流式**：响应 JSON 自带
```json
{ "usage": { "prompt_tokens": 36, "completion_tokens": 298, "total_tokens": 334 } }
```

**流式**：默认不返回 usage。OpenAI 协议要求请求体加：
```json
{ "stream": true, "stream_options": { "include_usage": true } }
```
启用后**最后一个 chunk** 会多出一个带 `usage` 的特殊 chunk（其 `choices` 为空数组 `[]`），需从该 chunk 提取计量数据后继续透传（[OpenAI 官方流式文档](https://developers.openai.com/cookbook/examples/how_to_stream_completions.md)、[include_usage 行为讨论](https://github.com/567-labs/instructor/discussions/1769)）。常见踩坑：代理在逐 chunk 转发时把最后的 usage chunk 丢弃，导致**所有流式调用统计为 0**（[实际案例](https://github.com/imzodev/openaidy/issues/402)）——实现时必须在流转发循环里显式检查 `chunk.usage`。

Anthropic 协议则在 `message_delta` 事件里携带 `usage.input_tokens / output_tokens`，思路一致。

**上游不返回 usage 时**（部分国产兼容端点不支持 `stream_options`）：降级为本地估算——prompt 按 `字符数/1.6` 近似、completion 按输出字符数近似，并在 usage_logs 标记 `estimated=1`，便于对账时甄别。

### 6.2 记账与扣费（并发安全）

```sql
-- 1) 明细入账（每请求一行）
INSERT INTO usage_logs (id, user_id, api_key_id, channel_id, model,
  prompt_tokens, completion_tokens, cost_cents, status, latency_ms, created_at)
VALUES (...);

-- 2) 原子扣减（SQLite 单条 UPDATE 自带行锁语义，余量不足则 WHERE 不命中）
UPDATE users SET quota_tokens = quota_tokens - :used
  WHERE id = :userId AND quota_tokens >= :used;
UPDATE api_keys SET used_tokens = used_tokens + :used
  WHERE id = :keyId AND (quota_tokens < 0 OR quota_tokens - :used >= 0);

-- 3) 顺带更新 last_used_at
```

- **先记账后扣减、同事务**：SQLite（better-sqlite3）单写者模型下事务天然串行，无需 Redis/分布式锁。
- **流式客户端中途断开**：上游已产生 token，必须照常计量——流转发用 `try/finally` 保证 finally 里记账；status 记 `aborted`。
- **渠道重试**：故障转移时只对最终成功的渠道记一次账，避免重试放大计费。
- **成本换算**：`cost_cents = f(模型单价, prompt/completion tokens)`，模型单价表可放 `plans` 同级的 `model_prices` 表； LiteLLM 的做法是维护全局 `model_prices_and_context_window.json`，起步阶段手写一张静态表即可。

### 6.3 统计聚合（"统计"怎么呈现）

- **明细即真相**：`usage_logs` 按行存，永不删改。
- **聚合靠索引查询**，起步阶段无需预聚合表：
  ```sql
  -- 某子 Key 近 30 天每日用量
  SELECT date(created_at,'unixepoch','localtime') AS day,
         SUM(prompt_tokens), SUM(completion_tokens), COUNT(*), SUM(cost_cents)
  FROM usage_logs
  WHERE api_key_id = ? AND created_at > ?
  GROUP BY day ORDER BY day;
  ```
  依赖 `idx_usage_key_time(api_key_id, created_at)` 索引，百万行内毫秒级。
- **日汇总表（量起来后再加）**：定时任务每日把前一日明细 rollup 进 `usage_daily(key_id, day, ...)`，看板读汇总表。One API/LiteLLM 的看板本质都是这两层。
- **呈现维度**：按子 Key（发给谁的用了多少）、按模型（哪个模型烧钱）、按天（趋势）。管理端看全部用户，用户端只看自己。

---

## 七、渠道层：多上游与高可用（可后置）

- MVP 只需**一个渠道一行记录**：请求转发到 `base_url` + 上游 Key，模型一对一。
- 进阶再支持多渠道：按模型筛渠道 → 加权随机 → 失败自动切换（One API 的路由策略，§2.1）。
- 上游 Key 的存放：环境变量或数据库加密存储（AES-GCM + 主密钥在环境变量），**任何 API 都不回传上游 Key**。
- 渠道健康：连续 N 次上游 5xx/超时 → 自动 `status=0` 熔断 + 通知（现有 [notifier.ts](../../server/src/services/notifier.ts) 可复用）。

---

## 八、方案对比与选型建议

| 维度 | One API（MIT） | New API（AGPLv3） | LiteLLM（MIT） | **自研网关（推荐）** |
|---|---|---|---|---|
| 形态 | Go 单二进制/Docker | Go，One API 二开 | Python Proxy + Postgres | 现有 Hono+Drizzle+SQLite 服务端内加路由 |
| 子 Key 控制 | 额度/过期/模型/IP/启停 | 同左 + 分组/支付/看板 | budget/rpm/tpm/模型/过期/并发（最全） | 完全自定义，按需实现 |
| 统计 | 日志表 + Web 看板 | 更全 | per-key/user/team spend | 自建 usage_logs（schema 已预留） |
| 部署 | 独立进程 | 独立进程 | 独立进程 + Postgres | **零新增部署**，与认证/用户/订单同库同进程 |
| 客户端接入 | OpenAI 兼容 ✅ | OpenAI 兼容 ✅ | OpenAI 兼容 ✅ | OpenAI 兼容 ✅ |
| 与知枝整合 | 用户体系割裂，需同步额度 | 同左 | 需 Postgres，栈不符 | 复用 users/plans/orders/api_keys，一处闭环 |
| 成本 | 低 | 中（协议义务） | 中 | 一次性开发量约 2~4 天 MVP |

**建议**：本项目已有 80% 的地基（[schema.ts](../../server/src/db/schema.ts) 的 `api_keys/usage_logs/plans/orders`、[rate-limit.ts](../../server/src/middleware/rate-limit.ts)、[api-key.ts](../../server/src/services/api-key.ts)、JWT 体系、用户/订单表），**自研是最优解**——One API 更适合"从零起步、只要中转站"的场景。若追求极速上线验证商业链路，可用 Docker 跑一个 One API 先行，客户端 Phase 0 预设不受影响（对客户端都是 OpenAI 兼容端点），后续平滑切自研。

---

## 九、知枝项目落地路线（增量、可分期）

| 阶段 | 内容 | 涉及 |
|---|---|---|
| M1 子 Key 生命周期 | `api_keys` 加列（name/quota/expired/allowed_models/rpm）+ 签发/列表/吊销管理路由 + 测试 | server/routes、db/migrate |
| M2 网关路由 | `/v1/chat/completions`：apiKeyAuth 中间件（控制链①②③）+ channels 表 + 单渠道转发（非流式先行） | server/src 新模块 gateway |
| M3 流式 + 计量 | SSE 透传 + `include_usage` 注入与末 chunk 提取 + usage_logs 记账 + 原子扣减 | gateway + db |
| M4 统计接口 | `/api/keys/:id/usage` 按天/模型聚合 + 设置页"官方 API"面板展示余量与用量 | server + study-thread 设置页 |
| M5 运营增强 | 多渠道路由/熔断、TPM 限速、TPM/并发控制、日汇总表、成本换算 | 按需 |

> 客户端侧：Phase 0（[既有调研](../官方API分发机制调研与开发方案.md)§六）的"知枝官方 API"预设与本网关天然兼容——baseUrl 指向网关、填子 Key，`openai-compat` 适配器不改协议。

---

## 十、风险与坑位清单

1. **流式 usage 丢失**：转发循环必须检查末 chunk 的 `usage`；上游不支持 `stream_options` 时走估算并打标。
2. **统计为 0 的静默故障**：建议对"成功请求但 usage 全 0"打告警日志。
3. **客户端断连仍要计费**：`finally` 记账；防滥用可要求"预扣 + 完成多退少补"（One API 做法）。
4. **重试重复计费**：渠道 failover 只记最终渠道一次。
5. **SQLite 写并发**：单进程 fine；若未来多实例部署，需换 Postgres + Redis 限速（当前规模不必）。
6. **Key 泄露**：前缀可辨识 + 控制台一键吊销 + `last_used_at`/IP 异常提示；泄露影响面被限制在单个子 Key 的额度内（这正是子 Key 模式的安全价值）。
7. **usage_logs 膨胀**：按月归档/清理，或尽早建日汇总表。
8. **合规**（引用既有调研结论）：官方 Key 仅限知枝应用内使用、不做通用中转站；对外暴露的 OpenAI 兼容端点仅服务自家客户端。

---

## 十一、参考资料

- [One API 项目主页（令牌/渠道/额度/兑换码）](https://github.com/songquanpeng/one-api)
- [One API 令牌系统：精细化权限控制与额度管理](https://blog.csdn.net/gitblog_00081/article/details/151847934)
- [One-API 渠道管理与令牌系统详解](https://blog.csdn.net/gitblog_00204/article/details/150635759)
- [OneAPI 多租户配额隔离](https://wenku.csdn.net/answer/pcgg35z4ype)
- [LiteLLM Virtual Keys 官方文档](https://docs.litellm.ai/docs/proxy/virtual_keys) / [Budgets & Rate Limits](https://docs.litellm.ai/docs/proxy/users)
- [OpenAI 流式补全与 usage 统计官方示例](https://developers.openai.com/cookbook/examples/how_to_stream_completions.md)
- [流式 usage chunk 丢弃的实际踩坑案例](https://github.com/imzodev/openaidy/issues/402)
- [stream_options.include_usage 行为讨论](https://github.com/567-labs/instructor/discussions/1769)
- 既有调研：[官方API分发机制调研与开发方案.md](../官方API分发机制调研与开发方案.md)（业务选型/上游模型/合规/定价）
