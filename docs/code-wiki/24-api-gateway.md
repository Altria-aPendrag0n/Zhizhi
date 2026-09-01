# 24. API 分发网关（服务端）

> 模块位置：`server/src/middleware/api-key-auth.ts`、`server/src/routes/gateway.ts`、`server/src/routes/keys.ts`、`server/src/routes/usage.ts`、`server/src/services/{channel,model-prices,secret-box,usage}.ts`
> 目标：把上游厂商 API（渠道）通过一个 OpenAI 兼容端点分发为多个子 Key，对每个子 Key **独立控制**（启停/过期/额度/模型白名单/限速）并**独立统计用量**。设计依据见 [docs/research/API分发网关实现调研-子Key独立控制与统计.md](../research/API分发网关实现调研-子Key独立控制与统计.md) 与 [docs/官方API分发机制调研与开发方案.md](../官方API分发机制调研与开发方案.md)，参考实现为 one-api 的 Token/Channel 模型。

---

## 1. 三层模型

```
使用者（知枝客户端 / 未来第三方设备）
    │  子 Key：sk-zhizhi-<32字节随机>（api_keys 表，只存 SHA-256 哈希）
    ▼
网关（本服务端 /v1/chat/completions）
    │  渠道 Key：上游厂商 Key（channels 表，AES-256-GCM 可选加密，永不下发）
    ▼
上游渠道（智谱 / DeepSeek / …）
```

- **子 Key 不是上游 Key 的分片**：它是自己数据库里的一行记录，控制与统计全部发生在网关内。
- 一用户可持多把子 Key，按 `purpose` 区分用途：`chat`（会话大模型）/ `vision`（图片转笔记），后续可扩展新用途；注册时自动签发 `chat` Key（`services/auth.ts#issueApiKeyIfMissing`，明文仅注册响应返回一次）。

## 2. 数据模型

| 表 | 关键列 | 说明 |
|---|---|---|
| `api_keys`（M1 扩展） | `purpose`、`quota_tokens`（-1=跟随用户池）、`used_tokens`、`expired_at`、`allowed_models`、`rpm_limit`、`key_preview`、`enabled`/`revoked_at` | 子 Key 本体与控制策略 |
| `channels`（新增） | `base_url`（不含 `/v1`，网关拼接 `/v1/chat/completions`，与客户端 openai-compat 预设同约定）、`api_key_enc`、`models`（逗号分隔，支持 `*` 通配）、`group_tag`（`*`=全分组）、`weight`、`status` | 上游渠道 |
| `usage_logs`（M3 扩展） | `channel_id`、`status`（success/aborted）、`latency_ms`、`estimated`（1=字符估算）+ 索引 `idx_usage_key_time` / `idx_usage_user_time` | 计量明细，只增不改 |

旧库迁移：`db/migrate.ts` 中 `ensureApiKeyColumns` / `ensureUsageLogColumns` 幂等 `ALTER TABLE`；`channels` 表与智谱/DeepSeek 渠道种子（Key 留空）由 `SEED_CHANNELS` `INSERT OR IGNORE`。

## 3. 请求链路（POST /v1/chat/completions）

```
① IP 全局限流（60/min，防穷举）── middleware/rate-limit.ts
② apiKeyAuth：Bearer sk-zhizhi-* → SHA-256 查库 → 启停/吊销(401)/禁用(403)/过期(403)
   → 载入用户与套餐分组（plan.model_group，套餐过期回退 default）
③ 请求校验：body ≤ GATEWAY_MAX_BODY_BYTES(413)、JSON/字段(400)、max_tokens 钳至 32768
④ 控制链：模型白名单(403 model_not_allowed) → 每 Key RPM 滑动窗口(429)
   → 用户池 quota_tokens<=0 或子 Key 独立额度耗尽(402 quota_exhausted)
⑤ 渠道路由：模型∩分组 过滤启用渠道 → 加权随机候选序列 → 逐个尝试
⑥ 转发：重建上游头（剥客户端 Authorization，注入上游 Key）；
   流式注入 stream_options.include_usage（上游 400 拒绝时去参数重试一次）
⑦ 故障转移：408/425/429/5xx/网络错误 → 下一渠道；全失败 502；
   不可重试 4xx（400/401/403/404）→ 透传状态码 + 通用错误体（不泄露上游细节）
⑧ 计量：见 §4
```

错误响应为 OpenAI 兼容格式 `{ error: { message, type, code } }`；`type ∈ invalid_request_error / rate_limit_error / insufficient_quota / upstream_error`。

## 4. 计量与扣费（services/usage.ts）

