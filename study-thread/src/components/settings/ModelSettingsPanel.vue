<template>
  <div class="entry-list">
    <!-- 知枝官方 API -->
    <div
      class="entry-card"
      role="button"
      tabindex="0"
      @click="router.push({ name: 'settings-models-official' })"
      @keydown.enter.prevent="router.push({ name: 'settings-models-official' })"
      @keydown.space.prevent="router.push({ name: 'settings-models-official' })"
    >
      <div class="entry-card__icon entry-card__icon--official">
        <Sparkles :size="20" />
      </div>
      <div class="entry-card__body">
        <div class="entry-card__title">
          知枝官方 API
          <span class="entry-card__badge" :class="{ 'entry-card__badge--active': officialInUse }">
            {{ officialBadge }}
          </span>
        </div>
        <p class="entry-card__desc">登录账号后自动启用，开箱即用。官方 Key 对用户不可见，自动存储在系统钥匙串中，覆盖对话、复习、笔记摘录与图片转笔记全部 AI 能力。</p>
      </div>
      <span class="entry-card__side">
        <button v-if="officialInUse" type="button" class="entry-card__switch" disabled>使用中</button>
        <button
          v-else-if="authStore.isOfficialActive"
          type="button"
          class="entry-card__switch"
          @click.stop="useOfficial"
        >
          切换使用
        </button>
        <button
          v-else
          type="button"
          class="entry-card__switch"
          @click.stop="router.push({ name: 'settings-models-official' })"
        >
          去登录
        </button>
        <ChevronRight :size="16" class="entry-card__arrow" />
      </span>
    </div>

    <!-- 自定义模型 -->
    <div
      class="entry-card"
      role="button"
      tabindex="0"
      @click="router.push({ name: 'settings-models-custom' })"
      @keydown.enter.prevent="router.push({ name: 'settings-models-custom' })"
      @keydown.space.prevent="router.push({ name: 'settings-models-custom' })"
    >
      <div class="entry-card__icon">
        <Server :size="20" />
      </div>
      <div class="entry-card__body">
        <div class="entry-card__title">
          自定义模型
          <span class="entry-card__badge" :class="{ 'entry-card__badge--active': customInUse }">
            {{ customInUse ? '当前使用' : '未启用' }}
          </span>
        </div>
        <p class="entry-card__desc">自持 API Key（BYOK），支持多家服务商与本地模型（Anthropic / OpenAI / DeepSeek / 通义千问 / 智谱 / Ollama / 自定义），以及独立的图片转笔记视觉模型。配置保存在本机。</p>
      </div>
      <span class="entry-card__side">
        <button
          v-if="customInUse"
          type="button"
          class="entry-card__switch"
          disabled
        >使用中</button>
        <button v-else type="button" class="entry-card__switch" @click.stop="useCustom">切换使用</button>
        <ChevronRight :size="16" class="entry-card__arrow" />
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronRight, Sparkles, Server } from '@lucide/vue'
import { useAuthStore } from '../../stores/auth'
import { useSettingsStore } from '../../stores/settings'

const router = useRouter()
const authStore = useAuthStore()
const settingsStore = useSettingsStore()

/** 当前生效通道与 getProviderConfig 一致：官方 API 启用时优先 */
const officialInUse = computed(() => settingsStore.officialApiEnabled)
const customInUse = computed(() => !settingsStore.officialApiEnabled)

const officialBadge = computed(() =>
  officialInUse.value ? '使用中' : authStore.isOfficialActive ? '已登录' : '未登录',
)

function useOfficial() {
  settingsStore.officialApiEnabled = true
}

function useCustom() {
  settingsStore.officialApiEnabled = false
}
</script>

<style scoped>
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

.entry-card:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
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

.entry-card__side {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
}

.entry-card__switch {
  padding: 5px 12px;
  border: 1px solid var(--brand);
  border-radius: 999px;
  background: var(--brand);
  color: var(--brand-ink);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}

.entry-card__switch:hover:enabled {
  background: var(--brand-strong);
}

.entry-card__switch:disabled {
  border-color: transparent;
  background: var(--brand-soft);
  color: var(--brand-strong);
  cursor: default;
}

.entry-card__arrow {
  color: var(--ink-3);
}
</style>
