<template>
  <section class="about-section">
    <div class="about-section__heading">
      <div>
        <p class="about-section__eyebrow">About</p>
        <h2 class="about-section__title">关于知枝</h2>
      </div>
      <span class="about-section__badge">测试版</span>
    </div>

    <p class="about-section__desc">
      知枝（Study Thread）—— 把每一次问答、每一篇笔记、每一轮复习沉淀成可检索、可回顾的学习资产。
    </p>

    <dl class="about-section__meta">
      <div class="about-section__meta-row">
        <dt>版本</dt>
        <dd>v{{ version }}</dd>
      </div>
      <div class="about-section__meta-row">
        <dt>发布状态</dt>
        <dd>v0.1 测试版（Beta）</dd>
      </div>
      <div class="about-section__meta-row">
        <dt>数据存放</dt>
        <dd>本地 Vault 目录（数据不自动上传）</dd>
      </div>
    </dl>

    <p class="about-section__notice">
      本版本为测试版，功能仍在迭代中，数据格式与界面可能变化。遇到问题或想提建议，欢迎反馈给我们。
    </p>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { getVersion } from '@tauri-apps/api/app'

/** 兜底版本号（非 Tauri 环境 / getVersion 失败时展示） */
const version = ref('0.1.0')

onMounted(async () => {
  try {
    version.value = await getVersion()
  } catch {
    // 浏览器调试等非 Tauri 环境下降级为默认版本号
  }
})
</script>

<style scoped>
.about-section {
  display: grid;
  gap: 12px;
  padding: 22px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
}

.about-section__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.about-section__eyebrow {
  margin: 0 0 4px;
  color: var(--brand);
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.about-section__title {
  margin: 0;
  color: var(--ink);
  font-size: 16px;
  font-weight: 650;
}

.about-section__badge {
  flex-shrink: 0;
  padding: 4px 10px;
  border-radius: 999px;
  color: #7b4e0e;
  background: color-mix(in srgb, var(--state-warning) 16%, transparent);
  font-size: 11px;
  font-weight: 650;
}

.about-section__desc {
  margin: 0;
  color: var(--ink-2);
  font-size: 13px;
  line-height: 1.55;
}

.about-section__meta {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 12px 14px;
  border-radius: 6px;
  background: var(--surface-2);
}

.about-section__meta-row {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.about-section__meta-row dt {
  flex-shrink: 0;
  width: 72px;
  color: var(--ink-3);
  font-size: 12px;
}

.about-section__meta-row dd {
  margin: 0;
  color: var(--ink);
  font-size: 13px;
  font-weight: 550;
}

.about-section__notice {
  margin: 0;
  color: var(--ink-3);
  font-size: 12px;
  line-height: 1.6;
}
</style>
