<template>
  <nav class="branch-breadcrumb" aria-label="分支导航">
    <button
      class="breadcrumb-home"
      @click="$emit('navigate', 'home')"
    >
      返回主会话
    </button>
    <span class="breadcrumb-separator">/</span>
    <span
      v-for="(crumb, index) in breadcrumbs"
      :key="crumb.id"
      class="breadcrumb-wrapper"
    >
      <button
        class="breadcrumb-item"
        :class="{ active: index === breadcrumbs.length - 1 }"
        @click="$emit('navigate', crumb.id)"
      >
        {{ crumb.title }}
      </button>
      <span v-if="index < breadcrumbs.length - 1" class="breadcrumb-separator">/</span>
    </span>
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
  gap: 6px;
  padding: 10px 24px;
  border-bottom: 1px solid var(--line);
  background: var(--surface);
  font-size: 13px;
}

.breadcrumb-home {
  border: none;
  background: transparent;
  color: var(--brand);
  cursor: pointer;
  font-size: 13px;
  padding: 0;
}

.breadcrumb-home:hover {
  text-decoration: underline;
}

.breadcrumb-item {
  border: none;
  background: transparent;
  color: var(--ink-2);
  cursor: pointer;
  font-size: 13px;
  padding: 0;
}

.breadcrumb-item:hover {
  color: var(--ink);
}

.breadcrumb-item.active {
  color: var(--ink);
  font-weight: 600;
}

.breadcrumb-separator {
  color: var(--ink-3);
  font-size: 12px;
}

.breadcrumb-wrapper {
  display: flex;
  align-items: center;
  gap: 6px;
}
</style>