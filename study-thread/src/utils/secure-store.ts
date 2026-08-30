import { getPassword, setPassword, deletePassword } from 'tauri-plugin-keyring-api'

/**
 * OS 钥匙串凭据封装（tauri-plugin-keyring）。
 * 安全边界：refresh_token 与官方 api_key 只存于此，绝不进 localStorage。
 * service 固定为应用标识，user 为条目名；get 对不存在的条目返回 null。
 */

const SERVICE = 'com.study-thread.app'
export const REFRESH_TOKEN_USER = 'zhizhi.refresh_token'
export const API_KEY_USER = 'zhizhi.api_key'

export async function getRefreshToken(): Promise<string | null> {
  return getPassword(SERVICE, REFRESH_TOKEN_USER)
}

export async function setRefreshToken(token: string): Promise<void> {
  await setPassword(SERVICE, REFRESH_TOKEN_USER, token)
}

export async function deleteRefreshToken(): Promise<void> {
  try {
    await deletePassword(SERVICE, REFRESH_TOKEN_USER)
  } catch {
    // 条目不存在时幂等（登出/清理可重复执行）
  }
}

export async function getApiKey(): Promise<string | null> {
  return getPassword(SERVICE, API_KEY_USER)
}

export async function setApiKey(key: string): Promise<void> {
  await setPassword(SERVICE, API_KEY_USER, key)
}

export async function deleteApiKey(): Promise<void> {
  try {
    await deletePassword(SERVICE, API_KEY_USER)
  } catch {
    // 幂等
  }
}

/** 清空全部凭据（登出 / 会话过期） */
export async function clearCredentials(): Promise<void> {
  await deleteRefreshToken()
  await deleteApiKey()
}
