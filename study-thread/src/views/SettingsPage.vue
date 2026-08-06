<template>
  <div class="settings-page">
    <div class="settings-page__header">
      <div class="eyebrow">Configuration</div>
      <h1 class="settings-page__title">设置</h1>
      <p class="settings-page__subtitle">管理学习仓库，并配置 API 连接和模型参数</p>
    </div>

    <VaultSettings class="settings-page__vault" />

    <div class="settings-page__form">
      <!-- 服务商选择 -->
      <div class="form-group">
        <label class="form-label">服务商</label>
        <select v-model="selectedProvider" class="form-select" @change="onProviderChange">
          <option value="anthropic">Anthropic (Claude)</option>
          <option value="openai">OpenAI</option>
          <option value="deepseek">DeepSeek</option>
          <option value="qwen">通义千问</option>
          <option value="zhipu">智谱 (GLM)</option>
          <option value="ollama">Ollama (本地)</option>
          <option value="custom">自定义</option>
        </select>
      </div>

      <!-- Base URL -->
      <div class="form-group">
        <label class="form-label">API 地址</label>
        <input
          v-model="baseUrl"
          type="text"
          class="form-input"
          placeholder="https://api.openai.com"
        />
      </div>

      <!-- API Key -->
      <div class="form-group">
        <label class="form-label">API Key</label>
        <div class="form-input-wrapper">
          <input
            v-model="apiKey"
            :type="showKey ? 'text' : 'password'"
            class="form-input"
            placeholder="sk-..."
          />
          <button
            type="button"
            class="form-input-toggle"
            @click="showKey = !showKey"
            :title="showKey ? '隐藏' : '显示'"
          >
            <Eye v-if="!showKey" :size="18" />
            <EyeOff v-else :size="18" />
          </button>
        </div>
      </div>

      <!-- 模型名称 -->
      <div class="form-group">
        <label class="form-label">模型名称</label>
        <input
          v-model="model"
          type="text"
          class="form-input"
          placeholder="gpt-4o"
        />
      </div>

      <!-- 联网搜索 -->
      <div class="form-group form-group--toggle">
        <div class="toggle-row">
          <label class="form-label" for="enable-web-search">联网搜索</label>
          <label class="toggle">
            <input id="enable-web-search" v-model="enableWebSearch" type="checkbox" />
            <span class="toggle__slider"></span>
          </label>
        </div>
        <p class="form-hint">请求时附带 web_search 工具；模型支持则自动联网搜索，不支持则自动降级为普通请求。DeepSeek 官方 API 将自动走 Anthropic 端点启用联网搜索。Ollama 等本地模型请关闭。</p>
      </div>

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

      <!-- 按钮组 -->
      <div class="form-actions">
        <button class="btn btn-primary" @click="handleSave">保存设置</button>
        <button class="btn btn-secondary" @click="handleTest" :disabled="testing">
          {{ testing ? '测试中...' : '连接测试' }}
        </button>
      </div>

      <!-- 测试结果 -->
      <div v-if="testResult" class="test-result" :class="testResult.type">
        <span class="test-result__icon">
          <CheckCircle v-if="testResult.type === 'success'" :size="16" />
          <AlertCircle v-else :size="16" />
        </span>
        <span class="test-result__text">{{ testResult.message }}</span>
      </div>

      <!-- 保存提示 -->
      <div v-if="saved" class="test-result success">
        <span class="test-result__icon"><CheckCircle :size="16" /></span>
        <span class="test-result__text">设置已保存</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Eye, EyeOff, CheckCircle, AlertCircle } from '@lucide/vue'
import { useSettingsStore } from '../stores/settings'
import { PROVIDER_PRESETS } from '../api/openai-compat'
import { createProvider } from '../api/provider-factory'
import VaultSettings from '../components/vault/VaultSettings.vue'

const settingsStore = useSettingsStore()

const selectedProvider = ref<string>('openai')
const baseUrl = ref('https://api.openai.com')
const apiKey = ref('')
const model = ref('gpt-4o')
const enableWebSearch = ref(true)
const autoGenerateNoteTitle = ref(true)
const autoGenerateNoteTags = ref(true)
const showKey = ref(false)
const testing = ref(false)
const saved = ref(false)
const testResult = ref<{ type: 'success' | 'error'; message: string } | null>(null)

