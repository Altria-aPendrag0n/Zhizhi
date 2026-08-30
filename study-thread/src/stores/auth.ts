import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { OfficialUser } from '../types'
import * as zhizhiApi from '../api/zhizhi-api'
import { clearCredentials, getApiKey, getRefreshToken, setApiKey, setRefreshToken } from '../utils/secure-store'
import { useSettingsStore } from './settings'

export type AuthStatus = 'anonymous' | 'authenticating' | 'authenticated'

/**
 * 知枝官方账号状态机。
 * 凭据边界：access_token / api_key 仅存内存（来自钥匙串，不落盘）；
 * refresh_token 仅存钥匙串，由 zhizhi-api 在轮换时读写。
 */
export const useAuthStore = defineStore('auth', () => {
  const status = ref<AuthStatus>('anonymous')
  const user = ref<OfficialUser | null>(null)
  const accessToken = ref('')
  const apiKey = ref('')

  const isOfficialActive = computed(() => status.value === 'authenticated')

  function syncBaseUrl() {
    zhizhiApi.setApiBaseUrl(useSettingsStore().officialApiBaseUrl)
  }

  function reset() {
    status.value = 'anonymous'
    user.value = null
    accessToken.value = ''
    apiKey.value = ''
    zhizhiApi.setApiAccessToken('')
    useSettingsStore().officialApiEnabled = false
  }

  /** 401 单飞刷新后同步镜像（令牌轮换写钥匙串已由 zhizhi-api 完成） */
  zhizhiApi.setOnTokensRefreshed((newAccessToken) => {
    accessToken.value = newAccessToken
  })

  async function sendCode(identifier: string): Promise<number> {
    const result = await zhizhiApi.sendCode(identifier)
    return result.cooldown_seconds
  }

  /** 登录成功后的公共落地逻辑：写钥匙串 + 内存 token + 启用官方 API + 拉取 /me */
  async function settleAuth(result: { access_token: string; refresh_token: string; user: OfficialUser; api_key?: string }): Promise<void> {
    await setRefreshToken(result.refresh_token)
    if (result.api_key) await setApiKey(result.api_key)
    accessToken.value = result.access_token
    zhizhiApi.setApiAccessToken(result.access_token)
    apiKey.value = result.api_key ?? (await getApiKey()) ?? ''
    user.value = result.user
    useSettingsStore().officialApiEnabled = true
    status.value = 'authenticated'
    await fetchMe().catch(() => {})
  }

  /** 用户名 + 密码登录 */
  async function login(username: string, password: string): Promise<void> {
    status.value = 'authenticating'
    try {
      syncBaseUrl()
      const result = await zhizhiApi.login(username, password)
      await settleAuth(result)
    } catch (err) {
      reset()
      throw err
    }
  }

  /** 邮箱注册（验证码 + 设置用户名/密码），成功后自动登录 */
  async function register(email: string, code: string, username: string, password: string): Promise<void> {
    status.value = 'authenticating'
    try {
      syncBaseUrl()
      const result = await zhizhiApi.register({ email, code, username, password })
      await settleAuth(result)
    } catch (err) {
      reset()
      throw err
    }
  }

  /** 应用启动：钥匙串有 refresh_token 则静默续期恢复会话；失败清凭据回匿名（不打扰用户） */
  async function restore(): Promise<void> {
    syncBaseUrl()
    if (!(await getRefreshToken())) return
    await silentRefresh()
  }

  async function silentRefresh(): Promise<boolean> {
    syncBaseUrl()
    const ok = await zhizhiApi.refreshSession()
    if (!ok) {
      await clearCredentials()
      reset()
      return false
    }
    accessToken.value = zhizhiApi.getApiAccessToken()
    apiKey.value = (await getApiKey()) ?? ''
    if (!apiKey.value) {
      // 钥匙串缺官方 Key（异常态）：视为未登录，要求重新登录
      await clearCredentials()
      reset()
      return false
    }
    useSettingsStore().officialApiEnabled = true
    status.value = 'authenticated'
    await fetchMe().catch(() => {})
    return true
  }

  /** 拉取最新用户/套餐/额度（登录后、设置页打开、购买后调用） */
  async function fetchMe(): Promise<void> {
    const me = await zhizhiApi.fetchMe()
    user.value = me
  }

  /** 登出：服务端吊销尽力而为（不可达也本地登出）；清钥匙串与内存 */
  async function logout(): Promise<void> {
    const refreshToken = await getRefreshToken()
    try {
      if (refreshToken) await zhizhiApi.logout(refreshToken)
    } catch {
      // 服务端不可达不阻塞本地登出
    }
    await clearCredentials()
    reset()
  }

  return {
    status,
    user,
    accessToken,
    apiKey,
    isOfficialActive,
    sendCode,
    login,
    register,
    restore,
    silentRefresh,
    fetchMe,
    logout,
  }
})
