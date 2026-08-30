<template>
  <div class="settings-page">
    <div class="settings-page__header">
      <button type="button" class="back-link" @click="goBack">
        <ArrowLeft :size="14" />
        返回模型配置
      </button>
      <div class="eyebrow">Model Configuration</div>
      <h1 class="settings-page__title">自定义模型</h1>
      <p class="settings-page__subtitle">自持 API Key，支持多家服务商与本地模型（BYOK），配置保存在本机</p>
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

      <!-- 图片转笔记模型（独立配置，与对话模型解耦） -->
      <div class="form-group form-group--toggle">
        <div class="toggle-row">
          <label class="form-label" for="vision-enabled">图片转笔记模型</label>
          <label class="toggle">
            <input id="vision-enabled" v-model="visionEnabled" type="checkbox" />
            <span class="toggle__slider"></span>
          </label>
        </div>
        <p class="form-hint">用于把图片识别为 Markdown 笔记或参考资料（OCR + 表格还原）。OpenAI 兼容格式，默认智谱 GLM-4V-Flash 端点；与对话模型相互独立。</p>
      </div>

      <template v-if="visionEnabled">
        <div class="form-group">
          <label class="form-label" for="vision-base-url">转笔记 API 地址</label>
          <input
            id="vision-base-url"
            v-model="visionBaseUrl"
            type="text"
            class="form-input"
            placeholder="https://open.bigmodel.cn/api/paas"
          />
        </div>

        <div class="form-group">
          <label class="form-label" for="vision-api-key">转笔记 API Key</label>
          <div class="form-input-wrapper">
            <input
              id="vision-api-key"
              v-model="visionApiKey"
              :type="showVisionKey ? 'text' : 'password'"
              class="form-input"
              placeholder="sk-..."
            />
            <button
              type="button"
              class="form-input-toggle"
              @click="showVisionKey = !showVisionKey"
              :title="showVisionKey ? '隐藏' : '显示'"
            >
              <Eye v-if="!showVisionKey" :size="18" />
              <EyeOff v-else :size="18" />
            </button>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="vision-model">转笔记模型名称</label>
          <input
            id="vision-model"
            v-model="visionModel"
            type="text"
            class="form-input"
            placeholder="glm-4v-flash"
          />
          <p class="form-hint">支持多模态图片输入的模型，如 glm-4v-flash（免费）、qwen-vl-plus 等。</p>
        </div>

        <div class="form-actions">
          <button class="btn btn-secondary" @click="handleVisionTest" :disabled="visionTesting">
            {{ visionTesting ? '测试中...' : '转笔记模型连接测试' }}
          </button>
        </div>

        <!-- 测试结果 -->
        <div v-if="visionTestResult" class="test-result" :class="visionTestResult.type">
          <span class="test-result__icon">
            <CheckCircle v-if="visionTestResult.type === 'success'" :size="16" />
            <AlertCircle v-else :size="16" />
          </span>
          <span class="test-result__text">{{ visionTestResult.message }}</span>
        </div>
      </template>

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
import { useRouter } from 'vue-router'
import { Eye, EyeOff, CheckCircle, AlertCircle, ArrowLeft } from '@lucide/vue'
import { useSettingsStore } from '../stores/settings'
import { PROVIDER_PRESETS } from '../api/openai-compat'
import { createProvider, createVisionProvider } from '../api/provider-factory'

const router = useRouter()
const settingsStore = useSettingsStore()

function goBack() {
  router.push({ name: 'settings-models' })
}

const selectedProvider = ref<string>('openai')
const baseUrl = ref('https://api.openai.com')
const apiKey = ref('')
const model = ref('gpt-4o')
const enableWebSearch = ref(true)
const showKey = ref(false)
const testing = ref(false)
const saved = ref(false)
const testResult = ref<{ type: 'success' | 'error'; message: string } | null>(null)
// 图片转笔记模型（独立配置）
const visionEnabled = ref(false)
const visionBaseUrl = ref('https://open.bigmodel.cn/api/paas')
const visionApiKey = ref('')
const visionModel = ref('glm-4v-flash')
const showVisionKey = ref(false)
const visionTesting = ref(false)
const visionTestResult = ref<{ type: 'success' | 'error'; message: string } | null>(null)

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
  settingsStore.visionEnabled = visionEnabled.value
  settingsStore.visionBaseUrl = visionBaseUrl.value
  settingsStore.visionApiKey = visionApiKey.value
  settingsStore.visionModel = visionModel.value
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

    for await (const chunk of provider.chat(messages, { maxTokens: 10, busyMessage: 'AI 正在测试连接…' })) {
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

async function handleVisionTest() {
  visionTesting.value = true
  visionTestResult.value = null

  if (!visionApiKey.value.trim()) {
    visionTestResult.value = { type: 'error', message: '请先填写转笔记 API Key' }
    visionTesting.value = false
    return
  }

  try {
    const provider = createVisionProvider({
      type: 'openai-compat',
      apiKey: visionApiKey.value.trim(),
      baseUrl: visionBaseUrl.value.trim() || 'https://open.bigmodel.cn/api/paas',
      model: visionModel.value.trim() || 'glm-4v-flash',
    })
    const startTime = Date.now()
    const messages = [{ role: 'user' as const, content: 'hi' }]

    for await (const chunk of provider.chat(messages, { maxTokens: 10, busyMessage: 'AI 正在测试转笔记模型连接…' })) {
      if (chunk.type === 'error') {
        visionTestResult.value = { type: 'error', message: chunk.content }
        return
      }
      if (chunk.type === 'stop') {
        const latency = Date.now() - startTime
        visionTestResult.value = { type: 'success', message: `连接成功！延迟: ${latency}ms` }
        return
      }
    }
    visionTestResult.value = { type: 'success', message: '连接成功' }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    visionTestResult.value = { type: 'error', message: `连接失败: ${message}` }
  } finally {
    visionTesting.value = false
  }
}

onMounted(() => {
  // 从 store 恢复设置
  apiKey.value = settingsStore.apiKey
  baseUrl.value = settingsStore.baseUrl
  model.value = settingsStore.model
  enableWebSearch.value = settingsStore.enableWebSearch
  visionEnabled.value = settingsStore.visionEnabled
  visionBaseUrl.value = settingsStore.visionBaseUrl
  visionApiKey.value = settingsStore.visionApiKey
  visionModel.value = settingsStore.visionModel

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

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 14px;
  padding: 4px 0;
  border: 0;
  background: transparent;
  color: var(--ink-2);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.back-link:hover {
  color: var(--ink);
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
