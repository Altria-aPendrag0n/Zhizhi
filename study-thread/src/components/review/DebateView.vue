<template>
  <div class="review-debate">
    <span class="review-debate__badge">辩论</span>
    <span class="review-debate__round">第 {{ round }} / {{ maxRounds }} 轮</span>
    <span v-if="position" class="review-debate__position">AI 持方：{{ position }}</span>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  /** 当前辩论轮次（用户第几次发言，从 1 起） */
  round: number
  maxRounds: number
  /** AI 持方观点（来自题面 position） */
  position?: string
}>()
</script>

<style scoped>
.review-debate {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 14px;
  border: 1px solid color-mix(in srgb, var(--color-primary, #4f7cff) 30%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--color-primary, #4f7cff) 6%, transparent);
}

.review-debate__badge {
  flex: none;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--color-primary, #4f7cff);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
}

.review-debate__round {
  flex: none;
  font-size: 13px;
  font-weight: 600;
  color: var(--foreground, #1f2328);
}

.review-debate__position {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: var(--muted-foreground, #6b7280);
}
</style>
