<template>
  <div class="settings-page">
    <!-- 左侧导航栏 -->
    <aside class="settings-nav">
      <nav class="settings-nav__list">
        <button
          type="button"
          class="settings-nav__item"
          :class="{ 'settings-nav__item--active': section === 'general' }"
          @click="goToSection('general')"
        >
          <SlidersHorizontal :size="15" />
          <span>常规设置</span>
        </button>
        <button
          type="button"
          class="settings-nav__item"
          :class="{ 'settings-nav__item--active': section === 'models' }"
          @click="goToSection('models')"
        >
          <Sparkles :size="15" />
          <span>模型配置</span>
        </button>
        <button
          type="button"
          class="settings-nav__item"
          :class="{ 'settings-nav__item--active': section === 'user' }"
          @click="goToSection('user')"
        >
          <UserRound :size="15" />
          <span>用户</span>
        </button>
      </nav>
    </aside>

    <!-- 右侧内容区 -->
    <main class="settings-content">
      <header v-if="sectionMeta" class="settings-content__header">
        <div class="eyebrow">{{ sectionMeta.eyebrow }}</div>
        <h1 class="settings-content__title">{{ sectionMeta.title }}</h1>
        <p class="settings-content__subtitle">{{ sectionMeta.subtitle }}</p>
      </header>

      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { SlidersHorizontal, Sparkles, UserRound } from '@lucide/vue'

type SettingsSection = 'general' | 'models' | 'user'

const route = useRoute()
const router = useRouter()

const section = computed<SettingsSection>(() => {
  const name = typeof route.name === 'string' ? route.name : ''
  if (name.startsWith('settings-models')) return 'models'
  if (name === 'settings-user') return 'user'
  return 'general'
})

function goToSection(next: SettingsSection) {
  router.push({ name: `settings-${next}` })
}

const sectionMeta = computed<{ eyebrow: string; title: string; subtitle: string } | null>(() => {
  switch (section.value) {
    case 'models':
      return null
    case 'user':
      return {
        eyebrow: 'Account',
        title: '用户',
        subtitle: '登录知枝账号以启用官方 API，管理套餐、兑换码与用量',
      }
    default:
      return {
        eyebrow: 'Configuration',
        title: '常规设置',
        subtitle: '管理学习仓库与偏好设置',
      }
  }
})
</script>

<style scoped>
.settings-page {
  display: flex;
  height: 100%;
}

/* 左侧导航栏 */
.settings-nav {
  flex-shrink: 0;
  width: 196px;
  padding: 42px 0 24px;
  border-right: 1px solid var(--line);
}

.settings-nav__list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 12px;
}

.settings-nav__item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 14px;
  border: 0;
  border-radius: var(--r-md);
  background: transparent;
  color: var(--ink-2);
  font: inherit;
  font-size: 13px;
  font-weight: 590;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.settings-nav__item:hover {
  background: var(--surface-2);
  color: var(--ink);
}

.settings-nav__item--active {
  background: color-mix(in srgb, var(--brand) 10%, transparent);
  color: var(--brand);
}

.settings-nav__item--active:hover {
  background: color-mix(in srgb, var(--brand) 14%, transparent);
}

/* 右侧内容区 */
.settings-content {
  flex: 1;
  min-width: 0;
  padding: 42px 54px 72px;
  overflow-y: auto;
}

.settings-content__header {
  margin-bottom: 28px;
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

.settings-content__title {
  margin: 0;
  font-family: Georgia, 'Songti SC', serif;
  font-size: 25px;
  font-weight: 600;
  letter-spacing: -0.03em;
  color: var(--ink);
}

.settings-content__subtitle {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--ink-2);
}

@media (max-width: 1240px) {
  .settings-content {
    padding: 34px 34px 64px;
  }
}

@media (max-width: 860px) {
  .settings-page {
    flex-direction: column;
  }

  .settings-nav {
    width: 100%;
    padding: 18px 0 0;
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }

  .settings-nav__list {
    flex-direction: row;
    padding: 0 16px 12px;
  }

  .settings-nav__item {
    width: auto;
  }

  .settings-content {
    padding: 22px 20px 56px;
  }
}
</style>
