# 20 · 设置模块（Settings）

> 模块：设置界面（左侧导航 + 三面板：常规设置 / 模型配置 / 用户）
> 涉及文件：`src/views/SettingsPage.vue`、`src/views/ModelConfigPage.vue`、`src/views/OfficialModelPage.vue`、`src/views/CustomModelPage.vue`、`src/components/settings/`、`src/router/index.ts`
> 相关：客户端登录见 [22-auth-client.md](./22-auth-client.md)；服务端见 [21-auth-server.md](./21-auth-server.md)

## 背景

早期所有设置（学习仓库、模型配置、偏好、日志、关于）挤在一个长表单页中；随后模型配置拆为独立子路由页面。为统一导航体验，设置页改为**左侧导航栏 + 右侧面板**布局：常规设置 / 模型配置 / 用户三个栏目，点击切换右侧内容；「用户」栏目承载官方账号登录/注册。

> 修复记录（2026-09-02）：模型配置的「官方/自定义」入口原为顶层路由页面，点击后整个设置侧边栏消失。现已重构为**嵌套路由布局**——`SettingsPage` 成为常驻布局（侧边栏 + `<router-view>`），设置家族内所有子页面均在侧边栏右侧渲染，侧边栏永不消失。

## 页面结构与路由（嵌套路由）

`/settings` 为父路由（`SettingsPage` 作为布局组件），以下均为其 children，定义在 `src/router/index.ts`：

| 路由 | name | 内容 |
|---|---|---|
| `/settings` | `settings` | 空路径子路由，重定向到 `settings-general`（保持命名路由兼容） |
| `/settings/general` | `settings-general` | 常规设置：GeneralSettingsPanel（VaultSettings + 偏好 + 调试日志 + 关于），布局头部由 SettingsPage 提供 |
| `/settings/models` | `settings-models` | 模型配置入口：ModelConfigPage（复用 `ModelSettingsPanel` 两个入口卡片，含返回链） |
| `/settings/models/official` | `settings-models-official` | 知枝官方 API：登录表单 + 套餐预览 + 自动配置说明（见 [22-auth-client.md](./22-auth-client.md)） |
| `/settings/models/custom` | `settings-models-custom` | 自定义模型：服务商选择、API 地址、API Key、模型名称、联网搜索、图片转笔记模型（vision）、连接测试 |
| `/settings/user` | `settings-user` | 用户：UserSettingsPanel（登录/注册/已登录态），布局头部由 SettingsPage 提供 |

- 侧边栏高亮与跳转由路由驱动：`SettingsPage` 通过 `useRoute().name` 推导 `section`（`settings-models*` 前缀 → models，`settings-user` → user，其余 → general），点击导航项 `router.push({ name: 'settings-*' })`。
- 布局头部（eyebrow/标题/副标题）仅 general/user 渲染；models 系列子页面自带完整头部（含返回链）。
- 子页面根元素不再自带 padding/滚动，统一由布局 `.settings-content` 提供内边距与滚动容器。

## 组件结构

设置页面板拆分为 `src/components/settings/` 三个组件；`SettingsPage.vue` 只负责布局：常驻侧边栏（路由驱动高亮）+ 布局头部 + `<router-view>` 渲染当前子路由：

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

- `src/views/SettingsPage.test.ts`：基于内存路由（与真实设置嵌套路由结构一致）挂载 `RouterView` 宿主，覆盖侧边栏三项渲染与默认常规面板（含「关于知枝」回归防线）、点击「模型配置」切换子路由且侧边栏常驻、进入官方/自定义子页后侧边栏仍常驻（本次修复的回归防线）、点击「用户」切换面板、用户面板登录成功进入已登录态（mock auth store）。
- `src/views/ModelConfigPage.test.ts`：入口渲染 + 两个卡片跳转 + 返回（mock auth store 供徽标）。
- `src/router/index.test.ts`：`/settings` 重定向到 `settings-general`、命名路由 `settings` 兼容、官方/自定义子路由路径不变。
- `src/components/settings/UserSettingsPanel.test.ts`：登录/注册模式切换、发码倒计时（fake timers）、登录/注册成功文案、失败保持表单、登出回表单。
- `src/views/OfficialModelPage.test.ts`、`src/views/CustomModelPage.test.ts`：原有覆盖。

### App.vue 布局联动

`App.vue` 的会话栏隐藏、顶部返回按钮、面包屑、跨界面菜单此前用 `route.path === '/settings'` 精确匹配，子路由路径（如 `/settings/models/official`）无法命中；现统一改为 `startsWith('/settings')`，设置家族内所有页面行为一致。
