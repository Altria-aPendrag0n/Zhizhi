# 22 · 客户端登录接入（Auth Client）

> 模块：知枝官方账号客户端接入（Phase 1 收尾）
> 涉及文件：`src-tauri/`（keyring 插件）、`src/utils/secure-store.ts`、`src/api/zhizhi-api.ts`、`src/stores/auth.ts`、`src/stores/settings.ts`、`src/views/OfficialModelPage.vue`、`src/App.vue`、`src-tauri/tauri.conf.json`、`server/src/app.ts`（CORS）
> 依据：《客户端登录与服务端安全同步设计调研》（`docs/research/`）、《客户端登录接入实施方案》（`docs/todo/`）；服务端见 [21-auth-server.md](./21-auth-server.md)

## 背景

服务端账号体系（邮箱注册 + 用户名密码登录 / access+refresh / /api/me）就绪后，客户端接入真实登录注册流。核心目标是**凭据安全边界**：官方 Key（= 钱）与 refresh_token（= 会话永续）绝不进 localStorage，只存 OS 钥匙串；access_token 仅内存，靠轮换静默续期。同时解决开发期本地服务与发布期生产地址的配置问题。

## 凭据安全架构

```
渲染进程（Vue）
  access_token：仅内存（zhizhi-api 模块级 + auth store 镜像）
  api_key：仅内存（登录/恢复时从钥匙串读入，构造 Provider 用）
  refresh_token：不经任何 JS 持久层
      │
      ▼  Tauri IPC（keyring 插件权限白名单）
Rust 后端
  tauri-plugin-keyring → OS 钥匙串
    service = com.study-thread.app
    user = zhizhi.refresh_token / zhizhi.api_key
```

- [secure-store.ts](../study-thread/src/utils/secure-store.ts)：`getRefreshToken/setRefreshToken/deleteRefreshToken`、`getApiKey/setApiKey/deleteApiKey`、`clearCredentials`（delete 幂等）。service 固定 `com.study-thread.app`，条目名常量导出。
- [capabilities/default.json](../study-thread/src-tauri/capabilities/default.json)：仅授权 `keyring:allow-get-password / set-password / delete-password`（最小权限）。
- 插件选用 `tauri-plugin-keyring`（crate 0.1.0 + npm `tauri-plugin-keyring-api`，同一作者 HuakunShen 的 keyring crate 封装；Windows Credential Manager / macOS Keychain / Linux Secret Service）。**注意**：其 JS API 为 `setPassword(service, user, password)`，与部分文档中的单参签名不同。

## 登录状态机（stores/auth.ts）

| 状态 | 触发 | 说明 |
|---|---|---|
| anonymous | 启动无凭据 / 登出 / 会话过期 | 显示登录表单 |
| authenticating | login 进行中 | 按钮 loading |
| authenticated | login 成功 / restore 静默续期成功 | 官方 API 启用 |

- `sendCode(email)` → 返回 `cooldown_seconds`（UI 倒计时；仅邮箱）。
- `login(username, password)` → zhizhi-api 登录（用户名+密码）→ 写钥匙串 refresh_token（api_key 注册时已入库）→ 内存 accessToken/apiKey → `settings.officialApiEnabled = true` → `fetchMe()` 拉额度。
- `register(email, code, username, password)` → 邮箱验证码 + 设置用户名密码 → 服务端注册并签发 Key → `settleAuth()` 自动登录。
- `settleAuth(result)`：login/register 共用的落地逻辑（写钥匙串 + 内存 token + 启用官方 API + fetchMe）。
- `restore()`（App.vue onMounted 调用，失败静默）：钥匙串有 refresh_token → `silentRefresh()` → 读 api_key → authenticated。
- `silentRefresh()`：zhizhi-api `refreshSession()`（轮换写回钥匙串）→ 缺 api_key 或刷新失败 → `clearCredentials()` 回 anonymous。
- `logout()`：服务端吊销（尽力而为，不可达也本地登出）→ 清钥匙串与内存 → anonymous。
- 401 单飞刷新回调：`setOnTokensRefreshed` 同步 auth store 的 accessToken 镜像。

## API 客户端（api/zhizhi-api.ts）

纯逻辑层（不依赖 Vue/Pinia），baseUrl 与 access_token 为模块级状态：

- `setApiBaseUrl / setApiAccessToken / getApiAccessToken / setOnTokensRefreshed`：auth store 接入点。
- `sendCode(email) / register({ email, code, username, password }) / login(username, password) / logout / fetchMe / refreshSession`：对应服务端端点。
- **401 single-flight**：模块级 `refreshing` 单例——并发请求 401 时共享同一次 `/auth/refresh`；成功后写回钥匙串 + 更新内存 token + 重放原请求一次；失败 `clearCredentials()` 并抛 `SESSION_EXPIRED`（auth store 捕获回登录态）。
- 错误归一：`ZhizhiApiError { message, status, retryAfterSeconds, code }`；`NETWORK` / `RATE_LIMITED`（429 带 `retry_after`/`cooldown_seconds`）/ `UNSAFE_BASE_URL` / `SESSION_EXPIRED`。
- **baseUrl 安全校验**（`isSafeBaseUrl`）：仅允许 `https://` 或 `http://127.0.0.1` / `http://localhost`；否则在 fetch 前抛 `UNSAFE_BASE_URL`（防误配/钓鱼，不向明文地址注入令牌）。

## 官方地址配置与 CSP

