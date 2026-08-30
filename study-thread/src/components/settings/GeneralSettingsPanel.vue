<template>
  <div class="general-panel">
    <VaultSettings class="general-panel__vault" />

    <div class="general-panel__form">
      <!-- 自动生成笔记标题 -->
      <div class="form-group form-group--toggle">
        <div class="toggle-row">
          <label class="form-label" for="auto-generate-note-title">自动生成笔记标题</label>
          <label class="toggle">
            <input id="auto-generate-note-title" v-model="autoGenerateNoteTitle" type="checkbox" />
            <span class="toggle__slider"></span>
          </label>
        </div>
        <p class="form-hint">划线摘录笔记时，允许 LLM 根据内容自动拟定标题；关闭后用划线文本前 20 字作为标题，跳过 LLM 生成环节（手动指定标题始终优先）。</p>
      </div>

      <!-- 自动生成笔记标签 -->
      <div class="form-group form-group--toggle">
        <div class="toggle-row">
          <label class="form-label" for="auto-generate-note-tags">自动生成笔记标签</label>
          <label class="toggle">
            <input id="auto-generate-note-tags" v-model="autoGenerateNoteTags" type="checkbox" />
            <span class="toggle__slider"></span>
          </label>
        </div>
        <p class="form-hint">划线摘录笔记时，允许 LLM 根据内容自动生成标签；关闭后统一使用「未分类」标签，跳过 LLM 生成环节。两者都关闭时，摘录笔记将完全不调用 LLM。</p>
      </div>

      <!-- 复习间隔算法 -->
      <div class="form-group">
        <label class="form-label" for="review-algorithm">复习间隔算法</label>
        <select id="review-algorithm" v-model="reviewAlgorithm" class="form-select">
          <option value="classic">经典间隔序列（默认）</option>
          <option value="fsrs">FSRS 个性化（基于评级历史拟合遗忘曲线）</option>
        </select>
        <p class="form-hint">
          经典模式按笔记类型使用固定间隔序列推进；FSRS 模式根据你的历史评级表现动态调整每次间隔，评级历史不足时自动回退经典模式。
        </p>
      </div>

      <!-- 保存提示 -->
      <div class="form-actions">
        <button class="btn btn-primary" @click="handleSave">保存设置</button>
      </div>

      <!-- 保存提示 -->
      <div v-if="saved" class="test-result success">
        <span class="test-result__icon"><CheckCircle :size="16" /></span>
        <span class="test-result__text">设置已保存</span>
      </div>
    </div>

    <!-- 调试日志 -->
    <div class="general-panel__logs">
      <div class="logs-header">
        <h3 class="logs-title">调试日志</h3>
        <button class="btn btn-secondary btn--sm" :disabled="logs.length === 0" @click="handleClearLogs">
          清空
        </button>
      </div>
      <p class="form-hint">
        记录最近 {{ logs.length }} 条运行时日志（保留 {{ MAX_LOGS }} 条）。LLM 出题解析失败时会在日志中写入完整响应，便于排查 JSON 截断等问题。
      </p>
      <div v-if="logs.length === 0" class="logs-empty">暂无日志</div>
      <div v-else class="logs-list">
        <div v-for="(log, index) in logs" :key="index" class="logs-item" :class="`logs-item--${log.level}`">
          <span class="logs-item__time">{{ formatLogTime(log.at) }}</span>
          <span class="logs-item__module">{{ log.module }}</span>
          <span class="logs-item__message">{{ log.message }}</span>
          <pre v-if="log.meta" class="logs-item__meta">{{ log.meta }}</pre>
        </div>
      </div>
    </div>

    <!-- 关于与版本信息 -->
    <AboutSection class="general-panel__about" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { CheckCircle } from '@lucide/vue'
import { useSettingsStore } from '../../stores/settings'
import { getLogs, clearLogs, MAX_LOGS, type LogEntry } from '../../utils/logger'
import VaultSettings from '../vault/VaultSettings.vue'
import AboutSection from '../shell/AboutSection.vue'
import type { ReviewAlgorithm } from '../../types'

const settingsStore = useSettingsStore()

const autoGenerateNoteTitle = ref(true)
const autoGenerateNoteTags = ref(true)
const reviewAlgorithm = ref<ReviewAlgorithm>('classic')
const saved = ref(false)
// 调试日志（设置页展示，便于排查运行时问题）
const logs = ref<LogEntry[]>([])

/** 加载日志（正序展示最新在末尾） */
function loadLogs() {
  logs.value = getLogs()
}

/** 时间仅显示 HH:mm:ss，便于列表紧凑展示 */
function formatLogTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function handleClearLogs() {
  clearLogs()
  logs.value = []
}