// 服务商预设映射
const providerPresetKeys: Record<string, { type: 'anthropic' | 'openai-compat'; preset?: string }> = {
  anthropic: { type: 'anthropic' },
  openai: { type: 'openai-compat', preset: 'openai' },
  deepseek: { type: 'openai-compat', preset: 'deepseek' },
  qwen: { type: 'openai-compat', preset: 'qwen' },
  zhipu: { type: 'openai-compat', preset: 'zhipu' },
  ollama: { type: 'openai-compat', preset: 'ollama' },
  custom: { type: 'openai-compat' },
}

function onProviderChange() {
  const preset = providerPresetKeys[selectedProvider.value]
  if (preset?.preset && PROVIDER_PRESETS[preset.preset]) {
    const p = PROVIDER_PRESETS[preset.preset]
    baseUrl.value = p.baseUrl
    model.value = p.defaultModel
  }
  testResult.value = null
  saved.value = false
}

function handleSave() {
  settingsStore.activeProvider = providerPresetKeys[selectedProvider.value].type
  settingsStore.apiKey = apiKey.value
  settingsStore.baseUrl = baseUrl.value
  settingsStore.model = model.value
  settingsStore.enableWebSearch = enableWebSearch.value
  settingsStore.autoGenerateNoteTitle = autoGenerateNoteTitle.value
  settingsStore.autoGenerateNoteTags = autoGenerateNoteTags.value
  settingsStore.saveSettings()
  saved.value = true
  testResult.value = null
}

async function handleTest() {
  testing.value = true
  testResult.value = null
  saved.value = false

  const config = {
    type: providerPresetKeys[selectedProvider.value].type,
    apiKey: apiKey.value,
    baseUrl: baseUrl.value,
    model: model.value,
  }

  try {
    const provider = createProvider(config)
    const startTime = Date.now()
    const messages = [{ role: 'user' as const, content: 'hi' }]

    for await (const chunk of provider.chat(messages, { maxTokens: 10 })) {
      if (chunk.type === 'error') {
        testResult.value = { type: 'error', message: chunk.content }
        return
      }
      if (chunk.type === 'stop') {
        const latency = Date.now() - startTime
        testResult.value = { type: 'success', message: `连接成功！延迟: ${latency}ms` }
        return
      }
    }
    testResult.value = { type: 'success', message: '连接成功' }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    testResult.value = { type: 'error', message: `连接失败: ${message}` }
  } finally {
    testing.value = false
  }
}

onMounted(() => {
  // 从 store 恢复设置
  apiKey.value = settingsStore.apiKey
  baseUrl.value = settingsStore.baseUrl
  model.value = settingsStore.model
  enableWebSearch.value = settingsStore.enableWebSearch
  autoGenerateNoteTitle.value = settingsStore.autoGenerateNoteTitle
  autoGenerateNoteTags.value = settingsStore.autoGenerateNoteTags

  // 根据当前配置推断选中服务商
  if (settingsStore.activeProvider === 'anthropic') {
    selectedProvider.value = 'anthropic'
  } else {
    // 根据 baseUrl 匹配预设
    for (const [key, preset] of Object.entries(PROVIDER_PRESETS)) {
      if (settingsStore.baseUrl === preset.baseUrl) {
        selectedProvider.value = key
        return
      }
    }
    selectedProvider.value = 'custom'
  }
})
</script>

<style scoped>
.settings-page {
  padding: 42px 54px 72px;
  height: 100%;
  overflow-y: auto;
}

.settings-page__header {
  margin-bottom: 32px;
}

.eyebrow {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
  color: var(--brand);
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.13em;
  text-transform: uppercase;
}

.eyebrow::before {
  width: 22px;
  height: 1px;
  content: '';
  background: var(--brand);
}

.settings-page__title {
  margin: 0;
  font-family: Georgia, 'Songti SC', serif;
  font-size: 25px;
  font-weight: 600;
  letter-spacing: -0.03em;
  color: var(--ink);
}

.settings-page__subtitle {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--ink-2);
}

.settings-page__vault {
  margin-bottom: 28px;
}

.settings-page__form {
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

/* 联网搜索开关 */
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

@media (max-width: 1240px) {
  .settings-page {
    padding: 34px 34px 64px;
  }
}

@media (max-width: 860px) {
  .settings-page {
    padding: 22px 20px 56px;
  }
}
</style>

