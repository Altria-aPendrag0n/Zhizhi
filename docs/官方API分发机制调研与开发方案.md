# 官方 API 分发机制调研与开发方案

> 目标：为知枝（Study Thread）提供**官方 API 服务**——用户购买官方 Key 填入应用即可使用 AI 功能（免去自行注册/配置各家服务商），同时为作者提供可持续收入。
> 本文档为调研结论与开发路线（参照 `docs/6a83a7ff…图片转笔记功能方案调研与选型总结.md` 的格式），供后续实施。

---

## 一、背景与目标

### 1.1 现状

- 知枝是本地优先的学习伴读应用（Tauri + Vue），目前**纯 BYOK**：用户在设置页自行配置各家服务商（OpenAI / Anthropic / DeepSeek / Qwen / Zhipu / Ollama…）的 Key。
- 所有 LLM 调用走统一接口 `LLMProvider.chat()`（[llm-provider.ts](../study-thread/src/api/llm-provider.ts)），[provider-factory.ts](../study-thread/src/api/provider-factory.ts) 按 `ProviderConfig` 创建适配器。
- 已有独立"图片转笔记模型"配置（vision，独立于对话模型）。

### 1.2 目标

1. **方便用户**：一个官方 Key 覆盖全部 AI 能力（对话 / 复习出题 / 笔记摘录 / 图片转笔记），无需注册多家、无需绑卡。
2. **可持续盈利**：预充值 / 订阅制，赚取平台费或差价。
3. **零门槛接入**：利用现有 `openai-compat` 适配器，客户端改动最小。

---

## 二、现状盘点（有利条件）

| 条件 | 说明 |
|---|---|
| 统一 Provider 抽象 | `LLMProvider.chat()` 是唯一调用入口 → 官方网关只要 **OpenAI 兼容**，客户端**零协议改造** |
| 已有 openai-compat 类型 | 官方服务商可复用该适配器（baseUrl 指向官方网关 + 官方 Key） |
| 已有连接测试 | 设置页 `handleTest` 模式可复用于"知枝官方"预设 |
| 已有 vision 配置 | 图片转笔记模型（GLM-4V-Flash 免费）可作引流能力 |

---

## 三、分发模式调研（业界主流）

### 3.1 统一网关 SaaS —— [OpenRouter](https://openrouter.ai/docs/faq)

- 一个 OpenAI 兼容端点聚合 400+ 模型，预充值 Credits 按 token 扣费；自动路由/故障转移；统一账单。
- **盈利方式**：充值收 5.5% 平台费，**模型价格透传不加价**；BYOK 用户超免费额度（月 $25K 列表价）后收 5% 服务费。
- 参考价值：**预充值 Credits 模式** + **BYOK 混合**（自持 Key 走统一接口）。

### 3.2 开源 Token 中转站