function handleSave() {
  settingsStore.autoGenerateNoteTitle = autoGenerateNoteTitle.value
  settingsStore.autoGenerateNoteTags = autoGenerateNoteTags.value
  settingsStore.reviewAlgorithm = reviewAlgorithm.value
  settingsStore.saveSettings()
  saved.value = true
}

onMounted(() => {
  // 从 store 恢复设置
  autoGenerateNoteTitle.value = settingsStore.autoGenerateNoteTitle
  autoGenerateNoteTags.value = settingsStore.autoGenerateNoteTags
  reviewAlgorithm.value = settingsStore.reviewAlgorithm
  loadLogs()
})
</script>

<style scoped>
.general-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.general-panel__vault {
  margin-bottom: 8px;
}

.general-panel__form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: 13px;
  font-weight: 590;
  color: var(--ink);
}

.form-input,
.form-select {
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
  color: var(--ink);
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s;
}

.form-input:focus,
.form-select:focus {
  border-color: var(--brand);
}

.form-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.form-input-wrapper .form-input {
  flex: 1;
  padding-right: 40px;
}

.form-input-toggle {
  position: absolute;
  right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background: transparent;
  color: var(--ink-2);
  cursor: pointer;
  padding: 2px;
}

.form-input-toggle:hover {
  color: var(--ink);
}

.form-actions {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 20px;
  border: 0;
  border-radius: var(--r-md);
  font-size: 13px;
  font-weight: 590;
  cursor: pointer;
  transition: background 0.15s, opacity 0.15s;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary {
  color: var(--brand-ink);
  background: var(--brand);
}

.btn-primary:hover:not(:disabled) {
  background: var(--brand-strong);
}

.btn-secondary {
  color: var(--ink);
  background: var(--surface-2);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--line);
}

.test-result {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: var(--r-md);
  font-size: 13px;
}

.test-result.success {
  background: color-mix(in srgb, var(--state-success) 12%, transparent);
  color: var(--state-success);
}

.test-result.error {
  background: color-mix(in srgb, var(--state-error) 12%, transparent);
  color: var(--state-error);
}

.test-result__icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.test-result__text {
  line-height: 1.4;
}

/* 开关行 */
.form-group--toggle {
  padding: 14px 16px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
}

.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.toggle-row .form-label {
  margin: 0;
}

.form-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--ink-2);
}

.toggle {
  position: relative;
  flex-shrink: 0;
  display: inline-flex;
  width: 40px;
  height: 22px;
  cursor: pointer;
}

.toggle input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle__slider {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background: var(--ink-3);
  transition: background-color 0.2s;
}

.toggle__slider::before {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  content: '';
  background: #fff;
  transition: transform 0.2s;
}

.toggle input:checked + .toggle__slider {
  background: var(--brand);
}

.toggle input:checked + .toggle__slider::before {
  transform: translateX(18px);
}

/* 调试日志面板 */
.general-panel__logs {
  padding-top: 28px;
  border-top: 1px solid var(--line);
}

.logs-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.logs-title {
  margin: 0;
  font-family: Georgia, 'Songti SC', serif;
  font-size: 18px;
  font-weight: 600;
  color: var(--ink);
}

.btn--sm {
  padding: 5px 12px;
  font-size: 12px;
}

.logs-empty {
  padding: 22px 0;
  text-align: center;
  font-size: 13px;
  color: var(--ink-2);
}

.logs-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 320px;
  margin-top: 12px;
  padding: 12px;
  overflow-y: auto;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
}

.logs-item {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  padding: 6px 10px;
  border-left: 3px solid var(--ink-3);
  border-radius: 4px;
  background: var(--surface-2);
  font-size: 12px;
  line-height: 1.5;
}

.logs-item--error {
  border-left-color: var(--state-error);
}

.logs-item--warn {
  border-left-color: var(--state-warning);
}

.logs-item__time {
  flex-shrink: 0;
  color: var(--ink-3);
  font-variant-numeric: tabular-nums;
}

.logs-item__module {
  flex-shrink: 0;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--line);
  color: var(--ink-2);
  font-size: 11px;
}

.logs-item__message {
  color: var(--ink);
  word-break: break-all;
}

.logs-item__meta {
  width: 100%;
  margin: 2px 0 0;
  padding: 8px;
  overflow-x: auto;
  border-radius: 4px;
  background: color-mix(in srgb, var(--ink-3) 12%, transparent);
  color: var(--ink-2);
  font-size: 11px;
  white-space: pre-wrap;
  word-break: break-all;
}

.general-panel__about {
  margin-top: 16px;
}
</style>
