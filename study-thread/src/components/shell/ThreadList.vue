<template>
  <div class="thread-list">
    <header class="thread-list__head">
      <h2 class="thread-list__title">{{ projectName }}</h2>
      <button class="thread-list__icon-btn" type="button" aria-label="新建会话" @click="$emit('new-thread')">
        <span>+</span>
      </button>
    </header>
    <ul class="thread-list__items" v-if="threads.length > 0">
      <li
        v-for="thread in threads"
        :key="thread.id"
        class="thread-list__item"
        :class="{ 'is-active': thread.id === activeId }"
        @click="$emit('select', thread.id)"
      >
        <span class="thread-list__item-title">{{ thread.title }}</span>
        <span class="thread-list__item-meta">{{ thread.meta }}</span>
      </li>
    </ul>
    <div class="thread-list__empty" v-else>
      <p class="text-muted-foreground text-sm">暂无会话</p>
    </div>
    <footer class="thread-list__footer">
      <span class="thread-list__stat">{{ threadCount }} 个会话</span>
      <span class="thread-list__stat">{{ noteCount }} 张笔记</span>
    </footer>
  </div>
</template>

<script setup lang="ts">
export interface Thread {
  id: string
  title: string
  meta: string
}

defineProps<{
  projectName: string
  threads: Thread[]
  activeId: string | null
  threadCount: number
  noteCount: number
}>()

defineEmits<{
  select: [id: string]
  'new-thread': []
}>()
</script>

<style scoped>
.thread-list {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
}

.thread-list__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 62px;
  padding: 0 14px 0 18px;
  border-bottom: 1px solid var(--line);
}

.thread-list__title {
  margin: 0;
  font-size: 14px;
  font-weight: 650;
  letter-spacing: 0.01em;
}

.thread-list__icon-btn {
  display: inline-grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 8px;
  color: var(--ink-3);
  background: transparent;
  cursor: pointer;
  font-size: 18px;
}

.thread-list__icon-btn:hover {
  color: var(--brand);
  background: var(--brand-soft);
}

.thread-list__items {
  flex: 1;
  display: grid;
  gap: 3px;
  margin: 0;
  padding: 12px 8px;
  overflow-y: auto;
  list-style: none;
}

.thread-list__item {
  display: grid;
  gap: 4px;
  padding: 11px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
}

.thread-list__item:hover {
  background: var(--brand-soft);
}

.thread-list__item.is-active {
  background: var(--brand-soft);
}

.thread-list__item-title {
  font-size: 13px;
  font-weight: 590;
}

.thread-list__item-meta {
  color: var(--ink-2);
  font-size: 11px;
}

.thread-list__empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.thread-list__footer {
  display: flex;
  justify-content: space-between;
  padding: 10px 18px;
  border-top: 1px solid var(--line);
}

.thread-list__stat {
  color: var(--ink-2);
  font-size: 11px;
}
</style>