<template>
  <div class="user-panel">
    <!-- 未登录：登录 / 注册表单 -->
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

      <p class="form-hint">
        {{
          mode === 'login'
            ? '登录知枝账号后自动启用官方 API，官方 Key 由服务端下发并安全存储在系统钥匙串中。'
            : '注册新账号：填写账号并通过验证码验证后即自动创建（首次登录即注册），无需单独设置密码。'
        }}
      </p>

      <div class="login-form">
        <div class="form-group">
          <label class="form-label" for="user-account">账号（邮箱 / 手机号）</label>
          <input
            id="user-account"
            v-model="account"
            type="text"
            class="form-input"
            placeholder="you@example.com"
            :disabled="isBusy"
          />
        </div>

        <div class="form-group">
          <label class="form-label" for="user-code">验证码</label>
          <div class="verify-row">
            <input
              id="user-code"
              v-model="verifyCode"
              type="text"
              class="form-input"
              placeholder="6 位验证码"
              :disabled="isBusy"
            />
            <button class="btn btn-secondary" :disabled="countdown > 0 || isBusy" @click="handleSendCode">
              {{ countdown > 0 ? `${countdown}s` : '获取验证码' }}
            </button>
          </div>
        </div>

        <div class="form-actions">
          <button class="btn btn-primary" :disabled="isBusy" @click="handleSubmit">
            {{ submitLabel }}
          </button>
        </div>
      </div>
    </template>

    <!-- 已登录：账号与套餐状态 -->
    <template v-else>
      <div class="account-card">
        <div class="account-card__row">
          <span class="account-card__label">已登录账号</span>
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
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { useToast } from '../../composables/useToast'
import { useAuthStore } from '../../stores/auth'
import { ZhizhiApiError } from '../../api/zhizhi-api'

const toast = useToast()
const authStore = useAuthStore()

type AuthMode = 'login' | 'register'

const mode = ref<AuthMode>('login')
const account = ref('')
const verifyCode = ref('')
const countdown = ref(0)
let countdownTimer: ReturnType<typeof setInterval> | null = null

const isBusy = computed(() => authStore.status === 'authenticating')

const submitLabel = computed(() => {
  if (isBusy.value) return mode.value === 'register' ? '注册中…' : '登录中…'
  return mode.value === 'register' ? '注册' : '登录'
})

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
  const identifier = account.value.trim()
  if (!identifier) {
    toast.error('请先输入账号（邮箱或手机号）')
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

async function handleSubmit() {
  const identifier = account.value.trim()
  const code = verifyCode.value.trim()
  if (!identifier || !code) {
    toast.error('请输入账号与验证码')
    return
  }
  try {
    await authStore.login(identifier, code)
    toast.success(mode.value === 'register' ? '注册成功，已自动登录' : '登录成功，官方 API 已启用')
  } catch (err) {
    toast.error(messageOf(err))
  }
}

async function handleLogout() {
  await authStore.logout()
  toast.success('已退出登录')
  account.value = ''
  verifyCode.value = ''
}

onUnmounted(() => {
  if (countdownTimer) clearInterval(countdownTimer)
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
