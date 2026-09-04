/**
 * 知枝官方服务 API 客户端。
 * 纯逻辑层（不依赖 Vue/Pinia）：baseUrl 与 access_token 由模块级状态维护，
 * auth store 通过 setApiBaseUrl / setApiAccessToken / setOnTokensRefreshed 接入。
 * 安全边界：access_token 仅存内存；refresh_token 仅从钥匙串读取参与轮换。
 */

import type { OfficialUser } from '../types'
import { clearCredentials, getRefreshToken, setRefreshToken } from '../utils/secure-store'

export class ZhizhiApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryAfterSeconds?: number,
    readonly code?: string,
  ) {
    super(message)
  }
}

export interface LoginResult {
  access_token: string
  refresh_token: string
  user: OfficialUser
  api_key?: string
}

export interface RegisterInput {
  email: string
  code: string
  username: string
  password: string
  deviceId?: string
}

interface RefreshResult {
  access_token: string
  refresh_token: string
}

let apiBaseUrl = 'http://127.0.0.1:8787'
let apiAccessToken = ''
/** 401 单飞刷新后回调（auth store 同步镜像 token 并刷新 /me） */
let onTokensRefreshed: ((accessToken: string, refreshToken: string) => void) | null = null

export function setApiBaseUrl(url: string): void {
  apiBaseUrl = url.trim().replace(/\/+$/, '')
}

export function getApiBaseUrl(): string {
  return apiBaseUrl
}

export function setApiAccessToken(token: string): void {
  apiAccessToken = token
}

export function getApiAccessToken(): string {
  return apiAccessToken
}

export function setOnTokensRefreshed(fn: ((accessToken: string, refreshToken: string) => void) | null): void {
  onTokensRefreshed = fn
}

