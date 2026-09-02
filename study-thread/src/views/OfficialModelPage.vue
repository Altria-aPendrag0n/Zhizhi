<template>
  <div class="official-model-page">
    <div class="settings-page__header">
      <button type="button" class="back-link" @click="goBack">
        <ArrowLeft :size="14" />
        返回模型配置
      </button>
      <div class="eyebrow">Official API</div>
      <h1 class="settings-page__title">知枝官方 API</h1>
      <p class="settings-page__subtitle">开箱即用的云服务：注册/登录账号后自动启用，API Key 对用户不可见</p>
    </div>

    <!-- 登录引导 / 已登录态 -->
    <section class="card-block">
      <h3 class="card-block__title">知枝账号</h3>

      <!-- 未登录：登录 / 注册 / 重置密码 -->
      <template v-if="!authStore.isOfficialActive">
        <div v-if="mode !== 'reset'" class="mode-switch" role="tablist">
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
          <p class="form-hint">使用用户名与密码登录。登录后自动启用官方 API，官方密钥由服务端下发并安全存储在系统钥匙串中。</p>
          <div class="form-group">
            <label class="form-label" for="account-username">用户名</label>
            <input id="account-username" v-model="username" type="text" class="form-input" placeholder="仅数字与大小写字母，3-32 位" autocomplete="username" :disabled="isBusy" />
          </div>
          <div class="form-group">
            <label class="form-label" for="account-password">密码</label>
            <input id="account-password" v-model="password" type="password" class="form-input" placeholder="仅数字与大小写字母，6-64 位" autocomplete="current-password" :disabled="isBusy" />
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary" :disabled="isBusy">
              {{ isBusy ? '登录中…' : '登录' }}
            </button>
            <button type="button" class="forgot-link" @click="switchMode('reset')">忘记密码？</button>
          </div>
        </form>

        <!-- 重置密码：邮箱验证码 + 新密码 -->
        <form v-else-if="mode === 'reset'" class="login-form" @submit.prevent="handleResetPassword">
          <p class="form-hint">输入注册邮箱获取重置验证码；重置成功后请使用新密码重新登录，原登录会话将全部失效。</p>
          <div class="form-group">
            <label class="form-label" for="reset-email">注册邮箱</label>
            <input id="reset-email" v-model="resetEmail" type="email" class="form-input" placeholder="you@example.com" autocomplete="email" :disabled="resetSubmitting" />
          </div>
          <div class="form-group">
            <label class="form-label" for="reset-code">邮箱验证码</label>
            <div class="verify-row">
              <input id="reset-code" v-model="resetCode" type="text" class="form-input" placeholder="6 位验证码" inputmode="numeric" :disabled="resetSubmitting" />
              <button type="button" class="btn btn-secondary" :disabled="resetCountdown > 0 || resetSending" @click="handleResetSendCode">
                {{ resetCountdown > 0 ? `${resetCountdown}s` : '获取验证码' }}
              </button>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label" for="reset-password">新密码</label>
            <input id="reset-password" v-model="resetPassword1" type="password" class="form-input" placeholder="仅数字与大小写字母，6-64 位" autocomplete="new-password" :disabled="resetSubmitting" />
          </div>
          <div class="form-group">
            <label class="form-label" for="reset-password2">确认新密码</label>
            <input id="reset-password2" v-model="resetPassword2" type="password" class="form-input" placeholder="再次输入新密码" autocomplete="new-password" :disabled="resetSubmitting" />
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary" :disabled="resetSubmitting">
              {{ resetSubmitting ? '重置中…' : '重置密码' }}
            </button>
            <button type="button" class="forgot-link" @click="switchMode('login')">返回登录</button>
          </div>
        </form>

        <!-- 注册：邮箱验证码 + 设置用户名密码 -->
        <form v-else class="login-form" @submit.prevent="handleRegister">
          <p class="form-hint">注册流程：先用邮箱接收验证码完成验证，再设置用户名与密码（仅数字与大小写字母）。注册成功即自动登录。</p>
          <div class="form-group">
            <label class="form-label" for="account-email">邮箱</label>
            <input id="account-email" v-model="email" type="email" class="form-input" placeholder="you@example.com" autocomplete="email" :disabled="isBusy" />
          </div>
          <div class="form-group">
            <label class="form-label" for="account-code">邮箱验证码</label>
            <div class="verify-row">
              <input id="account-code" v-model="verifyCode" type="text" class="form-input" placeholder="6 位验证码" inputmode="numeric" :disabled="isBusy" />
              <button type="button" class="btn btn-secondary" :disabled="countdown > 0 || isBusy" @click="handleSendCode">
                {{ countdown > 0 ? `${countdown}s` : '获取验证码' }}
              </button>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label" for="account-reg-username">用户名</label>
            <input id="account-reg-username" v-model="regUsername" type="text" class="form-input" placeholder="仅数字与大小写字母，3-32 位" autocomplete="username" :disabled="isBusy" />
          </div>
          <div class="form-group">
            <label class="form-label" for="account-reg-password">密码</label>
            <input id="account-reg-password" v-model="regPassword" type="password" class="form-input" placeholder="仅数字与大小写字母，6-64 位" autocomplete="new-password" :disabled="isBusy" />
          </div>
          <div class="form-group">
            <label class="form-label" for="account-reg-password2">确认密码</label>
            <input id="account-reg-password2" v-model="regPassword2" type="password" class="form-input" placeholder="再次输入密码" autocomplete="new-password" :disabled="isBusy" />
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
            <span class="account-card__label">套餐到期</span>
            <span class="account-card__value">{{ formatExpiry(authStore.user?.plan_expires_at) }}</span>
          </div>
          <div class="account-card__row">
            <span class="account-card__label">剩余额度</span>
            <span class="account-card__value">{{ authStore.user ? formatTokens(authStore.user.quota_tokens) : '—' }}</span>
          </div>
          <p class="form-hint account-card__hint">
            官方 API 已自动启用：Key 安全存储于系统钥匙串，对用户不可见。用量实时扣减。
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
            <button class="btn btn-secondary" @click="goBack">完成</button>
          </div>
        </div>
      </template>
    </section>

    <!-- 套餐中心：兑换码 + 用量 + 套餐列表 -->
    <section class="card-block">
      <h3 class="card-block__title">套餐中心</h3>

      <!-- 已登录：兑换码输入 + 近 30 天用量 -->
      <template v-if="authStore.isOfficialActive">
        <div class="redeem-row">
          <input
            v-model="redeemCode"
            type="text"
            class="form-input redeem-input"
            placeholder="输入兑换码，如 zhizhi-XXXX-XXXX-XXXX"
            :disabled="redeeming"
            @keyup.enter="handleRedeem"
          />
          <button class="btn btn-primary" :disabled="redeeming" @click="handleRedeem">
            {{ redeeming ? '兑换中…' : '兑换' }}
          </button>
        </div>

        <div v-if="usage" class="usage-block">
          <div class="usage-head">
            近 {{ usage.days }} 天：{{ usage.totals.requests }} 次请求 ·
            {{ formatTokens(usage.totals.prompt_tokens + usage.totals.completion_tokens) }}
          </div>
          <div v-if="usageBars.length" class="usage-chart" role="img" aria-label="近 30 天每日请求柱状图">
            <div v-for="bar in usageBars" :key="bar.day" class="usage-col" :title="bar.day">
              <div class="usage-bar" :style="{ height: bar.height + '%' }"></div>
              <span class="usage-day">{{ bar.day }}</span>
            </div>
          </div>
          <p v-else class="form-hint">近 {{ usage.days }} 天暂无用量记录</p>
        </div>
      </template>

      <div class="plan-grid">
        <div v-for="plan in plans" :key="plan.id" class="plan-card">
          <div class="plan-card__name">{{ plan.name }}</div>
          <div class="plan-card__price">{{ formatPrice(plan.price_cents) }}</div>
          <ul class="plan-card__features">
            <li>每期 {{ formatTokens(plan.token_quota) }}</li>
            <li>模型分组：{{ plan.model_group ?? 'default' }}</li>
            <li>兑换码开通，即买即用</li>
          </ul>
          <button class="btn btn-secondary btn--block" @click="handleBuy(plan)">
            {{ authStore.isOfficialActive ? '兑换开通' : '登录后兑换' }}
          </button>
        </div>
        <p v-if="!plans.length" class="form-hint">套餐加载中…（服务端不可达时为空）</p>
      </div>
    </section>

    <!-- 自动配置说明 -->
    <section class="card-block">
      <h3 class="card-block__title">如何工作</h3>
      <ol class="how-list">
        <li>注册知枝账号（邮箱验证 + 设置用户名密码），或使用用户名密码登录；</li>
        <li>官方 API Key 由服务端生成并自动下发，存储在系统钥匙串中（Key 对用户不可见，不可导出）；</li>
        <li>应用的所有 AI 能力（对话 / 复习出题 / 笔记摘录 / 图片转笔记）自动走官方 API；</li>
        <li>用量实时扣减，可在设置中查看剩余额度。</li>
      </ol>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft } from '@lucide/vue'
