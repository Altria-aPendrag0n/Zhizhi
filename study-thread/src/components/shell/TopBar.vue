<template>
  <div class="top-bar">
    <div class="top-bar__crumbs">
      <button class="top-bar__icon-btn" type="button" aria-label="切换侧栏" @click="$emit('toggle-sidebar')">
        <span>&#9776;</span>
      </button>
      <span v-for="(crumb, index) in breadcrumbs" :key="index">
        <span v-if="index > 0" aria-hidden="true" class="top-bar__separator">/</span>
        <span :class="{ 'top-bar__crumb--current': index === breadcrumbs.length - 1 }">
          {{ crumb }}
        </span>
      </span>
    </div>
    <div class="top-bar__actions">
      <button class="top-bar__icon-btn" type="button" aria-label="搜索" @click="$emit('search')">
        <span>&#128269;</span>
      </button>
      <button class="top-bar__icon-btn" type="button" aria-label="设置" @click="$emit('settings')">
        <span>&#9881;</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  breadcrumbs: string[]
}>()

defineEmits<{
  'toggle-sidebar': []
  search: []
  settings: []
}>()
</script>

<style scoped>
.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
  width: 100%;
}

.top-bar__crumbs {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  color: var(--ink-2);
  font-size: 13px;
}

.top-bar__crumb--current {
  overflow: hidden;
  color: var(--ink);
  font-weight: 590;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.top-bar__separator {
  color: var(--ink-3);
  margin: 0 4px;
}

.top-bar__actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.top-bar__icon-btn {
  display: inline-grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 8px;
  color: var(--ink-3);
  background: transparent;
  cursor: pointer;
  font-size: 14px;
}

.top-bar__icon-btn:hover {
  color: var(--brand);
  background: var(--brand-soft);
}
</style>