/** baseUrl 安全校验：仅允许 HTTPS 或本地回环（防误配/钓鱼，禁止向任意明文地址注入令牌） */
export function isSafeBaseUrl(url: string): boolean {
  const trimmed = url.trim()
  if (/^https:\/\//i.test(trimmed)) return true
  return /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/i.test(trimmed)
}

function endpoint(path: string): string {
  if (!isSafeBaseUrl(apiBaseUrl)) {
    throw new ZhizhiApiError('官方服务地址不合法：仅支持 HTTPS 或本地回环地址（127.0.0.1 / localhost）', undefined, undefined, 'UNSAFE_BASE_URL')
  }
  return `${apiBaseUrl}${path}`
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE'
  body?: unknown
  auth?: boolean
  allowRetry?: boolean
  /** 覆盖默认鉴权头：网关 /v1/* 需要 sk-zhizhi- 官方 Key（而非 access_token），且 401 不触发会话刷新 */
  bearer?: string
}

let refreshing: Promise<RefreshResult | null> | null = null

/**
 * 401 单飞刷新：并发请求共享同一次 refresh（防止令牌轮换风暴）。
 * 成功后写回钥匙串并回调；失败清空凭据返回 null（调用方抛 SESSION_EXPIRED）。
 */
async function refreshAccessToken(): Promise<RefreshResult | null> {
  if (refreshing) return refreshing
  refreshing = (async () => {
    try {
      const refreshToken = await getRefreshToken()
      if (!refreshToken) return null
      const result = await request<RefreshResult>('/api/auth/refresh', {
        method: 'POST',
        body: { refresh_token: refreshToken },
        auth: false,
        allowRetry: false,
      })
      await setRefreshToken(result.refresh_token)
      apiAccessToken = result.access_token
      onTokensRefreshed?.(result.access_token, result.refresh_token)
      return result
    } catch {
      await clearCredentials()
      return null
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true, allowRetry = true, bearer } = options
  const url = endpoint(path) // 不安全 baseUrl 在 fetch 前即拒绝（UNSAFE_BASE_URL）
  const authorization = bearer
    ? `Bearer ${bearer}`
    : auth && apiAccessToken
      ? `Bearer ${apiAccessToken}`
      : undefined
  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(authorization ? { authorization } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ZhizhiApiError('网络连接失败，请检查网络或服务地址', undefined, undefined, 'NETWORK')
  }

  // bearer 模式的 401 表示官方 Key 无效/被吊销，与会话刷新无关，直接抛给调用方
  if (res.status === 401 && auth && allowRetry && !bearer) {
    const refreshed = await refreshAccessToken()
    if (refreshed) {
      return request<T>(path, { ...options, allowRetry: false })
    }
    throw new ZhizhiApiError('登录已过期，请重新登录', 401, undefined, 'SESSION_EXPIRED')
  }

  const data = (await res.json().catch(() => null)) as (Record<string, unknown> & { error?: string }) | null

  if (res.status === 429) {
    const retryAfter = Number(data?.retry_after ?? data?.cooldown_seconds) || undefined
    throw new ZhizhiApiError(data?.error ?? '请求过于频繁，请稍后再试', 429, retryAfter, 'RATE_LIMITED')
  }

  if (!res.ok) {
    throw new ZhizhiApiError(data?.error ?? `请求失败（${res.status}）`, res.status)
  }

  return data as T
}

/** 发送邮箱验证码（注册用；仅邮箱，取消手机号通道） */
export async function sendCode(identifier: string): Promise<{ success: boolean; cooldown_seconds: number }> {
  return request('/api/auth/send-code', { method: 'POST', body: { identifier }, auth: false })
}

/** 用户名 + 密码登录 */
export async function login(username: string, password: string, deviceId?: string): Promise<LoginResult> {
  return request('/api/auth/login', {
    method: 'POST',
    body: { username, password, ...(deviceId ? { device_id: deviceId } : {}) },
    auth: false,
  })
}

/** 邮箱注册：验证码验证 + 设置用户名/密码（首次登录即自动注册的替代入口），签发官方 Key 与令牌 */
export async function register(input: RegisterInput): Promise<LoginResult> {
  return request('/api/auth/register', {
    method: 'POST',
    body: {
      email: input.email,
      code: input.code,
      username: input.username,
      password: input.password,
      ...(input.deviceId ? { device_id: input.deviceId } : {}),
    },
    auth: false,
  })
}

export async function logout(refreshToken: string): Promise<void> {
  await request('/api/auth/logout', { method: 'POST', body: { refresh_token: refreshToken }, auth: false, allowRetry: false })
}

export async function fetchMe(): Promise<OfficialUser> {
  return request('/api/me')
}

/** 自助补发官方 Key（需登录）：老用户/换机后钥匙串缺失时的自愈通道（服务端只存 hash，明文无法二次下发） */
export async function createApiKey(): Promise<{ id: string; key: string; key_preview: string }> {
  return request('/api/keys', { method: 'POST', body: { purpose: 'chat' } })
}

/** 网关可用模型列表（OpenAI 兼容 GET /v1/models，Bearer 官方 api_key；只含已配置上游 Key 的渠道） */
export async function fetchOfficialModels(apiKey: string): Promise<{ object: string; data: Array<{ id: string }> }> {
  return request('/v1/models', { bearer: apiKey, allowRetry: false })
}

/** 使用钥匙串中的 refresh_token 静默续期（启动恢复 / auth store 主动调用）；成功返回 true */
export async function refreshSession(): Promise<boolean> {
  return (await refreshAccessToken()) !== null
}

// ===== 套餐中心（上线方案 S6） =====

export interface UsageSummary {
  days: number
  quota_tokens: number
  totals: { requests: number; prompt_tokens: number; completion_tokens: number; cost_cents: number }
  daily: Array<{ day: string; requests: number; prompt_tokens: number; completion_tokens: number; cost_cents: number }>
  models: Array<{ model: string | null; requests: number; prompt_tokens: number; completion_tokens: number; cost_cents: number }>
}

export interface RedeemResult {
  success: boolean
  plan: { id: string; name: string; token_quota: number }
  plan_expires_at: number
  quota_tokens: number
}

export interface MyOrder {
  id: string
  order_no: string | null
  plan_id: string | null
  amount_cents: number
  status: string
  provider: string | null
  paid_at: number | null
  created_at: number | null
}

/** 套餐列表（公开） */
export async function fetchPlans(): Promise<{ plans: import('../types').OfficialPlan[] }> {
  return request('/api/plans', { auth: false })
}

/** 兑换码核销（需登录） */
export async function redeemPlan(code: string): Promise<RedeemResult> {
  return request('/api/plans/redeem', { method: 'POST', body: { code } })
}

/** 用户级用量汇总：余量 + 近 N 天聚合（需登录） */
export async function fetchUsageSummary(days = 30): Promise<UsageSummary> {
  return request(`/api/usage/summary?days=${days}`)
}

/** 本人订单列表（需登录） */
export async function fetchMyOrders(): Promise<{ orders: MyOrder[] }> {
  return request('/api/me/orders')
}

// ===== 账号安全（上线方案 S7/S8） =====

/** 忘记密码：发送重置验证码（响应不暴露邮箱是否存在，防枚举） */
export async function forgotPassword(email: string): Promise<{ success: boolean; cooldown_seconds: number }> {
  return request('/api/auth/forgot-password', { method: 'POST', body: { email }, auth: false })
}

/** 重置密码：邮箱验证码 + 新密码（成功后该账号全部会话失效，需重新登录） */
export async function resetPassword(email: string, code: string, newPassword: string): Promise<{ success: boolean }> {
  return request('/api/auth/reset-password', {
    method: 'POST',
    body: { email, code, new_password: newPassword },
    auth: false,
  })
}

/** 注销账号（需登录）：服务端匿名化数据，调用方负责本地凭据清理 */
export async function deleteAccount(): Promise<void> {
  await request('/api/me', { method: 'DELETE' })
}
