<template>
  <div class="project-rail">
    <button class="project-rail__brand" type="button" aria-label="知枝" title="知枝">
      <span class="brand-text">枝</span>
    </button>
    <button
      v-for="project in projects"
      :key="project.id"
      class="project-rail__button"
      :class="{ 'is-active': project.id === activeId }"
      type="button"
      :aria-label="project.name"
      :title="project.name"
      @click="$emit('select', project.id)"
    >
      <span class="project-initial">{{ project.name.charAt(0) }}</span>
    </button>
    <button
      class="project-rail__button project-rail__button--add"
      type="button"
      aria-label="新建项目"
      title="新建项目"
      @click="$emit('add')"
    >
      <span>+</span>
    </button>
  </div>
</template>

<script setup lang="ts">
export interface Project {
  id: string
  name: string
}

defineProps<{
  projects: Project[]
  activeId: string | null
}>()

defineEmits<{
  select: [id: string]
  add: []
}>()
</script>

<style scoped>
.project-rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 14px 0;
  height: 100%;
}

.project-rail__brand {
  display: inline-grid;
  place-items: center;
  width: 42px;
  height: 42px;
  margin-bottom: 12px;
  border: 0;
  border-radius: 14px;
  font-size: 18px;
  font-weight: 700;
  color: var(--brand-ink);
  background: var(--brand);
  cursor: pointer;
}

.project-rail__button {
  display: inline-grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border: 0;
  border-radius: 13px;
  color: var(--ink-3);
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  transition: background 0.15s, color 0.15s;
}

.project-rail__button:hover {
  color: var(--brand);
  background: var(--brand-soft);
}

.project-rail__button.is-active {
  color: var(--brand);
  background: var(--brand-soft);
}

.project-rail__button--add {
  margin-top: auto;
}
</style>