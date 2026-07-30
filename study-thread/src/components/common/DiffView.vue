<template>
  <div class="diff-view" v-if="diff">
    <div class="diff-view__header">
      <h3 class="diff-view__title">学习画像更新</h3>
      <p class="diff-view__summary">{{ diff.summary }}</p>
    </div>

    <!-- 新增概念 -->
    <div class="diff-section" v-if="diff.added_concepts.length > 0">
      <h4 class="diff-section__title diff-section__title--added">
        新增概念 ({{ diff.added_concepts.length }})
      </h4>
      <div
        v-for="(item, index) in diff.added_concepts"
        :key="'added-' + index"
        class="diff-item diff-item--added"
      >
        <div class="diff-item__header">
          <span class="diff-item__name">{{ item.name }}</span>
          <span class="diff-item__confidence" :class="'confidence--' + item.confidence">
            {{ confidenceLabel(item.confidence || '') }}
          </span>
        </div>
        <p class="diff-item__desc" v-if="item.description">{{ item.description }}</p>
        <div class="diff-item__relations" v-if="item.prerequisites?.length || item.complements?.length">
          <span v-if="item.prerequisites?.length" class="diff-item__tag">
            前置: {{ item.prerequisites.join(', ') }}
          </span>
          <span v-if="item.complements?.length" class="diff-item__tag">
            互补: {{ item.complements.join(', ') }}
          </span>
        </div>
      </div>
    </div>

    <!-- 更新概念 -->
    <div class="diff-section" v-if="diff.updated_concepts.length > 0">
      <h4 class="diff-section__title diff-section__title--updated">
        更新概念 ({{ diff.updated_concepts.length }})
      </h4>
      <div
        v-for="(item, index) in diff.updated_concepts"
        :key="'updated-' + index"
        class="diff-item diff-item--updated"
      >
        <div class="diff-item__header">
          <span class="diff-item__name">{{ item.name }}</span>
          <span class="diff-item__confidence-change">
            <span class="confidence--old">{{ confidenceLabel(item.old_confidence || '') }}</span>
            <span class="diff-item__arrow">→</span>
            <span class="confidence--new">{{ confidenceLabel(item.new_confidence || '') }}</span>
          </span>
        </div>
        <p class="diff-item__desc" v-if="item.change_description">{{ item.change_description }}</p>
      </div>
    </div>

    <!-- 移除概念 -->
    <div class="diff-section" v-if="diff.removed_concepts.length > 0">
      <h4 class="diff-section__title diff-section__title--removed">
        移除概念 ({{ diff.removed_concepts.length }})
      </h4>
      <div
        v-for="(item, index) in diff.removed_concepts"
        :key="'removed-' + index"
        class="diff-item diff-item--removed"
      >
        <div class="diff-item__header">
          <span class="diff-item__name">{{ item.name }}</span>
        </div>
        <p class="diff-item__desc" v-if="item.reason">{{ item.reason }}</p>
      </div>
    </div>

    <!-- 建议主题 -->
    <div class="diff-section" v-if="diff.suggested_topics.length > 0">
      <h4 class="diff-section__title diff-section__title--suggested">
        建议学习主题 ({{ diff.suggested_topics.length }})
      </h4>
      <div
        v-for="(item, index) in diff.suggested_topics"
        :key="'suggested-' + index"
        class="diff-item diff-item--suggested"
      >
        <div class="diff-item__header">
          <span class="diff-item__name">{{ item.topic }}</span>
        </div>
        <p class="diff-item__desc">{{ item.reason }}</p>
      </div>
    </div>

    <!-- 空状态 -->
    <div class="diff-view__empty" v-if="isEmpty">
      本次会话没有检测到画像变化
    </div>

    <!-- 操作按钮 -->
    <div class="diff-view__actions">
      <button class="diff-view__btn diff-view__btn--cancel" @click="$emit('cancel')">
        取消
      </button>
      <button class="diff-view__btn diff-view__btn--confirm" @click="$emit('confirm', diff)">
        确认更新
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ProfileDiff } from '../../api/skills/update-learner'