- [settings.ts](../study-thread/src/stores/settings.ts)：`officialApiBaseUrl` 默认 = `import.meta.env.VITE_OFFICIAL_API_URL` 或 `import.meta.env.PROD ? 'https://api.zhizhi.app' : 'http://127.0.0.1:8787'`（**开发回环 / 发布生产域名**，可用 `VITE_OFFICIAL_API_URL` 覆盖自托管/灰度）；持久化于 `study-thread-settings`（非敏感）。
- `officialApiEnabled` 仅内存（auth store 切换），`officialModel` 默认 `glm-4.7-flash`（Phase 2 网关定档后调整）。
- [tauri.conf.json](../study-thread/src-tauri/tauri.conf.json) CSP：`connect-src` 追加 `http://127.0.0.1:8787 https:`（生产放行任意 HTTPS + CORS/代码层双保险，地址可运行时修改）。

## Provider 接线

[settings.ts](../study-thread/src/stores/settings.ts) `getProviderConfig()`：`officialApiEnabled` 时返回 `{ type: 'openai-compat', apiKey: authStore.apiKey（内存，来自钥匙串）, baseUrl: officialApiBaseUrl, model: officialModel }`。既有 `createProvider` 消费链（chat-loop / skills / vision）**零改动**。

## OfficialModelPage / UserSettingsPanel 登录注册流

- **登录**（用户名 + 密码）：anonymous 显示表单（用户名/密码，含格式占位提示）；authenticating 按钮 loading；成功进入已登录态（用户名 / 绑定邮箱 / 套餐 / 剩余额度，来自 `/api/me`）+ 「退出登录」。
- **注册**（两步）：模式切换至「注册」→ ① 邮箱 + 验证码（「获取验证码」60s 倒计时，`cooldown_seconds`）→ ② 设置用户名 + 密码 + 确认密码（客户端校验：邮箱格式、验证码 6 位、用户名 `[A-Za-z0-9]{3,32}`、密码 `[A-Za-z0-9]{6,64}`、两次一致）→ `authStore.register()` 自动登录。
- 错误 toast：401（验证码错误 / 用户名或密码错误）、409（用户名/邮箱已占用）、429（限频）、网络。
- 设置页「用户」栏目（UserSettingsPanel）与 OfficialModelPage 提供相同的登录/注册 UI，共用同一 `authStore`。
- 套餐卡片仍为预览（Phase 2 支付接入前保留"未上线"提示）。

## 服务端配套（CORS）

[server/src/app.ts](../study-thread/../server/src/app.ts) `corsOrigins()`：
- `CORS_ORIGIN` 环境变量（逗号分隔）优先；
- 否则 `NODE_ENV === 'production'` 用白名单 `tauri://localhost`、`http(s)://tauri.localhost`、`http://localhost:1420`；
- 开发/测试不传 origin（hono 默认全放行，测试不受影响）。

## 测试

| 文件 | 覆盖 |
|---|---|
| `src/api/zhizhi-api.test.ts` | login（用户名密码）请求与解析、register 请求、不安全 baseUrl 拒绝（不发请求）、网络错误 NETWORK、429 冷却秒数、**并发 401 只刷新一次并重放**、刷新失败清凭据抛 SESSION_EXPIRED、refreshSession 成功/无凭据 |
| `src/stores/auth.test.ts` | sendCode 冷却、login（用户名密码）成功/失败、register 成功自动登录（api_key 写钥匙串）/失败回匿名、restore 四分支（无凭据/刷新成功/刷新失败/缺 Key）、logout 清凭据、fetchMe 额度同步 |
| `src/components/settings/UserSettingsPanel.test.ts` | 登录/注册模式切换、发码倒计时（fake timers）、用户名/密码格式与两次密码一致校验、注册成功自动登录、登出回表单 |
| `src/views/OfficialModelPage.test.ts` | 表单渲染、空提交提示、发码倒计时（fake timers）、登录成功进已登录态、注册成功提示、登录失败保持表单、登出回表单、套餐未上线提示、返回跳转 |
| `src/views/SettingsPage.test.ts` | 侧边栏切换 + 用户面板登录成功（mock auth store） |
| `src/App.test.ts` | 新增 auth store mock（App.vue 挂载 restore） |

## 关键坑位

1. **hono cors 传 `{ origin: undefined }` 会覆盖默认 `*` 并崩溃**（`undefined.includes`）——未配置时直接 `cors(undefined)`。
2. **vitest fake timers 需在 mount 前启用**，且用 `advanceTimersByTimeAsync` 等待 Vue 调度 flush DOM。
3. **页面测试 mock store**：返回 `reactive({ ...refs })` 才能让模板解包 ref/computed 并响应状态变化；`vi.mock` 工厂内变量勿与 `vi.hoisted` 状态同名（会遮蔽）。
4. **App.test.ts 全量 mock stores 无 Pinia**：新增 store 必须同样 mock，否则 `getActivePinia()` 报错。
5. **表单提交测试**：`<form @submit.prevent>` + `type="submit"` 按钮在 happy-dom 下 `trigger('click')` 不触发提交——测试用 `wrapper.find('form').trigger('submit')`。

## 后续任务（Phase 2+）

- 服务端 plans/orders/usage + 支付（套餐"开通"接真实下单）；LLM 网关（鉴权 → 额度 → 转发 → 扣费 → 审计）；`/api/config` 配置下发。
- refresh 空闲超时（7 天 idle）与设备会话管理。
- 上线：服务端 HTTPS 部署 + `CORS_ORIGIN`/`JWT_SECRET` 生产配置；发布包注入 `VITE_OFFICIAL_API_URL`（或依赖 PROD 默认域名）。
