<template>
  <div class="plan-preview">
    <header class="plan-preview__header">
      <div class="plan-preview__heading">
        <h3 class="plan-preview__title">{{ draft.title }}</h3>
        <p v-if="draft.goal" class="plan-preview__goal">{{ draft.goal }}</p>
      </div>
      <span class="plan-preview__meta">
        每日约 {{ draft.daily_minutes }} 分钟 · 共 {{ draft.tasks.length }} 个任务
      </span>
    </header>

    <section v-for="phase in phaseGroups" :key="phase.id" class="plan-preview__phase">
      <h4 class="plan-preview__phase-title">{{ phase.title }}</h4>
      <p v-if="phase.objective" class="plan-preview__phase-objective">{{ phase.objective }}</p>
      <ul class="plan-preview__tasks">
        <li v-for="task in phase.tasks" :key="task.id" class="plan-preview__task">
          <div class="plan-preview__task-row">
            <span class="plan-preview__task-title">{{ task.title }}</span>
            <span class="plan-preview__task-estimate">约 {{ task.estimate }} 分钟</span>
          </div>
          <p v-if="task.detail" class="plan-preview__task-detail">{{ task.detail }}</p>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PlanDoc, PlanPhase, PlanTask } from '../../types'

const props = defineProps<{
  /** AI 生成并归一化的计划草稿（plan-architect extractPlanDraft 的产物） */
  draft: PlanDoc
}>()

interface PhaseGroup extends PlanPhase {
  tasks: PlanTask[]
}

/** 任务按所属阶段分组；phase 指向未知阶段时归入「其他任务」组，空阶段不展示 */
const phaseGroups = computed<PhaseGroup[]>(() => {
  const groups: PhaseGroup[] = props.draft.phases.map((phase) => ({ ...phase, tasks: [] }))
  const byId = new Map(groups.map((group) => [group.id, group]))
  const fallback: PhaseGroup = { id: '__other__', title: '其他任务', tasks: [] }
  for (const task of props.draft.tasks) {
    ;(byId.get(task.phase) ?? fallback).tasks.push(task)
  }
  return [...groups.filter((group) => group.tasks.length > 0), ...(fallback.tasks.length > 0 ? [fallback] : [])]
})
</script>

<style scoped>
.plan-preview {
  display: flex;
  flex-direction: column;
  gap: var(--s-4);
}

.plan-preview__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--s-4);
}

.plan-preview__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--ink);
}

.plan-preview__goal {
  margin: var(--s-1) 0 0;
  font-size: 13px;
  color: var(--ink-2);
}

.plan-preview__meta {
  flex-shrink: 0;
  padding: 2px 10px;
  border-radius: var(--r-pill);
  background: var(--brand-soft);
  color: var(--brand-strong);
  font-size: 12px;
  white-space: nowrap;
}

.plan-preview__phase {
  padding: var(--s-3);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface-2);
}

.plan-preview__phase-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--brand-strong);
}

.plan-preview__phase-objective {
  margin: var(--s-1) 0 0;
  font-size: 12px;
  color: var(--ink-2);
}

.plan-preview__tasks {
  margin: var(--s-2) 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
}

.plan-preview__task {
  padding: var(--s-2) var(--s-3);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
}

.plan-preview__task-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--s-3);
}

.plan-preview__task-title {
  font-size: 13px;
  color: var(--ink);
}

.plan-preview__task-estimate {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--ink-3);
}

.plan-preview__task-detail {
  margin: var(--s-1) 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--ink-2);
}
</style>