import { useToast } from '../composables/useToast'
import { useAuthStore } from '../stores/auth'
import {
  fetchPlans,
  fetchUsageSummary,
  forgotPassword,
  redeemPlan,
  resetPassword,
  ZhizhiApiError,
  type UsageSummary,
} from '../api/zhizhi-api'
import type { OfficialPlan } from '../types'

const router = useRouter()
const toast = useToast()
const authStore = useAuthStore()

type AuthMode = 'login' | 'register' | 'reset'

/** 与服务端一致：仅数字与大小写字母 */
const USERNAME_RE = /^[A-Za-z0-9]{3,32}$/
const PASSWORD_RE = /^[A-Za-z0-9]{6,64}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const mode = ref<AuthMode>('login')
// 登录
const username = ref('')
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

function goBack() {
  router.push({ name: 'settings-models' })
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
  if (next !== 'reset' && resetTimer) {
    clearInterval(resetTimer)
    resetTimer = null
  }
}

// ===== 忘记密码 / 重置（上线方案 S7） =====

const resetEmail = ref('')
const resetCode = ref('')
const resetPassword1 = ref('')
const resetPassword2 = ref('')
const resetCountdown = ref(0)
const resetSending = ref(false)
const resetSubmitting = ref(false)
let resetTimer: ReturnType<typeof setInterval> | null = null

