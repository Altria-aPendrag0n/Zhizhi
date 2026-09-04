<template>
  <div class="user-panel">
    <!-- 未登录：登录 / 注册 -->
    <template v-if="!authStore.isOfficialActive">
      <div class="mode-switch" role="tablist">
        <button
          type="button"
          class="mode-switch__item"
          :class="{ 'mode-switch__item--active': mode === 'login' }"
          role="tab"
          :aria-selected="mode === 'login'"
          @click="switchMode('login')"
        >
          登录
        </button>
        <button
          type="button"
          class="mode-switch__item"
          :class="{ 'mode-switch__item--active': mode === 'register' }"
          role="tab"
          :aria-selected="mode === 'register'"
          @click="switchMode('register')"
        >
          注册
        </button>
      </div>

      <!-- 登录：用户名 + 密码 -->
      <form v-if="mode === 'login'" class="login-form" @submit.prevent="handleLogin">
        <div class="form-group">
          <label class="form-label" for="user-username">用户名</label>
          <input
            id="user-username"
            v-model="username"
            type="text"
            class="form-input"
            placeholder="仅数字与大小写字母，3-32 位"
            autocomplete="username"
            :disabled="isBusy"
          />
        </div>
        <div class="form-group">
          <label class="form-label" for="user-password">密码</label>
          <input
            id="user-password"
            v-model="password"
            type="password"
            class="form-input"
            placeholder="仅数字与大小写字母，6-64 位"
            autocomplete="current-password"
            :disabled="isBusy"
          />
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary" :disabled="isBusy">
            {{ isBusy ? '登录中…' : '登录' }}
          </button>
        </div>
      </form>

      <!-- 注册：邮箱验证码（第一步）+ 设置用户名密码（第二步） -->
      <form v-else class="login-form" @submit.prevent="handleRegister">
        <p class="form-hint">注册流程：先用邮箱接收验证码完成验证，再设置用户名与密码（仅数字与大小写字母）。</p>

        <div class="form-group">
          <label class="form-label" for="user-email">邮箱</label>
          <input id="user-email" v-model="email" type="email" class="form-input" placeholder="you@example.com" autocomplete="email" :disabled="isBusy" />
        </div>
        <div class="form-group">
          <label class="form-label" for="user-code">邮箱验证码</label>
          <div class="verify-row">
            <input
              id="user-code"
              v-model="verifyCode"
              type="text"
              class="form-input"
              placeholder="6 位验证码"
              inputmode="numeric"
              :disabled="isBusy"
            />
            <button type="button" class="btn btn-secondary" :disabled="countdown > 0 || isBusy" @click="handleSendCode">
              {{ countdown > 0 ? `${countdown}s` : '获取验证码' }}
            </button>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="user-reg-username">用户名</label>
          <input
            id="user-reg-username"
            v-model="regUsername"
            type="text"
            class="form-input"
            placeholder="仅数字与大小写字母，3-32 位"
            autocomplete="username"
            :disabled="isBusy"
          />
        </div>
        <div class="form-group">
          <label class="form-label" for="user-reg-password">密码</label>
          <input
            id="user-reg-password"
            v-model="regPassword"
            type="password"
            class="form-input"
            placeholder="仅数字与大小写字母，6-64 位"
            autocomplete="new-password"
            :disabled="isBusy"
          />
        </div>
        <div class="form-group">
          <label class="form-label" for="user-reg-password2">确认密码</label>
          <input
            id="user-reg-password2"
            v-model="regPassword2"
            type="password"
            class="form-input"
            placeholder="再次输入密码"
            autocomplete="new-password"
            :disabled="isBusy"
          />
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary" :disabled="isBusy">
            {{ isBusy ? '注册中…' : '注册' }}
          </button>
        </div>
      </form>
    </template>

    <!-- 已登录：账号与套餐状态 -->
    <template v-else>
      <div class="account-card">
        <div class="account-card__row">
          <span class="account-card__label">已登录账号</span>
          <span class="account-card__value">{{ authStore.user?.username ?? '—' }}</span>
        </div>
        <div class="account-card__row">
          <span class="account-card__label">绑定邮箱</span>
          <span class="account-card__value">{{ authStore.user?.identifier ?? '—' }}</span>
        </div>
        <div class="account-card__row">
          <span class="account-card__label">当前套餐</span>
          <span class="account-card__value">{{ authStore.user?.plan?.name ?? '未开通' }}</span>
        </div>
        <div class="account-card__row">
          <span class="account-card__label">剩余额度</span>
          <span class="account-card__value">{{ authStore.user ? formatTokens(authStore.user.quota_tokens) : '—' }}</span>
        </div>
        <p class="form-hint account-card__hint">
          官方 API 已自动启用：Key 安全存储于系统钥匙串，对用户不可见。用量实时扣减，可在「模型配置」中查看使用情况。
        </p>
        <div class="form-actions">
          <button class="btn btn-secondary" :disabled="isBusy" @click="handleLogout">退出登录</button>
          <button
            class="btn btn-danger"
            :class="{ 'btn-danger--confirm': confirmingDelete }"
            :disabled="isBusy"
            @click="handleDeleteAccount"
          >
            {{ confirmingDelete ? '确认注销（不可恢复）' : '注销账号' }}
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { useToast } from '../../composables/useToast'
import { useAuthStore, getLastUsername } from '../../stores/auth'
import { ZhizhiApiError } from '../../api/zhizhi-api'

