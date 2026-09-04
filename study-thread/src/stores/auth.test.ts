import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore, getLastUsername, getRememberPreference } from './auth'
import { useSettingsStore } from './settings'

const zhizhi = vi.hoisted(() => ({
  sendCode: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  fetchMe: vi.fn(),
  refreshSession: vi.fn(),
  setApiAccessToken: vi.fn(),
  setApiBaseUrl: vi.fn(),
  getApiAccessToken: vi.fn(),
  setOnTokensRefreshed: vi.fn(),
}))

const secure = vi.hoisted(() => ({
  getRefreshToken: vi.fn(),
  setRefreshToken: vi.fn(),
  getApiKey: vi.fn(),
  setApiKey: vi.fn(),
  clearCredentials: vi.fn(),
}))

vi.mock('../api/zhizhi-api', () => zhizhi)
vi.mock('../utils/secure-store', () => secure)

const USER = {
  id: 'u1',
  identifier: 'a@b.com',
  username: 'Alice2026',
  plan_id: null,
  plan_expires_at: null,
  quota_tokens: 500,
  api_key_created: true,
  plan: null,
}

describe('auth store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    Object.values(zhizhi).forEach((fn) => (fn as ReturnType<typeof vi.fn>).mockReset())
    Object.values(secure).forEach((fn) => (fn as ReturnType<typeof vi.fn>).mockReset())
    secure.getRefreshToken.mockResolvedValue(null)
    secure.getApiKey.mockResolvedValue(null)
  })

  it('sendCode 返回冷却秒数', async () => {
    zhizhi.sendCode.mockResolvedValue({ success: true, cooldown_seconds: 60 })
    const store = useAuthStore()
    await expect(store.sendCode('a@b.com')).resolves.toBe(60)
    expect(zhizhi.sendCode).toHaveBeenCalledWith('a@b.com')
  })

  it('login（用户名+密码）成功：写钥匙串、内存 token、启用官方 API', async () => {
    zhizhi.login.mockResolvedValue({ access_token: 'at', refresh_token: 'rt', user: USER })
    secure.getApiKey.mockResolvedValue('sk-zhizhi-x')
    zhizhi.fetchMe.mockResolvedValue(USER)

    const store = useAuthStore()
    await store.login('Alice2026', 'Passw0rd')

    expect(zhizhi.login).toHaveBeenCalledWith('Alice2026', 'Passw0rd')
    expect(secure.setRefreshToken).toHaveBeenCalledWith('rt')
    expect(secure.setApiKey).not.toHaveBeenCalled()
    expect(store.status).toBe('authenticated')
    expect(store.isOfficialActive).toBe(true)
    expect(store.user?.username).toBe('Alice2026')
    expect(store.apiKey).toBe('sk-zhizhi-x')
    expect(useSettingsStore().officialApiEnabled).toBe(true)
    // officialApiEnabled 必须随登录立即持久化：重启后凭据恢复与通道开关才一致
    const persisted = JSON.parse(localStorage.getItem('study-thread-settings')!)
    expect(persisted.officialApiEnabled).toBe(true)
    expect(zhizhi.fetchMe).toHaveBeenCalled()
  })

  it('login 失败：回匿名并抛出错误', async () => {
    zhizhi.login.mockRejectedValue(new Error('用户名或密码错误'))
    const store = useAuthStore()
    await expect(store.login('Alice2026', 'WrongPass')).rejects.toThrow('用户名或密码错误')
    expect(store.status).toBe('anonymous')
    expect(store.isOfficialActive).toBe(false)
  })

  it('login 默认记住密码：写用户名与 remember 偏好，getLastUsername 可读取', async () => {
    zhizhi.login.mockResolvedValue({ access_token: 'at', refresh_token: 'rt', user: USER })
    zhizhi.fetchMe.mockResolvedValue(USER)

    const store = useAuthStore()
    await store.login('Alice2026', 'Passw0rd')

    expect(JSON.parse(localStorage.getItem('zhizhi.auth.last-username')!)).toBe('Alice2026')
    expect(JSON.parse(localStorage.getItem('zhizhi.auth.remember')!)).toBe(true)
    expect(getLastUsername()).toBe('Alice2026')
    expect(getRememberPreference()).toBe(true)
  })

  it('login(remember=false)：本会话保持登录，重启后 restore 清凭据且不自动登录', async () => {
    zhizhi.login.mockResolvedValue({ access_token: 'at', refresh_token: 'rt', user: USER })
    zhizhi.fetchMe.mockResolvedValue(USER)

    const store = useAuthStore()
    await store.login('Alice2026', 'Passw0rd', false)
    expect(store.status).toBe('authenticated')
    expect(JSON.parse(localStorage.getItem('zhizhi.auth.remember')!)).toBe(false)

    // 模拟重启：新 Pinia 实例 + restore 应依据 remember=false 清残留凭据、保持匿名
    setActivePinia(createPinia())
    const fresh = useAuthStore()
    await fresh.restore()
    expect(secure.clearCredentials).toHaveBeenCalled()
    expect(zhizhi.refreshSession).not.toHaveBeenCalled()
    expect(fresh.status).toBe('anonymous')
    // 官方通道必须一并关闭并持久化（否则重启后 officialApiEnabled=true 而 apiKey 为空，发消息会跳设置页）
    expect(useSettingsStore().officialApiEnabled).toBe(false)
    const persisted = JSON.parse(localStorage.getItem('study-thread-settings')!)
    expect(persisted.officialApiEnabled).toBe(false)
    // 用户名记忆不受「记住密码」影响，重启后仍可预填
    expect(getLastUsername()).toBe('Alice2026')
  })

  it('register 成功：注册自动登录，api_key 写入钥匙串', async () => {
    zhizhi.register.mockResolvedValue({ access_token: 'at', refresh_token: 'rt', user: USER, api_key: 'sk-zhizhi-x' })
    zhizhi.fetchMe.mockResolvedValue(USER)

    const store = useAuthStore()
    await store.register('a@b.com', '123456', 'Alice2026', 'Passw0rd')

    expect(zhizhi.register).toHaveBeenCalledWith({ email: 'a@b.com', code: '123456', username: 'Alice2026', password: 'Passw0rd' })
    expect(secure.setRefreshToken).toHaveBeenCalledWith('rt')
    expect(secure.setApiKey).toHaveBeenCalledWith('sk-zhizhi-x')
    expect(store.status).toBe('authenticated')
    expect(store.apiKey).toBe('sk-zhizhi-x')
    expect(useSettingsStore().officialApiEnabled).toBe(true)
  })

  it('register 失败：回匿名并抛出错误', async () => {
    zhizhi.register.mockRejectedValue(new Error('username already taken'))
    const store = useAuthStore()
    await expect(store.register('a@b.com', '123456', 'Alice2026', 'Passw0rd')).rejects.toThrow('username already taken')
    expect(store.status).toBe('anonymous')
  })

  it('restore 无钥匙串凭据：保持匿名', async () => {
    const store = useAuthStore()
    await store.restore()
    expect(store.status).toBe('anonymous')
    expect(zhizhi.refreshSession).not.toHaveBeenCalled()
  })

  it('restore 有凭据且刷新成功：恢复已登录', async () => {
    secure.getRefreshToken.mockResolvedValue('rt-old')
    zhizhi.refreshSession.mockResolvedValue(true)
    zhizhi.getApiAccessToken.mockReturnValue('at-new')
    secure.getApiKey.mockResolvedValue('sk-zhizhi-x')
    zhizhi.fetchMe.mockResolvedValue(USER)

    const store = useAuthStore()
    await store.restore()

    expect(zhizhi.refreshSession).toHaveBeenCalled()
    expect(store.status).toBe('authenticated')
    expect(store.apiKey).toBe('sk-zhizhi-x')
    expect(useSettingsStore().officialApiEnabled).toBe(true)
  })

  it('restore 刷新失败：清凭据回匿名', async () => {
    secure.getRefreshToken.mockResolvedValue('rt-old')
    zhizhi.refreshSession.mockResolvedValue(false)

    const store = useAuthStore()
    await store.restore()

    expect(secure.clearCredentials).toHaveBeenCalled()
    expect(store.status).toBe('anonymous')
    // 官方通道关闭并持久化（本地服务端不可达时不能残留「使用中」空凭据状态）
    expect(useSettingsStore().officialApiEnabled).toBe(false)
    expect(JSON.parse(localStorage.getItem('study-thread-settings')!).officialApiEnabled).toBe(false)
  })

  it('restore 刷新成功但钥匙串缺官方 Key：回匿名', async () => {
    secure.getRefreshToken.mockResolvedValue('rt-old')
    zhizhi.refreshSession.mockResolvedValue(true)
    zhizhi.getApiAccessToken.mockReturnValue('at-new')
    secure.getApiKey.mockResolvedValue(null)

    const store = useAuthStore()
    await store.restore()

    expect(secure.clearCredentials).toHaveBeenCalled()
    expect(store.status).toBe('anonymous')
  })

  it('logout：调服务端吊销并清空凭据', async () => {
    secure.getRefreshToken.mockResolvedValue('rt-old')
    const store = useAuthStore()
    await store.logout()

    expect(zhizhi.logout).toHaveBeenCalledWith('rt-old')
    expect(secure.clearCredentials).toHaveBeenCalled()
    expect(store.status).toBe('anonymous')
    expect(useSettingsStore().officialApiEnabled).toBe(false)
    expect(JSON.parse(localStorage.getItem('study-thread-settings')!).officialApiEnabled).toBe(false)
  })

  it('fetchMe 更新 user（额度同步）', async () => {
    zhizhi.fetchMe.mockResolvedValue({ ...USER, quota_tokens: 900 })
    const store = useAuthStore()
    await store.fetchMe()
    expect(store.user?.quota_tokens).toBe(900)
  })
})