- **非流式**：响应体 `usage.prompt_tokens/completion_tokens` 直接提取。
- **流式**：`tapUpstreamStream` 用 ReadableStream 包装上游流——字节原样透传，旁路 `SseUsageExtractor` 按 SSE 行解析，捕获末 chunk（`choices` 为空数组）的 `usage`；同时累计 `delta.content` 字符数。
- **估算兜底**：上游不返回 usage 时按 ~1.6 字符/token 估算，`estimated=1` 便于对账。
- **记账**（better-sqlite3 同步）：`usage_logs` 插明细（含渠道/状态/延迟）→ 无条件扣减 `users.quota_tokens` 与 `api_keys.used_tokens` + 更新 `last_used_at`。预检在请求前、扣减在完成后；并发滥用下余量可能小幅击穿为负，随后预检立即封住（与 one-api 预检+后扣同语义）。
- **断连**：客户端 cancel → 流记 `aborted` 并按已收字符估算（上游已产生 token 必须计费）。
- **成本**：`services/model-prices.ts` 静态单价表（分/百万 token）：GLM-4.7-Flash/GLM-4V-Flash 免费、GLM-5 400/1800、DeepSeek V4-Flash 100/200、V4-Pro 300/600；未知模型计 0。

## 5. API 一览

| 端点 | 鉴权 | 说明 |
|---|---|---|
| `POST /v1/chat/completions` | 子 Key | OpenAI 兼容推理（流式/非流式） |
| `GET /v1/models` | 子 Key | 当前分组可用模型列表 |
| `POST /api/keys` `{name?, purpose}` | JWT | 签发子 Key（明文仅此一次，上限 20 把活跃） |
| `GET /api/keys` | JWT | 列出本人 Key（含 `key_preview`/用量，无哈希） |
| `PATCH /api/keys/:id` `{name?, enabled?}` | JWT | 改名/启停（吊销后 409） |
| `DELETE /api/keys/:id` | JWT | 吊销（幂等） |
| `GET /api/keys/:id/usage?days=30` | JWT | 单 Key 按天/模型聚合（仅本人） |
| `GET /api/usage/summary?days=30` | JWT | 用户级汇总：余量 + 总量 + 趋势 |

`days` 非法值回退 30，上限 365。

## 6. 运维手册（db:ui 本地管理，无 admin 角色/API）

1. **配置渠道**：`npm run db:migrate` 后 `channels` 表有两行种子（智谱/DeepSeek，`api_key_enc` 为空）。在 db:ui（`npm run db:ui`，仅 127.0.0.1:8790）编辑渠道行，把上游 Key 填入 `api_key_enc`；服务端设置了 `CHANNEL_ENC_KEY` 时写入加密串（`services/secret-box.ts#encryptSecret`），否则原样存储（启动时建议配置加密）。
2. **发放额度**：db:ui 编辑 `users.quota_tokens`（0 = 不可用；新用户注册即为 0）。
3. **调整子 Key 策略**：`api_keys.quota_tokens`（-1=不限）、`allowed_models`、`rpm_limit`、`expired_at`；用户自助也能做同类操作（管理路由）。
4. **对账**：`usage_logs.estimated=1` 的行是估算值；`status='aborted'` 是客户端断连（照常计费）。

## 7. 环境变量（server/.env.example）

| 变量 | 说明 |
|---|---|
| `CHANNEL_ENC_KEY` | 可选。设置后渠道上游 Key 以 AES-256-GCM 加密落库 |
| `GATEWAY_MAX_BODY_BYTES` | 可选。请求体上限，默认 10MB |
| `GATEWAY_UPSTREAM_TIMEOUT_MS` | 可选。上游首字节（响应头）超时，默认 300s |

## 8. 测试

- `test/keys.test.ts`（11 例）：签发/列表/禁用/吊销/越权/上限/校验。
- `test/channel.test.ts`（10 例）：加密往返与防篡改、模型/分组筛选、加权排序、价格计算。
- `test/gateway.test.ts`（19 例）：控制链全语义（401/403/402/429/413/400）、mock 上游故障转移（首个请求 500 → 次渠成功）、SSE 透传 + `stream_options` 注入、400 透传不泄露上游、精确 usage/估算/断连 aborted 计量、子 Key 额度边界。
- `test/usage.test.ts`（7 例）：聚合正确性、days 钳制、越权 404、用户隔离。

运行：`cd server && npm test`。

## 9. 已知边界（后续增强方向）

- 渠道健康熔断、TPM 限速、日汇总 rollup 表未实现（M5 范围）。
- RPM 限速为进程内存态，多实例部署需改 Redis；当前单机 SQLite 语义成立。
- 子 Key 预检+后扣在极端并发下允许小幅超支（负余量即封禁）。
- `purpose` 目前仅作 Key 归类展示，不做模型级强制。
