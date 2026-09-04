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
- `login(username, password, remember = true)` → zhizhi-api 登录（用户名+密码）→ 写钥匙串 refresh_token（api_key 注册时已入库）→ 内存 accessToken/apiKey → `settings.officialApiEnabled = true` → `fetchMe()` 拉额度。`remember=false` 表示本会话保持登录但重启后不自动恢复。
- `register(email, code, username, password)` → 邮箱验证码 + 设置用户名密码 → 服务端注册并签发 Key → `settleAuth(result)` 自动登录（register 默认按记住处理）。
- `settleAuth(result, remember = true)`：login/register 共用的落地逻辑（落库用户名与 remember 偏好 + 写钥匙串 + 内存 token + 启用官方 API + fetchMe）。
- `restore()`（App.vue onMounted 调用，失败静默）：先查「记住密码」偏好——未勾选则 `clearCredentials()` 清残留凭据、保持匿名；勾选且钥匙串有 refresh_token → `silentRefresh()` → 读 api_key → authenticated。
- `silentRefresh()`：zhizhi-api `refreshSession()`（轮换写回钥匙串）→ 缺 api_key 或刷新失败 → `clearCredentials()` 回 anonymous。
- `logout()`：服务端吊销（尽力而为，不可达也本地登出）→ 清钥匙串与内存 → anonymous。
- 401 单飞刷新回调：`setOnTokensRefreshed` 同步 auth store 的 accessToken 镜像。

## 记住密码与用户名记忆

- **密码绝不落盘**：凭据安全边界不变——refresh_token / api_key 只进 OS 钥匙串。「记住密码」只是控制重启后是否走 `restore()` 自动续期，不改变凭据存储位置。
- `zhizhi.auth.remember`（localStorage，默认 `true`）：勾选后重启自动登录；未勾选时 `restore()` 主动清掉钥匙串残留凭据（防止上次会话遗留 refresh_token 被静默使用）。
- `zhizhi.auth.last-username`（localStorage）：上次成功登录的用户名，登录表单始终预填（**用户名非敏感，与「记住密码」开关无关**；从未登录过返回空串）。
- 导出函数 `getLastUsername()` / `getRememberPreference()`（[auth.ts](../study-thread/src/stores/auth.ts)）：登录表单（OfficialModelPage / UserSettingsPanel）与 `restore()` 共用同一份偏好。
- 登录表单新增复选框「记住密码，重启后自动登录（用户名始终保留）」，默认勾选（跟随上次偏好）；`handleLogin` 以 `(username, password, remember)` 三参调用。

## 官方通道开关一致性（officialApiEnabled）

不变式：**`officialApiEnabled = true` 当且仅当已登录且持有官方凭据（apiKey 非空）**。违反会出现的症状：重启后设置面板显示官方「使用中」，但会话发消息因 `getProviderConfig().apiKey` 为空被引导跳设置页（MainChatPage 的空 Key 检查）。

- `officialApiEnabled` 持久化于 `study-thread-settings`，重启由 `loadSettings()` 读回；auth store 内统一经 `setOfficialEnabled(enabled)` 写入——**改 ref 后立即 `saveSettings()` 落盘**（reset / settleAuth / silentRefresh 全部走它）。ModelSettingsPanel 的「切换使用」按钮同样补了 `saveSettings()`。
- `restore()` 的 remember=false 分支除清凭据外也调用 `reset()`（关闭并持久化官方通道），避免「未登录但 officialApiEnabled=true」残留。
- 相应地，silentRefresh 恢复成功 / 刷新失败 / 缺 Key、logout、login 失败等所有凭据变化路径都会同步落盘开关状态。

## 官方 Key 自愈（老用户/换机兜底）

服务端 Key 明文只在注册时返回一次（库中仅存 sha256，无法二次下发）。因此登录响应可能没有 `api_key`（老用户注册于 Key 机制上线前 / 换机器钥匙串为空），客户端凭 `ensureOfficialKey()` 自愈：

- `settleAuth`：登录后 `apiKey` 为空（响应无 Key 且钥匙串无 Key）→ 以 access_token 调 `POST /api/keys`（`createApiKey()`）补发一把新 Key 并写入钥匙串。
- `silentRefresh`：恢复会话后发现钥匙串缺 Key → 同样先自愈，失败才 `clearCredentials()` 回匿名。
- 服务端配套：`login()` 也调用 `issueApiKeyIfMissing` 幂等补发（见服务端 code-wiki 21 号文档）——两条腿保证任何场景登录后都能拿到可用 Key。

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

## OfficialModelPage 登录注册流（唯一账号页）

> 历史注记：早期「用户」栏目（UserSettingsPanel）与官方 API 页各有一套登录/注册 UI，已合并——**`settings-user` 路由直接复用 [OfficialModelPage](../study-thread/src/views/OfficialModelPage.vue)**（功能超集：登录/注册/忘记密码/注销 + 套餐中心 + 兑换码 + 用量汇总），UserSettingsPanel 已删除。该页在「用户」栏目下隐藏自有头部（由 SettingsPage 提供「用户」标题），避免双头部。

- **登录**（用户名 + 密码）：anonymous 显示表单（用户名/密码 + 记住密码复选框）；authenticating 按钮 loading；成功进入已登录态（用户名 / 绑定邮箱 / 套餐 / 剩余额度，来自 `/api/me`）+ 「退出登录」。
- **注册**（两步）：模式切换至「注册」→ ① 邮箱 + 验证码（「获取验证码」60s 倒计时，`cooldown_seconds`）→ ② 设置用户名 + 密码 + 确认密码（客户端校验：邮箱格式、验证码 6 位、用户名 `[A-Za-z0-9]{3,32}`、密码 `[A-Za-z0-9]{6,64}`、两次一致）→ `authStore.register()` 自动登录。
- 错误 toast：401（验证码错误 / 用户名或密码错误）、409（用户名/邮箱已占用）、429（限频）、网络。
- 入口：设置页侧边栏「用户」（`settings-user`）与模型配置 → 官方 API 卡片「去登录」（`settings-models-official`）指向**同一个页面组件**。
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
| `src/stores/auth.test.ts` | sendCode 冷却、login（用户名密码）成功/失败、login 默认写 remember 偏好与用户名（getLastUsername 可读取）、login(remember=false) 重启后 restore 清凭据不自动登录、login/restore 缺 Key 自愈（createApiKey 补发/失败回匿名）、register 成功自动登录（api_key 写钥匙串）/失败回匿名、restore 分支（无凭据/刷新成功/刷新失败/缺 Key 自愈）+ remember=false 分支、logout 清凭据、fetchMe 额度同步 |
| `src/views/OfficialModelPage.test.ts` | 表单渲染、空提交提示、发码倒计时（fake timers）、登录成功进已登录态（remember=true 三参）、登录表单预填上次用户名、记住密码复选框默认随偏好且 remember=false 透传、注册成功提示、登录失败保持表单、登出回表单、套餐中心与兑换、忘记密码/重置、注销账号、返回跳转 |
| `src/views/SettingsPage.test.ts` | 侧边栏切换 + 「用户」栏目复用官方账号页登录成功（mock auth store） |
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