| 项目 | 协议 | 特点 | 是否适合商用 |
|---|---|---|---|
| [One API](https://github.com/songquanpeng/one-api) | **MIT** | Go 单二进制，OpenAI 格式统一，令牌额度/过期/IP/模型限制，兑换码充值，多渠道负载均衡与重试，Web 控制台 | ✅ 推荐（协议宽松，够用） |
| [New API](https://github.com/QuantumNous/new-api) | AGPLv3 | One API 二次开发：多格式互转、在线支付（易支付/Stripe）、令牌分组、数据看板 | ⚠️ AGPLv3 对商用有开源义务（可购商业许可） |
| [LiteLLM](https://litellm.ai) | MIT | Python 代理，100+ 提供商，Virtual Keys、按 Key/用户/团队预算、Guardrails、成本追踪 | ✅ 适合要预算管控的场景 |

### 3.3 结论

- **网关形态**：自研轻量网关（Go/Node）或 **One API（MIT）** 起步；对外只暴露 **OpenAI 兼容**端点（客户端 `openai-compat` 适配器直接可用）。
- **计费形态**：参考 OpenRouter 的 **预充值 Credits** 起步（无月费门槛，个人用户接受度高），Phase 2 再加订阅套餐。

---

## 四、上游模型候选调研（2026 年价格，元/百万 token）

| 厂商 | 模型 | 输入/输出 | 上下文 | 免费额度 | 接入格式 | 备注 |
|---|---|---|---|---|---|---|
| 智谱 | GLM-4.7-Flash | **免费** | 200K | 永久免费（30 并发） | OpenAI 兼容 | 引流首选；GLM-4V-Flash（视觉）也免费，正好承接图片转笔记 |
| 智谱 | GLM-5 | 4 / 18 | 200K | — | OpenAI 兼容 | 推理强 |
| DeepSeek | V4-Flash | 1 / 2 | 1M | — | OpenAI 兼容 | 国内地板价；V4 开源模型 MIT 可自建 |
| DeepSeek | V4-Pro | 3 / 6 | 1M | — | OpenAI 兼容 | 2.5 折永久价 |
| 阿里百炼 | Qwen3.5-Flash | 0.2 / 2 | 1M | 注册送 1000 万 token | OpenAI 兼容 | **百炼平台聚合 DeepSeek/Qwen/GLM/Kimi/MiniMax 多模型**，一家 Key 多模型 |
| 字节豆包 | Seed-2.0-Lite | 0.6 / 3.6 | 256K | 每日 200 万 token（协作） | 火山 SDK | 高并发稳定 |
| Kimi | K2.5 | 4 / 21 | 256K | 送 15 元代金券 | OpenAI 兼容 | 长文本强 |
| MiniMax | M2.7 | 2.1 / 8.4 | 1M | — | OpenAI 兼容 | 多模态/长上下文 |

**倾向性建议（不急于定稿）**：
- **引流主力**：智谱 GLM-4.7-Flash（免费、200K、编程强）+ GLM-4V-Flash（视觉，图片转笔记免费）。
- **付费主力**：DeepSeek V4-Flash（性价比地板）与 Qwen3.5-Flash（阿里背书）。
- **一家多模型**：若想少维护上游渠道，可优先接**阿里云百炼**（一家聚合多模型，且有合规背书）或智谱开放平台。
- 最终取舍取决于：定价空间（免费模型不能赚钱，付费模型赚差价）、合规倾向、以及你手上已有/易申请的 Key。

---

## 五、合规分析（关键！决定商业模式边界）

### 5.1 厂商红线与绿灯（[ToS 规范分析](https://blog.zzzxc.com/%E7%94%9F%E5%AD%98/Ai/%E6%A8%A1%E5%9E%8B%E7%9A%84%E5%8E%82%E5%95%86Token%E6%B6%88%E8%B4%B9%E8%A7%84%E8%8C%83)）

- **红线**：几乎所有主流厂商禁止"裸 API 透传/转售原始推理能力"（Proxy/Refinement）——即"倒爷"式 Token 中转站，发现即封号。
- **绿灯**：厂商欢迎 **SaaS/增值服务**——把模型当"原材料"，加上自己的业务逻辑（RAG 本地知识库、Agent 编排、学习伴读场景）卖给终端用户。
- **知枝的定位天然安全**：官方 API 是"知枝产品的云服务套餐"，不是"通用模型中转站"。模型只是产品内部的原材料。

### 5.2 数据隐私（[国内 AI 平台隐私政策调查](https://jidzhang.github.io/posts/2026-05-06-ai-platform-privacy-report/)）

- 通用 API 数据训练安全性排序：**DeepSeek ≥ 字节方舟 ≥ 阿里百炼 > 智谱**（DeepSeek 协议无训练授权条款，保护最强；智谱保留"匿名化后可训练"通道）。
- 若用户对数据敏感度高，优先 DeepSeek/阿里百炼。

### 5.3 开源模型兜底（[开源协议对比](https://blog.csdn.net/zhangfeng1133/article/details/161428295)）

- **DeepSeek V4、GLM-5.1 均为标准 MIT**，可自建部署、再分发无限制——未来量大了可自托管开源模型，彻底摆脱上游限制。

### 5.4 合规设计建议

1. **官方 Key 与应用绑定**：官方 Key 仅限在知枝应用内使用（服务端校验请求来源/应用签名），**不要做成通用 OpenAI 兼容 Key 供第三方开发者任意调用**（那样才构成"中转站"）。
2. **起步只接国产合规模型**（GLM/DeepSeek/Qwen），海外模型（OpenAI/Claude）留待有资质或海外市场。
3. 平台/服务需要：ICP 备案、AI 生成内容标识等，接入前确认。

---

## 六、推荐架构（分四阶段）

### Phase 0 — 客户端改造（现在可做，与后端解耦）
设置页新增「**知枝官方 API**」服务商预设：
- `type: 'openai-compat'`，固定官方 baseUrl（如 `https://api.zhizhi.app/v1`），用户只填官方 Key。
- 复用现有 `handleTest` 连接测试；与 BYOK 共存。
- 涉及文件：`openai-compat.ts`（预设列表）、`SettingsPage.vue`、`settings.ts`（无结构改动，只是预设项）。

### Phase 1 — 网关 MVP + 预充值
- 网关：**One API（MIT）** Docker 一键部署，或自研轻量 Go/Node 网关（对外 OpenAI 兼容）。
- 上游渠道：智谱（免费 Flash 引流 + GLM-5 付费）+ DeepSeek + Qwen（2-3 家起步）。
- 计费：**预充值 Credits + 兑换码**（One API 原生支持），后台手动发 Key（限模型/限速率/限额度）。
- 客户端：上线 Phase 0 预设，指向网关。

### Phase 2 — 计费闭环与订阅
- 支付：微信/支付宝（易支付接入，或自建订单服务）。
- 定价：**透传 + 平台费**（薄利获客）或**模型加价 10-30%**（直接差价）；订阅套餐（月费含额度，超量按量）。
- 看板：用量统计、成本核算、异常监控。

### Phase 3 — 增强
- 路由/故障转移、按模型分组定价、BYOK 混合（用户自持 Key 走统一接口收服务费，OpenRouter 式）。
- 若走量，评估自托管开源模型（DeepSeek V4/GLM-5.1，MIT）降低成本上限。

---

## 七、关键设计决策表

| 决策点 | 建议 | 状态 |
|---|---|---|
| 上游模型 | 未定：倾向智谱（免费引流+视觉）+ DeepSeek/Qwen（付费主力）；可走阿里百炼一家多模型 | ⏳ 待定 |
| 网关 | One API（MIT）或自研轻量网关，对外 OpenAI 兼容 | 待定 |
| 客户端接入 | `openai-compat` 预设复用，只填 Key | Phase 0 |
| 计费 | 预充值 Credits 起步 → 订阅套餐；透传+平台费 或 加价 10-30% | 待定 |
| Key 管理 | 绑定用户、可吊销、限模型/限速率/限额度（One API 原生） | Phase 1 |
| 支付 | 微信/支付宝（易支付/自建） | Phase 2 |
| 与 BYOK 共存 | 保留 BYOK，官方 API 为可选便捷方案 | 持续 |
| 合规 | 官方 Key 仅限知枝应用内使用；起步只接国产模型；备案确认 | 持续 |

---

## 八、风险与开放问题

1. **上游模型选择未定** → 影响 Phase 1 渠道配置与定价空间。
2. **合规确认**：是否做 ICP 备案、是否需要 AI 内容标识、境外用户策略。
3. **定价模型**：平台费 vs 加价；免费模型（GLM-Flash）引流策略（可限每日免费次数）。
4. **网关自研 vs One API**：自研可控但开发成本高；One API 快但依赖社区维护。
5. **支付主体**：个人 vs 公司主体影响收款与备案。

---

## 九、下一步开发计划

1. （可立即）**Phase 0 客户端改造**：设置页新增"知枝官方 API"预设（baseUrl + Key + 连接测试），提交后即可在任意网关就绪时无缝启用。
2. 确定**上游模型**（建议先接智谱 + DeepSeek 各 1 个付费模型 + 免费 Flash 引流）。
3. 部署**网关 MVP**（One API Docker + 渠道 + 兑换码），验证端到端链路（客户端 → 网关 → 上游）。
4. 制定**定价表**与**隐私政策/用户协议**补充条款。
5. 接入**支付**与用量看板（Phase 2）。

> 说明：本文价格/协议信息来自公开资料（[国产模型价格对比](https://blog.csdn.net/ideality0214/article/details/161675819)、[免费 API 平台汇总](https://blog.csdn.net/k0933/article/details/161116701)、[One API vs New API](https://www.apiseven.com/one-api-vs-new-api)、[OpenRouter](https://openrouter.ai/docs/faq)），以各厂商官网最新为准。