const toast = useToast()
const authStore = useAuthStore()

type AuthMode = 'login' | 'register'

/** 与服务端一致：仅数字与大小写字母 */
const USERNAME_RE = /^[A-Za-z0-9]{3,32}$/
const PASSWORD_RE = /^[A-Za-z0-9]{6,64}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const mode = ref<AuthMode>('login')
// 登录
const username = ref(getLastUsername())
const password = ref('')
// 注册
const email = ref('')
const verifyCode = ref('')
const regUsername = ref('')
const regPassword = ref('')
const regPassword2 = ref('')
const countdown = ref(0)
let countdownTimer: ReturnType<typeof setInterval> | null = null

const isBusy = computed(() => authStore.status === 'authenticating')

// ===== 注销账号（上线方案 S7/S8）：两击确认，4 秒未确认自动复位 =====

const confirmingDelete = ref(false)
let deleteConfirmTimer: ReturnType<typeof setTimeout> | null = null

async function handleDeleteAccount() {
  if (!confirmingDelete.value) {
    confirmingDelete.value = true
    if (deleteConfirmTimer) clearTimeout(deleteConfirmTimer)
    deleteConfirmTimer = setTimeout(() => {
      confirmingDelete.value = false
    }, 4000)
    return
  }
  if (deleteConfirmTimer) clearTimeout(deleteConfirmTimer)
  confirmingDelete.value = false
  try {
    await authStore.deleteAccount()
    toast.success('账号已注销，本地凭据已清除')
  } catch (err) {
    toast.error(err instanceof ZhizhiApiError ? err.message : '注销失败，请稍后再试')
  }
}

function switchMode(next: AuthMode) {
  if (mode.value === next || isBusy.value) return
  mode.value = next
  verifyCode.value = ''
  countdown.value = 0
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M tokens`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K tokens`
  return `${tokens} tokens`
}

function messageOf(err: unknown): string {
  if (err instanceof ZhizhiApiError) return err.message
  return err instanceof Error ? err.message : '操作失败，请稍后再试'
}

function startCountdown(seconds: number) {
  countdown.value = seconds
  if (countdownTimer) clearInterval(countdownTimer)
  countdownTimer = setInterval(() => {
    countdown.value -= 1
    if (countdown.value <= 0 && countdownTimer) {
      clearInterval(countdownTimer)
      countdownTimer = null
    }
  }, 1000)
}