function startResetCountdown(seconds: number) {
  resetCountdown.value = seconds
  if (resetTimer) clearInterval(resetTimer)
  resetTimer = setInterval(() => {
    resetCountdown.value -= 1
    if (resetCountdown.value <= 0 && resetTimer) {
      clearInterval(resetTimer)
      resetTimer = null
    }
  }, 1000)
}

async function handleResetSendCode() {
  const mail = resetEmail.value.trim()
  if (!EMAIL_RE.test(mail)) {
    toast.error('请输入有效的邮箱地址')
    return
  }
  if (resetCountdown.value > 0 || resetSending.value) return
  resetSending.value = true
  try {
    const result = await forgotPassword(mail)
    startResetCountdown(result.cooldown_seconds || 60)
    toast.success('重置验证码已发送，请查收邮箱')
  } catch (err) {
    toast.error(messageOf(err))
  } finally {
    resetSending.value = false
  }
}

async function handleResetPassword() {
  const mail = resetEmail.value.trim()
  const code = resetCode.value.trim()
  if (!EMAIL_RE.test(mail)) {
    toast.error('请输入有效的邮箱地址')
    return
  }
  if (!/^\d{6}$/.test(code)) {
    toast.error('请输入 6 位验证码')
    return
  }
  if (!PASSWORD_RE.test(resetPassword1.value)) {
    toast.error('密码仅允许 6-64 位数字与大小写字母')
    return
  }
  if (resetPassword1.value !== resetPassword2.value) {
    toast.error('两次输入的密码不一致')
    return
  }
  resetSubmitting.value = true
  try {
    await resetPassword(mail, code, resetPassword1.value)
    toast.success('密码已重置，请使用新密码登录')
    mode.value = 'login'
    resetEmail.value = ''
    resetCode.value = ''
    resetPassword1.value = ''
    resetPassword2.value = ''
    if (resetTimer) {
      clearInterval(resetTimer)
      resetTimer = null
    }
  } catch (err) {
    toast.error(messageOf(err))
  } finally {
    resetSubmitting.value = false
  }
}

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
    toast.error(messageOf(err))
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
    await loadUsage()
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
    await loadUsage()
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

/** 套餐开通引导：未登录提示先登录；已登录提示输入对应兑换码 */

onUnmounted(() => {
  if (countdownTimer) clearInterval(countdownTimer)
  if (resetTimer) clearInterval(resetTimer)
  if (deleteConfirmTimer) clearTimeout(deleteConfirmTimer)
})

// ===== 套餐中心（上线方案 S6） =====

const plans = ref<OfficialPlan[]>([])
const usage = ref<UsageSummary | null>(null)
const redeemCode = ref('')
const redeeming = ref(false)

