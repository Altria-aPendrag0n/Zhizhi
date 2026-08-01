<template>
  <nav class="branch-breadcrumb" aria-label="分支导航">
    <button
      class="breadcrumb-home"
      @click="$emit('navigate', 'home')"
    >
      ← 返回主对话
    </button>
    <span class="breadcrumb-separator">/</span>
    <template
      v-for="(crumb, index) in breadcrumbs"
      :key="crumb.id"
    >
      <span
        class="breadcrumb-item"
        :class="{ active: index === breadcrumbs.length - 1 }"
      >
        {{ crumb.title }}
      </span>
      <span v-if="index < breadcrumbs.length - 1" class="breadcrumb-separator">/</span>
    </template>
  </nav>
</template>

<script setup lang="ts">
export interface BreadcrumbItem {
  id: string
  title: string
}

defineProps<{
  breadcrumbs: BreadcrumbItem[]
}>()

defineEmits<{
  navigate: [target: string]
}>()
</script>

<style scoped>
.branch-breadcrumb {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 22px;
  min-height: 62px;
  border-bottom: 1px solid var(--line);
  background: rgba(251, 250, 246, 0.8);
  font-size: 13px;
  color: var(--ink-2);
}

.breadcrumb-home {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 32px;
  padding: 0 8px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--ink-2);
  cursor: pointer;
  font-size: 13px;
  text-decoration: none;
}

.breadcrumb-home:hover {
  color: var(--brand);
  background: var(--brand-soft);
}

.breadcrumb-item {
  font-size: 13px;
}

.breadcrumb-item.active {
  overflow: hidden;
  color: var(--ink);
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.breadcrumb-separator {
  color: var(--ink-3);
}
</style>