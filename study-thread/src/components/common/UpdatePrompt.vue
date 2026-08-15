<template>
  <Teleport to="body">
    <div v-if="visible && update" class="update-prompt__mask" @click.self="handleLater">
      <div class="update-prompt" role="dialog" aria-modal="true">
        <header class="update-prompt__header">
          <h3>发现新版本</h3>
          <p class="update-prompt__sub">v{{ update.currentVersion }} → v{{ update.version }}</p>
        </header>

        <p class="update-prompt__desc">
          {{
            installing
              ? downloaded
                ? '更新已下载完成，正在安装并重启…'
                : '正在后台下载更新…'
              : '是否立即更新到最新版本？'
          }}
        </p>

        <footer class="update-prompt__footer">
          <button
            type="button"
            class="update-prompt__btn update-prompt__btn--ghost"
            :disabled="installing"
            @click="handleLater"
          >
            {{ installing ? '请稍候…' : '稍后再说' }}
          </button>
          <button
            type="button"
            class="update-prompt__btn update-prompt__btn--primary"
            :disabled="installing"
            @click="handleInstall"
          >
            立即更新
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useToast } from '../../composables/useToast'
import { installUpdate, type AppUpdate } from '../../utils/updater'

const props = defineProps<{
  visible: boolean
  update: AppUpdate | null
}>()

const emit = defineEmits<{
  close: []
}>()

const toast = useToast()
const installing = ref(false)
const downloaded = ref(false)

// 每次打开重置下载/安装状态
watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      installing.value = false
      downloaded.value = false
    }
  },
)

function handleLater() {
  if (installing.value) return
  emit('close')
}

async function handleInstall() {
  if (!props.update || installing.value) return
  installing.value = true
  try {
    await installUpdate(props.update, () => {
      downloaded.value = true
    })
  } catch (e) {
    installing.value = false
    downloaded.value = false
    toast.error(`更新失败：${e instanceof Error ? e.message : String(e)}`)
  }
}
</script>

<style scoped>
.update-prompt__mask {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: grid;
  place-items: center;
  background: rgba(18, 30, 26, 0.4);
  backdrop-filter: blur(2px);
}

.update-prompt {
  width: min(420px, calc(100vw - 48px));
  background: #fffefa;
  border: 1px solid var(--line);
  border-radius: 14px;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.18);
  overflow: hidden;
  animation: dialogIn 0.18s ease;
}

.update-prompt__header {
  padding: 18px 20px 0;
}

.update-prompt__header h3 {
  margin: 0;
  font: 650 17px 'HarmonyOS Sans SC', 'PingFang SC', sans-serif;
  color: var(--ink);
}

.update-prompt__sub {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--brand-strong);
  font-weight: 600;
}

.update-prompt__desc {
  margin: 14px 20px 0;
  font-size: 13px;
  color: var(--ink-2);
  line-height: 1.6;
}

.update-prompt__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 20px 20px;
}

.update-prompt__btn {
  padding: 8px 16px;
  border: 1px solid transparent;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.update-prompt__btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.update-prompt__btn--ghost {
  background: transparent;
  border-color: var(--line);
  color: var(--ink-2);
}

.update-prompt__btn--ghost:hover:not(:disabled) {
  background: var(--surface-2);
}

.update-prompt__btn--primary {
  background: var(--brand);
  color: var(--brand-ink, #fff);
}

.update-prompt__btn--primary:hover:not(:disabled) {
  background: var(--brand-strong);
}

@keyframes dialogIn {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
</style>
