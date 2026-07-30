<template>
  <div class="settings-page">
    <div class="settings-page__header">
      <h1 class="text-xl font-bold text-primary">设置</h1>
      <p class="text-sm text-muted-foreground mt-1">配置 API 连接和模型参数</p>
    </div>

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

const settingsStore = useSettingsStore()

const selectedProvider = ref<string>('openai')
const baseUrl = ref('https://api.openai.com')
const apiKey = ref('')
const model = ref('gpt-4o')
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
  max-width: 560px;
  margin: 0 auto;
  padding: 32px 24px;
}

.settings-page__header {
  margin-bottom: 32px;
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
  border-radius: 8px;
  background: var(--surface-1);
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
  color: var(--muted-foreground);
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
  border-radius: 8px;
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
  border-radius: 8px;
  font-size: 13px;
}

.test-result.success {
  background: color-mix(in srgb, var(--color-green, #22c55e) 12%, transparent);
  color: var(--color-green, #16a34a);
}

.test-result.error {
  background: color-mix(in srgb, var(--color-red, #ef4444) 12%, transparent);
  color: var(--color-red, #dc2626);
}

.test-result__icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.test-result__text {
  line-height: 1.4;
}
</style>