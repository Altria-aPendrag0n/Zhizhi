<template>
  <div
    class="app-shell"
    :class="{ 'app-shell--threads-hidden': hideThreads, 'app-shell--compact': compact }"
    aria-label="知枝学习工作台"
  >
    <aside class="app-shell__rail" aria-label="项目">
      <slot name="rail" />
    </aside>
    <aside
      v-if="!hideThreads"
      class="app-shell__threads"
      :class="{ 'app-shell__threads--open': compact && drawerOpen }"
      aria-label="会话列表"
    >
      <slot name="threads" />
    </aside>
    <header class="app-shell__toolbar">
      <slot name="toolbar" />
    </header>
    <main class="app-shell__main">
      <slot name="main" />
    </main>
    <!-- 小窗口模式下会话列表抽屉的遮罩，点击关闭 -->
    <div
      v-if="compact && !hideThreads && drawerOpen"
      class="app-shell__drawer-mask"
      @click="$emit('close-drawer')"
    ></div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  hideThreads?: boolean
  /** 小窗口模式：会话列表不占主网格列，以抽屉形式从左侧滑出 */
  compact?: boolean
  /** 小窗口模式下会话列表抽屉是否展开 */
  drawerOpen?: boolean
}>()

defineEmits<{
  'close-drawer': []
}>()
</script>

<style scoped>
.app-shell {
  --shell-paper: #f2efe8;
  --shell-paper-deep: #e9e4da;
  --shell-surface: #faf8f3;
  --shell-ink: #25332d;
  --shell-muted: #778078;
  --shell-line: #ddd8ce;
  --shell-accent: #1f5a45;
  --shell-accent-soft: #e0ebe3;

  display: grid;
  /* 三区布局：项目栏 会话列表 主内容区（无预留上下文栏，主内容区撑满剩余空间） */
  grid-template-columns: 76px 244px minmax(0, 1fr);
  grid-template-rows: 60px minmax(0, 1fr);
  height: 100vh;
  overflow: hidden;
  background: var(--shell-paper);
  color: var(--shell-ink);
  font-family: Inter, "Noto Sans SC", "PingFang SC", sans-serif;
}

.app-shell--threads-hidden {
  grid-template-columns: 76px minmax(0, 1fr);
}

.app-shell--threads-hidden .app-shell__toolbar {
  grid-column: 2 / -1;
}

.app-shell--threads-hidden .app-shell__main {
  grid-column: 2;
}

.app-shell__rail {
  grid-row: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 14px 0;
  background: var(--shell-paper-deep);
  border-right: 1px solid var(--shell-line);
}

.app-shell__threads {
  grid-row: 1 / -1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: rgba(250, 248, 243, 0.58);
  border-right: 1px solid var(--shell-line);
}

.app-shell__toolbar {
  grid-column: 3 / -1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
  padding: 0 22px;
  background: rgba(250, 248, 243, 0.76);
  border-bottom: 1px solid var(--shell-line);
}

.app-shell__main {
  grid-column: 3;
  min-width: 0;
  overflow: auto;
  background: var(--shell-surface);
}

@media (max-width: 1100px) {
  .app-shell {
    grid-template-columns: 64px 218px minmax(0, 1fr);
  }

  .app-shell--threads-hidden {
    grid-template-columns: 64px minmax(0, 1fr);
  }
}

/* 小窗口模式（compact）：会话列表移出主网格，改为左侧抽屉 */
.app-shell--compact {
  grid-template-columns: 76px minmax(0, 1fr);
}

.app-shell--compact .app-shell__toolbar {
  grid-column: 2 / -1;
}

.app-shell--compact .app-shell__main {
  grid-column: 2;
}

.app-shell--compact .app-shell__threads {
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: 50;
  width: 244px;
  transform: translateX(-100%);
  box-shadow: none;
  transition: transform 0.22s ease, box-shadow 0.22s ease;
}

.app-shell--compact .app-shell__threads--open {
  transform: translateX(0);
  box-shadow: 0 0 40px rgba(20, 39, 33, 0.18);
}

.app-shell__drawer-mask {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgba(25, 39, 33, 0.32);
}
</style>