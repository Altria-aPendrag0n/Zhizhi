<template>
  <div class="app-shell" :class="{ 'app-shell--threads-hidden': hideThreads }" aria-label="知枝学习工作台">
    <aside class="app-shell__rail" aria-label="项目">
      <slot name="rail" />
    </aside>
    <aside v-if="!hideThreads" class="app-shell__threads" aria-label="会话列表">
      <slot name="threads" />
    </aside>
    <header class="app-shell__toolbar">
      <slot name="toolbar" />
    </header>
    <main class="app-shell__main">
      <slot name="main" />
    </main>
    <aside v-if="$slots.context" class="app-shell__context" aria-label="上下文">
      <slot name="context" />
    </aside>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  hideThreads?: boolean
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
  grid-template-columns: 76px 244px minmax(0, 1fr) 292px;
  grid-template-rows: 60px minmax(0, 1fr);
  height: 100vh;
  overflow: hidden;
  background: var(--shell-paper);
  color: var(--shell-ink);
  font-family: Inter, "Noto Sans SC", "PingFang SC", sans-serif;
}

.app-shell--threads-hidden {
  grid-template-columns: 76px minmax(0, 1fr) 292px;
}

.app-shell--threads-hidden .app-shell__toolbar {
  grid-column: 2 / -1;
}

.app-shell--threads-hidden .app-shell__main {
  grid-column: 2;
}

.app-shell--threads-hidden .app-shell__context {
  grid-column: 3;
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

.app-shell__context {
  grid-column: 4;
  min-width: 0;
  overflow: auto;
  background: rgba(242, 239, 232, 0.72);
  border-left: 1px solid var(--shell-line);
}

@media (max-width: 1100px) {
  .app-shell {
    grid-template-columns: 64px 218px minmax(0, 1fr) 270px;
  }

  .app-shell--threads-hidden {
    grid-template-columns: 64px minmax(0, 1fr) 270px;
  }
}
</style>