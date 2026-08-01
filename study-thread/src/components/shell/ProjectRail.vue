<template>
  <div class="project-rail">
    <button class="project-rail__brand" type="button" aria-label="知枝" title="知枝">
      <Sprout :size="22" :stroke-width="1.75" />
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
      <component :is="projectIcon(project)" :size="20" :stroke-width="1.75" />
    </button>
    <button
      class="project-rail__button project-rail__button--add"
      type="button"
      aria-label="新建项目"
      title="新建项目"
      @click="$emit('add')"
    >
      <Plus :size="20" :stroke-width="1.75" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { Sprout, BookOpen, Library, Map, Plus } from '@lucide/vue'
import type { Component } from 'vue'

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

function projectIcon(project: Project): Component {
  switch (project.id) {
    case '1': return BookOpen
    case '2': return Library
    case '3': return Map
    default: return BookOpen
  }
}
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
  color: #fff;
  background: var(--brand);
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.project-rail__brand:hover {
  transform: scale(1.05);
  box-shadow: 0 3px 12px rgba(31, 90, 69, 0.25);
}

.project-rail__button {
  display: inline-grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border: 0;
  border-radius: 13px;
  color: var(--ink-2);
  background: transparent;
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease, transform 0.15s ease;
}

.project-rail__button:hover {
  color: var(--brand);
  background: var(--brand-soft);
  transform: scale(1.06);
}

.project-rail__button.is-active {
  color: var(--brand);
  background: var(--brand-soft);
  box-shadow: inset 2px 0 0 var(--brand);
}

.project-rail__button--add {
  margin-top: auto;
  color: var(--ink-3);
}
</style>