# 20 · 设置模块（Settings）

> 模块：设置界面（左侧导航 + 三面板：常规设置 / 模型配置 / 用户）
> 涉及文件：`src/views/SettingsPage.vue`、`src/views/ModelConfigPage.vue`、`src/views/OfficialModelPage.vue`、`src/views/CustomModelPage.vue`、`src/components/settings/`、`src/router/index.ts`
> 相关：客户端登录见 [22-auth-client.md](./22-auth-client.md)；服务端见 [21-auth-server.md](./21-auth-server.md)

## 背景

早期所有设置（学习仓库、模型配置、偏好、日志、关于）挤在一个长表单页中；随后模型配置拆为独立子路由页面。为统一导航体验，设置页改为**左侧导航栏 + 右侧面板**布局：常规设置 / 模型配置 / 用户三个栏目，点击切换右侧内容；「用户」栏目承载官方账号登录/注册。

## 页面结构与路由

| 路由 | 页面 | 内容 |
|---|---|---|
| `/settings` | 设置（侧边栏布局） | 左侧导航三项：常规设置（VaultSettings + 偏好 + 调试日志 + 关于）、模型配置（两个入口卡片）、用户（登录/注册/已登录态） |
| `/settings/models` | 模型配置入口 | 复用 `ModelSettingsPanel`（两个入口卡片），保留返回链 |
| `/settings/models/official` | 知枝官方 API | 登录表单 + 套餐预览 + 自动配置说明（真实登录流，见 [22-auth-client.md](./22-auth-client.md)） |
| `/settings/models/custom` | 自定义模型 | 原模型配置表单：服务商选择、API 地址、API Key、模型名称、联网搜索、图片转笔记模型（vision）、连接测试 |

路由定义在 `src/router/index.ts`（懒加载 import）。`/settings/models/official|custom` 供模型入口卡片跳转与返回链使用。

## 组件结构

设置页按面板拆分为 `src/components/settings/` 三个组件，`SettingsPage.vue` 只负责布局与栏目切换（`section` ref：`general | models | user`）：

### 1. GeneralSettingsPanel（常规设置）

- `VaultSettings`（学习仓库）、自动生成笔记标题/标签、复习间隔算法、`handleSave`（仅保存偏好）、调试日志面板（`utils/logger.ts`）、`AboutSection`。
- 样式与旧 `SettingsPage.vue` 正文一致（form/toggle/logs/about）。

### 2. ModelSettingsPanel（模型配置）

- 两个入口卡片（点击跳转子路由）：
  - **知枝官方 API**：徽标动态显示 `authStore.isOfficialActive ? '已启用' : '未登录'`（登录后即启用官方 API）；文案强调 Key 对用户不可见（存系统钥匙串）。
  - **自定义模型**：徽标「当前使用」；文案为 BYOK 说明。
- 同时被 `/settings/models`（ModelConfigPage）复用，保证侧边栏面板与独立路由内容一致。

### 3. UserSettingsPanel（用户 —— 登录/注册）

- **未登录**：`mode` 分段切换（登录 / 注册）+ 账号（邮箱/手机号）+ 验证码 + 「获取验证码」（60s 倒计时）+ 主按钮（文案随模式：登录/注册/登录中…/注册中…）。
  - 两种模式均调用 `authStore.login(identifier, code)`（服务端首次登录即自动注册，无独立注册接口），成功 toast 文案区分（登录：'登录成功，官方 API 已启用'；注册：'注册成功，已自动登录'）。
  - 错误归一：`ZhizhiApiError` message / 网络错误 / 兜底文案。
- **已登录**：账号卡片（identifier / 当前套餐 / 剩余额度）+ 退出登录（`authStore.logout()`）。
- 与 `OfficialModelPage` 共用同一 `authStore`（钥匙串/令牌/401 刷新逻辑均在其中），只是独立的 UI 呈现。

### 4. CustomModelPage（自定义模型）

迁移自旧 SettingsPage 的模型表单与全部逻辑：服务商预设映射、API 地址/Key/模型、联网搜索、vision 独立模型与连接测试、保存写入 settings store。返回 `settings-models`。

### 5. OfficialModelPage（知枝官方 API）

真实登录流（见 [22-auth-client.md](./22-auth-client.md)）：登录表单（账号 + 验证码 + 60s 倒计时）→ 登录成功进入已登录态（账号/套餐/额度 + 退出登录）；套餐预览与「如何工作」保留（购买属 Phase 2）。

## 与 LLM 适配层的关系

- 自定义模型配置写入 `settings store`，由 `api/provider-factory.ts` 的 `createProvider` / `createVisionProvider` 消费（见 [08-llm-api-layer.md](./08-llm-api-layer.md)）。
- 官方 API：`settings.getProviderConfig()` 在 `officialApiEnabled`（登录后由 auth store 置位）时返回官方配置（`openai-compat` + 官方 baseUrl + 内存 api_key），LLM 调用链路不变。

## 测试

- `src/views/SettingsPage.test.ts`：侧边栏三项渲染、默认常规面板（含「关于知枝」回归防线）、点击切换模型/用户面板、用户面板登录成功进入已登录态（mock auth store）。
- `src/views/ModelConfigPage.test.ts`：入口渲染 + 两个卡片跳转 + 返回（mock auth store 供徽标）。
- `src/components/settings/UserSettingsPanel.test.ts`：登录/注册模式切换、发码倒计时（fake timers）、登录/注册成功文案、失败保持表单、登出回表单。
- `src/views/OfficialModelPage.test.ts`、`src/views/CustomModelPage.test.ts`：原有覆盖。