/** 用量柱状图数据：daily 服务端倒序返回，反转为时间正序并按最大请求数归一化高度 */
const usageBars = computed(() => {
  const daily = [...(usage.value?.daily ?? [])].reverse()
  const max = Math.max(1, ...daily.map((d) => d.requests))
  return daily.map((d) => ({ day: d.day.slice(5), height: Math.max(4, Math.round((d.requests / max) * 100)) }))
})

async function loadPlans() {
  try {
    plans.value = (await fetchPlans()).plans
  } catch {
    plans.value = []
  }
}

async function loadUsage() {
  if (!authStore.isOfficialActive) return
  try {
    usage.value = await fetchUsageSummary(30)
  } catch {
    usage.value = null
  }
}

async function handleRedeem() {
  const code = redeemCode.value.trim()
  if (!code) {
    toast.error('请输入兑换码')
    return
  }
  redeeming.value = true
  try {
    const result = await redeemPlan(code)
    toast.success(`兑换成功：${result.plan.name} 已开通，当前额度 ${formatTokens(result.quota_tokens)}`)
    redeemCode.value = ''
    await authStore.fetchMe()
    await loadUsage()
  } catch (err) {
    toast.error(messageOf(err))
  } finally {
    redeeming.value = false
  }
}

function handleBuy(plan: OfficialPlan) {
  if (!authStore.isOfficialActive) {
    toast.info('登录后使用兑换码开通套餐')
    return
  }
  toast.info(`输入「${plan.name}」套餐的兑换码后点击兑换`)
}

function formatPrice(cents: number): string {
  if (!cents) return '免费'
  return `¥${(cents / 100).toFixed(0)} / 期`
}

function formatExpiry(ts: number | null | undefined): string {
  if (!ts) return '未开通'
  return new Date(ts).toLocaleDateString('zh-CN')
}

onMounted(() => {
  void loadPlans()
  void loadUsage()
})
</script>

<style scoped>
.settings-page__header {
  margin-bottom: 32px;
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 14px;
  padding: 4px 0;
  border: 0;
  background: transparent;
  color: var(--ink-2);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.back-link:hover {
  color: var(--ink);
}

.eyebrow {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
  color: var(--brand);
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.13em;
  text-transform: uppercase;
}

.eyebrow::before {
  width: 22px;
  height: 1px;
  content: '';
  background: var(--brand);
}

.settings-page__title {
  margin: 0;
  font-family: Georgia, 'Songti SC', serif;
  font-size: 25px;
  font-weight: 600;
  letter-spacing: -0.03em;
  color: var(--ink);
}

.settings-page__subtitle {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--ink-2);
}

.card-block {
  margin-bottom: 24px;
  padding: 18px 20px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
}

.card-block__title {
  margin: 0 0 8px;
  font-family: Georgia, 'Songti SC', serif;
  font-size: 16px;
  font-weight: 600;
  color: var(--ink);
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
  max-width: 420px;
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

.account-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 420px;
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

.btn--block {
  width: 100%;
}

.plan-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
}

.plan-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface-2);
}

.plan-card__name {
  font-size: 13px;
  font-weight: 650;
  color: var(--ink);
}

.plan-card__price {
  font-family: Georgia, 'Songti SC', serif;
  font-size: 18px;
  font-weight: 600;
  color: var(--brand);
}

.plan-card__features {
  flex: 1;
  margin: 0 0 8px;
  padding-left: 16px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--ink-2);
}

.how-list {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  line-height: 2;
  color: var(--ink);
}

/* 套餐中心 */
.redeem-row {
  display: flex;
  gap: 10px;
  margin-bottom: 18px;
  max-width: 520px;
}

.redeem-input {
  flex: 1;
}

.usage-block {
  margin-bottom: 18px;
}

.usage-head {
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--ink-2);
}

.usage-chart {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  height: 96px;
  padding: 10px 10px 4px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface-2);
}

.usage-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  height: 100%;
}

.usage-bar {
  width: 100%;
  max-width: 22px;
  background: color-mix(in srgb, var(--brand) 55%, transparent);
  border-radius: 3px 3px 0 0;
}

.usage-day {
  margin-top: 4px;
  font-size: 9px;
  color: var(--ink-3);
}

/* 账号安全 */
.forgot-link {
  border: 0;
  background: transparent;
  color: var(--ink-2);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  align-self: center;
}

.forgot-link:hover {
  color: var(--brand);
}

.btn-danger {
  color: var(--state-error);
  background: color-mix(in srgb, var(--state-error) 10%, transparent);
}

.btn-danger--confirm {
  color: #fff;
  background: var(--state-error);
}
</style>
