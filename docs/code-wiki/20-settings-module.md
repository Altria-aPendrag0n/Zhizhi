# 20 · 设置模块（Settings）

> 模块：设置界面拆分（模型配置独立页面 + 官方 API 骨架）
> 涉及文件：`src/views/SettingsPage.vue`、`src/views/ModelConfigPage.vue`、`src/views/OfficialModelPage.vue`、`src/views/CustomModelPage.vue`、`src/router/index.ts`

## 背景

早期所有设置（学习仓库、模型配置、偏好、日志、关于）挤在一个长表单页 `SettingsPage.vue` 中。模型配置（服务商/Key/模型/联网搜索 + 图片转笔记模型）尤其冗长。按用户要求拆分为**独立子路由页面**：模型配置单独成页，页内提供「知枝官方 API」与「自定义模型」两个入口，详细配置在各自页面完成。

## 页面结构与路由

| 路由 | 页面 | 内容 |
|---|---|---|
| `/settings` | 设置总览 | 学习仓库（VaultSettings）+ 偏好设置（自动生成标题/标签、复习算法）+ 模型配置入口卡片 + 调试日志 + 关于 |
| `/settings/models` | 模型配置入口 | 两个入口卡片：知枝官方 API / 自定义模型（标识当前使用状态） |
| `/settings/models/official` | 知枝官方 API | 登录表单 UI + 套餐预览 + 自动配置说明（UI 骨架，见下） |
| `/settings/models/custom` | 自定义模型 | 原模型配置表单：服务商选择、API 地址、API Key、模型名称、联网搜索、图片转笔记模型（vision）、连接测试 |

路由定义在 `src/router/index.ts`（懒加载 import）。

## 页面职责

### 1. SettingsPage（设置总览）

- 保留：`VaultSettings`（学习仓库）、自动生成笔记标题/标签、复习间隔算法、`handleSave`（仅保存偏好）、调试日志面板（`utils/logger.ts`）、`AboutSection`。
- 新增：「模型配置」入口卡片 → `router.push({ name: 'settings-models' })`。
- **不再持有** Provider 配置逻辑（原 `providerPresetKeys` / `handleTest` / `handleVisionTest` / vision 表单全部迁往 CustomModelPage）。

### 2. ModelConfigPage（模型配置入口）

- 两个入口卡片（点击跳转子路由）：
  - **知枝官方 API**：徽标「即将上线」；文案强调登录即用、Key 对用户不可见（存系统钥匙串）、覆盖全部 AI 能力。
  - **自定义模型**：徽标「当前使用」；文案为 BYOK 说明（Anthropic/OpenAI/DeepSeek/通义千问/智谱/Ollama/自定义 + 独立视觉模型）。

### 3. CustomModelPage（自定义模型）

迁移自原 SettingsPage 的模型表单与全部逻辑：

- 服务商选择 → 预设映射 `providerPresetKeys`（`anthropic` 原生 / 其余 `openai-compat`），`onProviderChange` 按 `PROVIDER_PRESETS` 填充 baseUrl/model。
- 表单字段：API 地址、API Key（可见性切换）、模型名称、联网搜索开关。
- 图片转笔记模型（vision）：开关 + 展开的 baseUrl/Key/模型 + 独立连接测试（`createVisionProvider`），与对话模型解耦。
- 保存：写 `useSettingsStore()` 对应字段 + `saveSettings()`；连接测试：`createProvider(config).chat()` 流式验证。
- 返回：`router.push({ name: 'settings-models' })`。

### 4. OfficialModelPage（知枝官方 API —— UI 骨架）

**当前为骨架状态**：后端账号体系（登录/支付/Key 下发）尚未开发，所有交互统一 `toast.error('账号服务尚未上线，敬请期待')`。

- **登录引导**：账号（邮箱/手机号）+ 验证码输入 + 登录按钮（UI 完整，逻辑占位）。
- **套餐预览**：轻量 / 标准 / 专业三档卡片（价格占位「即将上线」）。
- **如何工作**：说明购买后 Key 自动下发并存入系统钥匙串、全部 AI 能力自动走官方 API、用量实时扣减。

> 后续接入点（与 `docs/官方API分发机制调研与开发方案.md` 对应）：登录 → 服务端下发 Key（Tauri keyring 安全存储）→ 购买（微信/支付宝）→ 用量扣减与展示。官方端点 OpenAI 兼容，复用 `openai-compat` 适配器即可，无需改 LLM 层。

## 与 LLM 适配层的关系

- 自定义模型配置最终写入 `settings store`（`activeProvider`/`baseUrl`/`apiKey`/`model`/`enableWebSearch`/`vision*`），由 `api/provider-factory.ts` 的 `createProvider` / `createVisionProvider` 消费（见 [08-llm-api-layer.md](./08-llm-api-layer.md)）。
- 官方 API 就绪后同样写入该配置（`openai-compat` 类型 + 官方端点），LLM 调用链路不变。

## 测试

- `src/views/SettingsPage.test.ts`：总览页保留「关于知枝」区块（回归防线）。
- `src/views/ModelConfigPage.test.ts`：入口渲染 + 两个卡片跳转 + 返回。
- `src/views/OfficialModelPage.test.ts`：登录/套餐渲染、登录与开通按钮提示未上线、返回。
- `src/views/CustomModelPage.test.ts`：表单渲染、vision 开关展开、保存写入 store、返回。
