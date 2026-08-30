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
  method?: 'GET' | 'POST'
  body?: unknown
  auth?: boolean
  allowRetry?: boolean
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
  const { method = 'GET', body, auth = true, allowRetry = true } = options
  const url = endpoint(path) // 不安全 baseUrl 在 fetch 前即拒绝（UNSAFE_BASE_URL）
  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(auth && apiAccessToken ? { authorization: `Bearer ${apiAccessToken}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ZhizhiApiError('网络连接失败，请检查网络或服务地址', undefined, undefined, 'NETWORK')
  }

  if (res.status === 401 && auth && allowRetry) {
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

export async function sendCode(identifier: string, channel?: 'email' | 'sms'): Promise<{ success: boolean; cooldown_seconds: number }> {
  return request('/api/auth/send-code', { method: 'POST', body: { identifier, ...(channel ? { channel } : {}) }, auth: false })
}

export async function login(identifier: string, code: string, deviceId?: string): Promise<LoginResult> {
  return request('/api/auth/login', { method: 'POST', body: { identifier, code, ...(deviceId ? { device_id: deviceId } : {}) }, auth: false })
}

export async function logout(refreshToken: string): Promise<void> {
  await request('/api/auth/logout', { method: 'POST', body: { refresh_token: refreshToken }, auth: false, allowRetry: false })
}

export async function fetchMe(): Promise<OfficialUser> {
  return request('/api/me')
}

/** 使用钥匙串中的 refresh_token 静默续期（启动恢复 / auth store 主动调用）；成功返回 true */
export async function refreshSession(): Promise<boolean> {
  return (await refreshAccessToken()) !== null
}
