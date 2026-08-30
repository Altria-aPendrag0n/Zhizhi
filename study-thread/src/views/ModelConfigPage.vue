<template>
  <div class="settings-page">
    <div class="settings-page__header">
      <button type="button" class="back-link" @click="goBack">
        <ArrowLeft :size="14" />
        返回设置
      </button>
      <div class="eyebrow">Model Configuration</div>
      <h1 class="settings-page__title">模型配置</h1>
      <p class="settings-page__subtitle">选择 AI 能力来源：官方 API 开箱即用，或自定义模型自持 Key</p>
    </div>

    <div class="entry-list">
      <!-- 知枝官方 API -->
      <button type="button" class="entry-card" @click="router.push({ name: 'settings-models-official' })">
        <div class="entry-card__icon entry-card__icon--official">
          <Sparkles :size="20" />
        </div>
        <div class="entry-card__body">
          <div class="entry-card__title">
            知枝官方 API
            <span class="entry-card__badge">即将上线</span>
          </div>
          <p class="entry-card__desc">登录账号购买套餐后自动启用，开箱即用。官方 Key 对用户不可见，自动存储在系统钥匙串中，覆盖对话、复习、笔记摘录与图片转笔记全部 AI 能力。</p>
        </div>
        <ChevronRight :size="16" class="entry-card__arrow" />
      </button>

      <!-- 自定义模型 -->
      <button type="button" class="entry-card" @click="router.push({ name: 'settings-models-custom' })">
        <div class="entry-card__icon">
          <Server :size="20" />
        </div>
        <div class="entry-card__body">
          <div class="entry-card__title">
            自定义模型
            <span class="entry-card__badge entry-card__badge--active">当前使用</span>
          </div>
          <p class="entry-card__desc">自持 API Key（BYOK），支持多家服务商与本地模型（Anthropic / OpenAI / DeepSeek / 通义千问 / 智谱 / Ollama / 自定义），以及独立的图片转笔记视觉模型。配置保存在本机。</p>
        </div>
        <ChevronRight :size="16" class="entry-card__arrow" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { ArrowLeft, ChevronRight, Sparkles, Server } from '@lucide/vue'

const router = useRouter()

function goBack() {
  router.push({ name: 'settings' })
}
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

.entry-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.entry-card {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  width: 100%;
  padding: 18px 20px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.entry-card:hover {
  border-color: var(--brand);
  background: var(--surface-2);
}

.entry-card__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: var(--surface-2);
  color: var(--ink-2);
}

.entry-card__icon--official {
  background: color-mix(in srgb, var(--brand) 12%, transparent);
  color: var(--brand);
}

.entry-card__body {
  flex: 1;
  min-width: 0;
}

.entry-card__title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 14px;
  font-weight: 650;
  color: var(--ink);
}

.entry-card__badge {
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--line);
  color: var(--ink-2);
  font-size: 11px;
  font-weight: 500;
}

.entry-card__badge--active {
  background: color-mix(in srgb, var(--state-success) 14%, transparent);
  color: var(--state-success);
}

.entry-card__desc {
  margin: 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--ink-2);
}

.entry-card__arrow {
  flex-shrink: 0;
  margin-top: 12px;
  color: var(--ink-3);
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