async function handleSendCode() {
  const identifier = email.value.trim()
  if (!EMAIL_RE.test(identifier)) {
    toast.error('请输入有效的邮箱地址')
    return
  }
  if (countdown.value > 0 || isBusy.value) return
  try {
    const seconds = await authStore.sendCode(identifier)
    startCountdown(seconds)
    toast.success('验证码已发送，请查收（开发阶段见服务端日志）')
  } catch (err) {
    toast.error(messageOf(err))
  }
}

async function handleLogin() {
  const name = username.value.trim()
  const pwd = password.value
  if (!name || !pwd) {
    toast.error('请输入用户名与密码')
    return
  }
  try {
    await authStore.login(name, pwd)
    toast.success('登录成功，官方 API 已启用')
  } catch (err) {
    toast.error(messageOf(err))
  }
}

async function handleRegister() {
  const mail = email.value.trim()
  const code = verifyCode.value.trim()
  const name = regUsername.value.trim()
  const pwd = regPassword.value
  if (!EMAIL_RE.test(mail)) {
    toast.error('请输入有效的邮箱地址')
    return
  }
  if (!/^\d{6}$/.test(code)) {
    toast.error('请输入 6 位验证码')
    return
  }
  if (!USERNAME_RE.test(name)) {
    toast.error('用户名仅允许 3-32 位数字与大小写字母')
    return
  }
  if (!PASSWORD_RE.test(pwd)) {
    toast.error('密码仅允许 6-64 位数字与大小写字母')
    return
  }
  if (pwd !== regPassword2.value) {
    toast.error('两次输入的密码不一致')
    return
  }
  try {
    await authStore.register(mail, code, name, pwd)
    toast.success('注册成功，已自动登录')
  } catch (err) {
    toast.error(messageOf(err))
  }
}

async function handleLogout() {
  await authStore.logout()
  toast.success('已退出登录')
  username.value = ''
  password.value = ''
  email.value = ''
  verifyCode.value = ''
  regUsername.value = ''
  regPassword.value = ''
  regPassword2.value = ''
}

onUnmounted(() => {
  if (countdownTimer) clearInterval(countdownTimer)
  if (deleteConfirmTimer) clearTimeout(deleteConfirmTimer)
})
</script>

<style scoped>
.user-panel {
  max-width: 440px;
}

.mode-switch {
  display: inline-flex;
  gap: 2px;
  margin-bottom: 14px;
  padding: 3px;
  border-radius: var(--r-md);
  background: var(--surface-2);
}

.mode-switch__item {
  padding: 6px 22px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--ink-2);
  font: inherit;
  font-size: 13px;
  font-weight: 590;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.mode-switch__item--active {
  background: var(--surface);
  color: var(--ink);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.form-hint {
  margin: 0 0 14px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--ink-2);
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: 13px;
  font-weight: 590;
  color: var(--ink);
}

.form-input {
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
  color: var(--ink);
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s;
}

.form-input:focus {
  border-color: var(--brand);
}

.form-input:disabled {
  opacity: 0.6;
}

.verify-row {
  display: flex;
  gap: 8px;
}

.verify-row .form-input {
  flex: 1;
}

.form-actions {
  display: flex;
  gap: 12px;
  margin-top: 4px;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 20px;
  border: 0;
  border-radius: var(--r-md);
  font-size: 13px;
  font-weight: 590;
  cursor: pointer;
  transition: background 0.15s, opacity 0.15s;
}

.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.btn-primary {
  color: var(--brand-ink);
  background: var(--brand);
}

.btn-primary:hover:not(:disabled) {
  background: var(--brand-strong);
}

.btn-secondary {
  color: var(--ink);
  background: var(--surface-2);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--line);
}

.btn-danger {
  color: var(--state-error);
  background: color-mix(in srgb, var(--state-error) 10%, transparent);
}

.btn-danger--confirm {
  color: #fff;
  background: var(--state-error);
}

.account-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.account-card__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--line);
}

.account-card__label {
  font-size: 12px;
  color: var(--ink-2);
}

.account-card__value {
  font-size: 13px;
  font-weight: 590;
  color: var(--ink);
}

.account-card__hint {
  margin: 6px 0 0;
}
</style>
