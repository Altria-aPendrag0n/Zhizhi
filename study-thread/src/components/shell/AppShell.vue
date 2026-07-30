<template>
  <div class="app-shell" aria-label="知枝学习工作台">
    <div class="app-shell__rail">
      <slot name="rail" />
    </div>
    <div class="app-shell__threads">
      <slot name="threads" />
    </div>
    <header class="app-shell__toolbar">
      <slot name="toolbar" />
    </header>
    <main class="app-shell__main">
      <slot name="main" />
    </main>
    <aside class="app-shell__context" v-if="$slots.context">
      <slot name="context" />
    </aside>
  </div>
</template>

<script setup lang="ts">
</script>

<style scoped>
.app-shell {
  display: grid;
  grid-template-columns: 76px 248px minmax(0, 1fr) 310px;
  grid-template-rows: 62px minmax(0, 1fr);
  min-height: 100vh;
  overflow: hidden;
  background: var(--bg);
  color: var(--ink);
  font-family: "HarmonyOS Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
}

.app-shell__rail {
  grid-row: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 14px 0;
  background: var(--surface-2);
  border-right: 1px solid var(--line);
}

.app-shell__threads {
  grid-row: 1 / -1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: rgba(251, 250, 246, 0.58);
  border-right: 1px solid var(--line);
}

.app-shell__toolbar {
  grid-column: 3 / -1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
  padding: 0 22px;
  background: rgba(251, 250, 246, 0.76);
  border-bottom: 1px solid var(--line);
}

.app-shell__main {
  grid-column: 3;
  min-width: 0;
  overflow: auto;
  background: var(--surface);
}

.app-shell__context {
  grid-column: 4;
  min-width: 0;
  overflow: auto;
  background: rgba(244, 241, 234, 0.72);
  border-left: 1px solid var(--line);
}

@media (max-width: 1100px) {
  .app-shell {
    grid-template-columns: 76px 200px minmax(0, 1fr);
  }
  .app-shell__context {
    display: none;
  }
}
</style>