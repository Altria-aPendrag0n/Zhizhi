<template>
  <div class="settings-page">
    <div class="settings-page__header">
      <button type="button" class="back-link" @click="goBack">
        <ArrowLeft :size="14" />
        返回模型配置
      </button>
      <div class="eyebrow">Official API</div>
      <h1 class="settings-page__title">知枝官方 API</h1>
      <p class="settings-page__subtitle">开箱即用的云服务：登录账号购买套餐后自动启用，API Key 对用户不可见</p>
    </div>

    <!-- 登录引导 -->
    <section class="card-block">
      <h3 class="card-block__title">登录知枝账号</h3>
      <p class="form-hint">
        登录后即可购买套餐并自动启用官方 API。无需手动配置任何 Key：官方密钥由服务端下发并安全存储在系统钥匙串中，应用自动使用。
      </p>

      <div class="login-form">
        <div class="form-group">
          <label class="form-label" for="account">账号（邮箱 / 手机号）</label>
          <input id="account" v-model="account" type="text" class="form-input" placeholder="you@example.com" />
        </div>

        <div class="form-group">
          <label class="form-label" for="verify-code">验证码</label>
          <div class="verify-row">
            <input id="verify-code" v-model="verifyCode" type="text" class="form-input" placeholder="6 位验证码" />
            <button class="btn btn-secondary" @click="handleNotReady">获取验证码</button>
          </div>
        </div>

        <div class="form-actions">
          <button class="btn btn-primary" @click="handleNotReady">登录</button>
        </div>
      </div>
    </section>

    <!-- 套餐预览 -->
    <section class="card-block">
      <h3 class="card-block__title">套餐预览</h3>
      <p class="form-hint">购买后自动生效，按套餐额度使用（即将上线）</p>
      <div class="plan-grid">
        <div v-for="plan in plans" :key="plan.name" class="plan-card">
          <div class="plan-card__name">{{ plan.name }}</div>
          <div class="plan-card__price">{{ plan.price }}</div>
          <ul class="plan-card__features">
            <li v-for="feature in plan.features" :key="feature">{{ feature }}</li>
          </ul>
          <button class="btn btn-secondary btn--block" @click="handleNotReady">开通</button>
        </div>
      </div>
    </section>

    <!-- 自动配置说明 -->
    <section class="card-block">
      <h3 class="card-block__title">如何工作</h3>
      <ol class="how-list">
        <li>登录知枝账号，在应用内选择套餐并完成支付；</li>
        <li>官方 API Key 由服务端生成并自动下发，存储在系统钥匙串中（Key 对用户不可见，不可导出）；</li>
        <li>应用的所有 AI 能力（对话 / 复习出题 / 笔记摘录 / 图片转笔记）自动走官方 API；</li>
        <li>用量实时扣减，可在设置中查看剩余额度。</li>
      </ol>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft } from '@lucide/vue'
import { useToast } from '../composables/useToast'

const router = useRouter()
const toast = useToast()

function goBack() {
  router.push({ name: 'settings-models' })
}

const account = ref('')
const verifyCode = ref('')

/** 账号服务尚未上线：所有登录/购买交互统一提示 */
function handleNotReady() {
  toast.error('账号服务尚未上线，敬请期待')
}

const plans = [
  {
    name: '轻量',
    price: '即将上线',
    features: ['对话 / 复习出题', '约 100 万 token / 月', '标准模型'],
  },
  {
    name: '标准',
    price: '即将上线',
    features: ['全部 AI 能力', '约 500 万 token / 月', '标准 + 视觉模型'],
  },
  {
    name: '专业',
    price: '即将上线',
    features: ['全部 AI 能力', '不限量（按量计费）', '高级模型优先'],
  },
]
</script>

<style scoped>
.settings-page {
  padding: 42px 54px 72px;
  height: 100%;
  overflow-y: auto;
}

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

@media (max-width: 1240px) {
  .settings-page {
    padding: 34px 34px 64px;
  }
}

@media (max-width: 860px) {
  .settings-page {
    padding: 22px 20px 56px;
  }
}
</style>
