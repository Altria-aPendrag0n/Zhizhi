<template>
  <Teleport to="body">
    <Transition name="welcome">
      <div v-if="visible" class="welcome-overlay">
        <div class="welcome-card">
          <div class="welcome-card__logo"><Sprout :size="26" /></div>
          <h1 class="welcome-card__title">欢迎使用知枝</h1>
          <p class="welcome-card__beta">v0.1 测试版（Beta）· AI 伴读学习助手</p>
          <p class="welcome-card__desc">
            知枝把每一次问答、每篇笔记、每轮复习沉淀到你的本地学习库（Vault）。本版本为测试版，功能仍在迭代，欢迎反馈问题与建议。
          </p>

          <ol class="welcome-card__steps">
            <li>
              <span class="welcome-card__step-num">1</span>
              <span>选择或新建一个本地文件夹作为学习库（Vault）</span>
            </li>
            <li>
              <span class="welcome-card__step-num">2</span>
              <span>在设置中配置 AI 服务商与 API Key</span>
            </li>
            <li>
              <span class="welcome-card__step-num">3</span>
              <span>开始学习会话，划选 AI 回答沉淀为笔记，到期按时复习</span>
            </li>
          </ol>

          <div class="welcome-card__actions">
            <button class="welcome-btn welcome-btn--primary" type="button" @click="handleSetup">
              前往设置完成配置
            </button>
            <button class="welcome-btn welcome-btn--ghost" type="button" @click="handleDismiss">
              稍后再说
            </button>
          </div>

          <p class="welcome-card__foot">数据完全保存在本地，不自动上传。</p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Sprout } from '@lucide/vue'
import { loadStoredValue, saveStoredValue } from '../../utils/local-storage'

/** 首次运行标记（带版本号，未来测试版可重新引导） */
const WELCOME_KEY = 'study-thread-welcomed-v0.1'

const visible = ref(false)
const router = useRouter()

onMounted(() => {
  if (!loadStoredValue<boolean>(WELCOME_KEY)) {
    visible.value = true
  }
})

function markWelcomed() {
  visible.value = false
  saveStoredValue(WELCOME_KEY, { at: new Date().toISOString() })
}

function handleSetup() {
  markWelcomed()
  router.push('/settings')
}

function handleDismiss() {
  markWelcomed()
}
</script>

<style scoped>
.welcome-overlay {
  position: fixed;
  inset: 0;
  z-index: 9000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: color-mix(in srgb, var(--ink) 26%, transparent);
  backdrop-filter: blur(6px);
}

.welcome-card {
  width: min(440px, 100%);
  padding: 30px 32px 26px;
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  background: var(--surface);
  box-shadow: var(--shadow-1);
}

.welcome-card__logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  margin-bottom: 16px;
  border-radius: 14px;
  background: var(--brand-soft);
  color: var(--brand-strong);
}

.welcome-card__title {
  margin: 0;
  font-family: Georgia, 'Songti SC', serif;
  font-size: 24px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--ink);
}

.welcome-card__beta {
  margin: 6px 0 0;
  font-size: 12px;
  font-weight: 650;
  color: var(--brand);
}

.welcome-card__desc {
  margin: 14px 0 0;
  color: var(--ink-2);
  font-size: 13px;
  line-height: 1.7;
}

.welcome-card__steps {
  display: grid;
  gap: 10px;
  margin: 18px 0 0;
  padding: 0;
  list-style: none;
  counter-reset: none;
}

.welcome-card__steps li {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  color: var(--ink);
  font-size: 13px;
  line-height: 1.55;
}

.welcome-card__step-num {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  margin-top: 1px;
  border-radius: 999px;
  background: var(--brand);
  color: var(--brand-ink);
  font-size: 11px;
  font-weight: 700;
}

.welcome-card__actions {
  display: flex;
  gap: 12px;
  margin-top: 22px;
}

.welcome-btn {
  padding: 9px 18px;
  border: 0;
  border-radius: var(--r-md);
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
  transition: background 0.15s;
}

.welcome-btn--primary {
  color: var(--brand-ink);
  background: var(--brand);
}

.welcome-btn--primary:hover {
  background: var(--brand-strong);
}

.welcome-btn--ghost {
  color: var(--ink-2);
  background: transparent;
}

.welcome-btn--ghost:hover {
  color: var(--ink);
  background: var(--surface-2);
}

.welcome-card__foot {
  margin: 18px 0 0;
  color: var(--ink-3);
  font-size: 11px;
  text-align: center;
}

.welcome-enter-active,
.welcome-leave-active {
  transition: opacity 0.25s ease;
}

.welcome-enter-from,
.welcome-leave-to {
  opacity: 0;
}
</style>