const props = defineProps<{
  diff: ProfileDiff | null
}>()

defineEmits<{
  confirm: [diff: ProfileDiff]
  cancel: []
}>()

const isEmpty = computed(() => {
  if (!props.diff) return true
  return (
    props.diff.added_concepts.length === 0 &&
    props.diff.updated_concepts.length === 0 &&
    props.diff.removed_concepts.length === 0 &&
    props.diff.suggested_topics.length === 0
  )
})

function confidenceLabel(confidence: string): string {
  switch (confidence) {
    case 'high':
      return '已掌握'
    case 'medium':
      return '了解中'
    case 'low':
      return '初接触'
    default:
      return confidence
  }
}
</script>

<style scoped>
.diff-view {
  padding: 24px;
  max-width: 640px;
  margin: 0 auto;
  overflow-y: auto;
}

.diff-view__header {
  margin-bottom: 24px;
}

.diff-view__title {
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 700;
  color: var(--ink);
}

.diff-view__summary {
  margin: 0;
  font-size: 13px;
  color: var(--ink-2);
  line-height: 1.6;
}

.diff-section {
  margin-bottom: 20px;
}

.diff-section__title {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 650;
  padding: 6px 0;
  border-bottom: 1px solid var(--line);
}

.diff-section__title--added {
  color: #16a34a;
}

.diff-section__title--updated {
  color: #ca8a04;
}

.diff-section__title--removed {
  color: #dc2626;
}

.diff-section__title--suggested {
  color: var(--brand);
}

.diff-item {
  padding: 10px 14px;
  border-radius: 8px;
  margin-bottom: 6px;
  border: 1px solid var(--line);
}

.diff-item--added {
  border-left: 3px solid #16a34a;
  background: rgba(22, 163, 74, 0.04);
}

.diff-item--updated {
  border-left: 3px solid #ca8a04;
  background: rgba(202, 138, 4, 0.04);
}

.diff-item--removed {
  border-left: 3px solid #dc2626;
  background: rgba(220, 38, 38, 0.04);
  text-decoration: line-through;
  opacity: 0.7;
}

.diff-item--suggested {
  border-left: 3px solid var(--brand);
  background: var(--brand-soft);
}

.diff-item__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.diff-item__name {
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
}

.diff-item__confidence {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 500;
  white-space: nowrap;
}

.confidence--high {
  background: rgba(22, 163, 74, 0.12);
  color: #16a34a;
}

.confidence--medium {
  background: rgba(202, 138, 4, 0.12);
  color: #ca8a04;
}

.confidence--low {
  background: rgba(100, 116, 139, 0.12);
  color: #64748b;
}

.confidence--old {
  color: var(--ink-3);
  text-decoration: line-through;
  margin-right: 4px;
}

.confidence--new {
  color: #16a34a;
  font-weight: 600;
}

.diff-item__confidence-change {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}

.diff-item__arrow {
  color: var(--ink-3);
  margin: 0 2px;
}

.diff-item__desc {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--ink-2);
  line-height: 1.5;
}

.diff-item__relations {
  margin-top: 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.diff-item__tag {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--surface-2);
  color: var(--ink-2);
}

.diff-view__empty {
  text-align: center;
  padding: 32px;
  color: var(--ink-3);
  font-size: 13px;
}

.diff-view__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
}

.diff-view__btn {
  padding: 8px 20px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid var(--line);
  transition: background 0.15s, border-color 0.15s;
}

.diff-view__btn--cancel {
  background: var(--surface);
  color: var(--ink-2);
}

.diff-view__btn--cancel:hover {
  background: var(--surface-2);
}

.diff-view__btn--confirm {
  background: var(--brand);
  color: #fff;
  border-color: var(--brand);
}

.diff-view__btn--confirm:hover {
  opacity: 0.9;
}
</style>