import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from './zhizhi-api'

const state = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  getRefreshToken: vi.fn(),
  setRefreshToken: vi.fn(),
  clearCredentials: vi.fn(),
}))

vi.mock('../utils/secure-store', () => ({
  getRefreshToken: state.getRefreshToken,
  setRefreshToken: state.setRefreshToken,
  clearCredentials: state.clearCredentials,
}))

vi.stubGlobal('fetch', state.fetchMock)

const BASE = 'http://127.0.0.1:8787'

function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as Response
}

const ME_BODY = {
  id: 'u1',
  identifier: 'a@b.com',
  username: 'Alice2026',
  plan_id: null,
  plan_expires_at: null,
  quota_tokens: 1000,
  api_key_created: true,
  plan: null,
}

describe('zhizhi-api', () => {
  beforeEach(() => {
    state.fetchMock.mockReset()
    state.getRefreshToken.mockReset()
    state.setRefreshToken.mockReset()
    state.clearCredentials.mockReset()
    api.setApiBaseUrl(BASE)
    api.setApiAccessToken('')
    api.setOnTokensRefreshed(null)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.stubGlobal('fetch', state.fetchMock)
  })

  it('login（用户名+密码）发送正确请求并解析响应', async () => {
    state.fetchMock.mockResolvedValue(
      jsonResponse(200, { access_token: 'at1', refresh_token: 'rt1', user: ME_BODY }),
    )
    const result = await api.login('Alice2026', 'Passw0rd')
    expect(result.access_token).toBe('at1')
    expect(result.api_key).toBeUndefined()

    const [url, init] = state.fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${BASE}/api/auth/login`)
    expect(JSON.parse(String(init.body))).toEqual({ username: 'Alice2026', password: 'Passw0rd' })
  })

  it('createApiKey 携带 access_token 请求 /api/keys 并解析明文 Key', async () => {
    api.setApiAccessToken('at-token')
    state.fetchMock.mockResolvedValue(
      jsonResponse(201, { id: 'k1', key: 'sk-zhizhi-new', key_preview: 'sk-zhizhi-new…' }),
    )
    const result = await api.createApiKey()

    expect(result.key).toBe('sk-zhizhi-new')
    const [url, init] = state.fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${BASE}/api/keys`)
    expect(init.headers).toMatchObject({ authorization: 'Bearer at-token' })
    expect(JSON.parse(String(init.body))).toEqual({ purpose: 'chat' })
  })

  it('register 发送邮箱/验证码/用户名/密码并解析 api_key', async () => {
    state.fetchMock.mockResolvedValue(
      jsonResponse(200, { access_token: 'at1', refresh_token: 'rt1', user: ME_BODY, api_key: 'sk-zhizhi-abc' }),
    )
    const result = await api.register({ email: 'a@b.com', code: '123456', username: 'Alice2026', password: 'Passw0rd' })
    expect(result.api_key).toBe('sk-zhizhi-abc')

    const [url, init] = state.fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${BASE}/api/auth/register`)
    expect(JSON.parse(String(init.body))).toEqual({
      email: 'a@b.com',
      code: '123456',
      username: 'Alice2026',
      password: 'Passw0rd',
    })
  })

  it('不安全 baseUrl 拒绝注入令牌（不发请求）', async () => {
    api.setApiBaseUrl('http://evil.example.com')
    await expect(api.fetchMe()).rejects.toMatchObject({ code: 'UNSAFE_BASE_URL' })
    expect(state.fetchMock).not.toHaveBeenCalled()
  })

  it('网络错误归一为 NETWORK', async () => {
    state.fetchMock.mockRejectedValue(new TypeError('fetch failed'))
    await expect(api.sendCode('a@b.com')).rejects.toMatchObject({ code: 'NETWORK' })
  })

  it('429 抛 RATE_LIMITED 并携带冷却秒数', async () => {
    state.fetchMock.mockResolvedValue(jsonResponse(429, { error: 'cooldown', cooldown_seconds: 30 }))
    await expect(api.sendCode('a@b.com')).rejects.toMatchObject({ code: 'RATE_LIMITED', retryAfterSeconds: 30 })
  })

  it('并发 401 只触发一次 refresh（single-flight），重放成功', async () => {
    state.getRefreshToken.mockResolvedValue('rt-old')
    let refreshCalls = 0
    state.fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith('/api/auth/refresh')) {
        refreshCalls += 1
        return Promise.resolve(jsonResponse(200, { access_token: 'at-new', refresh_token: 'rt-new' }))
      }
      if (init?.headers && (init.headers as Record<string, string>).authorization === 'Bearer at-new') {
        return Promise.resolve(jsonResponse(200, ME_BODY))
      }
      return Promise.resolve(jsonResponse(401, { error: 'unauthorized' }))
    })

    const [r1, r2] = await Promise.all([api.fetchMe(), api.fetchMe()])
    expect(refreshCalls).toBe(1)
    expect(r1.id).toBe('u1')
    expect(r2.id).toBe('u1')
    expect(state.setRefreshToken).toHaveBeenCalledWith('rt-new')
    expect(api.getApiAccessToken()).toBe('at-new')
  })

  it('刷新失败清空凭据并抛 SESSION_EXPIRED', async () => {
    state.getRefreshToken.mockResolvedValue('rt-old')
    state.fetchMock.mockResolvedValue(jsonResponse(401, { error: 'unauthorized' }))
    await expect(api.fetchMe()).rejects.toMatchObject({ code: 'SESSION_EXPIRED' })
    expect(state.clearCredentials).toHaveBeenCalled()
  })

  it('refreshSession 成功返回 true 并写回新 refresh_token', async () => {
    state.getRefreshToken.mockResolvedValue('rt-old')
    state.fetchMock.mockResolvedValue(jsonResponse(200, { access_token: 'at-new', refresh_token: 'rt-new' }))
    expect(await api.refreshSession()).toBe(true)
    expect(state.setRefreshToken).toHaveBeenCalledWith('rt-new')
  })

  it('refreshSession 无钥匙串凭据返回 false', async () => {
    state.getRefreshToken.mockResolvedValue(null)
    expect(await api.refreshSession()).toBe(false)
    expect(state.fetchMock).not.toHaveBeenCalled()
  })
})
