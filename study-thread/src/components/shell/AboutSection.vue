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
      本版本为测试版，功能仍在迭代中，数据格式与界面可能变化。遇到问题或想提建议，请使用下方反馈工具，连同问题描述一起发送给我们。
    </p>

    <!-- 应用更新 -->
    <div class="about-section__update">
      <div class="about-section__update-info">
        <p class="about-section__update-label">应用更新</p>
        <p class="about-section__update-hint">发布新版本后在此检查并自动安装</p>
      </div>
      <button class="btn btn-secondary" type="button" :disabled="checkingUpdate" @click="handleCheckUpdate">
        <RefreshCw :size="15" :class="{ 'is-spinning': checkingUpdate }" />
        {{ checkingUpdate ? '检查中…' : '检查更新' }}
      </button>
    </div>

    <!-- 反馈工具 -->
    <div class="about-section__feedback">
      <div class="about-section__feedback-head">
        <h3 class="about-section__feedback-title">反馈与帮助</h3>
        <span class="about-section__feedback-hint">便于我们定位问题，反馈请附带版本与日志，发送至 {{ FEEDBACK_EMAIL }}</span>
      </div>
      <div class="about-section__feedback-actions">
        <button class="btn btn-secondary" type="button" @click="handleExportLogs">
          <Download :size="15" />
          导出调试日志
        </button>
        <button class="btn btn-secondary" type="button" @click="handleCopyFeedback">
          <Copy :size="15" />
          复制反馈信息
        </button>
        <button class="btn btn-secondary" type="button" @click="handleMailFeedback">
          <Mail :size="15" />
          邮件反馈
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { getVersion } from '@tauri-apps/api/app'
import { save } from '@tauri-apps/plugin-dialog'
import { openUrl } from '@tauri-apps/plugin-opener'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { Download, Copy, Mail, RefreshCw } from '@lucide/vue'
import { getLogs, type LogEntry } from '../../utils/logger'
import { writeFile } from '../../utils/vault-fs'
import { useToast } from '../../composables/useToast'

/** 反馈邮箱（测试版用户问题/建议统一收件地址） */
const FEEDBACK_EMAIL = '1074253861@qq.com'
/** 兜底版本号（非 Tauri 环境 / getVersion 失败时展示） */
const version = ref('0.1.0')
const toast = useToast()

onMounted(async () => {
  try {
    version.value = await getVersion()
  } catch {
    // 浏览器调试等非 Tauri 环境下降级为默认版本号
  }
})

/** 简化平台描述：navigator.platform 在新版本 WebView 中可能被禁用，回退 userAgent 判断 */
function describePlatform(): string {
  const platform = (navigator.platform || '').toLowerCase()
  const ua = navigator.userAgent
  if (/Windows/i.test(ua) || platform.includes('win')) return 'Windows'
  if (/Mac/i.test(ua) || platform.includes('mac')) return 'macOS'
  if (/Linux/i.test(ua)) return 'Linux'
  return navigator.platform || '未知'
}

function formatLogTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function logToLine(log: LogEntry): string {
  const meta = log.meta ? `\n      ${log.meta}` : ''
  return `[${formatLogTime(log.at)}] [${log.level}] [${log.module}] ${log.message}${meta}`
}

/** 组装反馈信息全文（版本 / 平台 / 最近日志 / 指引），导出与复制共用 */
function buildFeedbackText(): string {
  const logs = getLogs()
  const recent = logs.slice(-30)
  return [
    '知枝 (Study Thread) · 反馈信息',
    '================================',
    `版本: v${version.value}`,
    `平台: ${describePlatform()}`,
    `时间: ${new Date().toLocaleString('zh-CN')}`,
    '================================',
    `最近调试日志（共 ${recent.length} 条）:`,
    ...recent.map(logToLine),
    '================================',
    `反馈指引: 请将以上信息与问题描述一起通过「邮件反馈」发送至 ${FEEDBACK_EMAIL}，便于定位问题。`,
  ].join('\n')
}

/** 一键导出调试日志到用户选择的文件 */
async function handleExportLogs() {
  const fileName = `zhizhi-logs-${new Date().toISOString().slice(0, 10)}.txt`
  try {
    const target = await save({
      defaultPath: fileName,
      filters: [{ name: '文本文件', extensions: ['txt'] }],
    })
    if (!target) return // 用户取消保存
    await writeFile(target, buildFeedbackText())
    toast.success('调试日志已导出')
  } catch (e) {
    toast.error(`导出日志失败：${e instanceof Error ? e.message : String(e)}`)
  }
}

/** 复制反馈信息到剪贴板 */
async function handleCopyFeedback() {
  try {
    await navigator.clipboard.writeText(buildFeedbackText())
    toast.success('反馈信息已复制，请连同问题描述一起发送')
  } catch {
    toast.error('复制失败，请尝试截图「调试日志」面板')
  }
}

/** 组装 mailto 链接：预填收件人/主题/正文模板，日志文件由用户拖入附件 */
function buildMailtoHref(): string {
  const subject = `知枝 v${version.value} 反馈`
  const body = [
    `知枝 v${version.value} 反馈`,
    '',
    `平台: ${describePlatform()}`,
    `时间: ${new Date().toLocaleString('zh-CN')}`,
    '',
    '问题描述:',
    '',
    '（请将「导出调试日志」生成的 .txt 文件拖入邮件附件）',
  ].join('\n')
  return `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

/** 一键打开邮件客户端反馈 */
async function handleMailFeedback() {
  try {
    await openUrl(buildMailtoHref())
    toast.info(`已打开邮件客户端，请填写问题描述并附上日志，发送至 ${FEEDBACK_EMAIL}`)
  } catch (e) {
    toast.error(`打开邮件客户端失败：${e instanceof Error ? e.message : String(e)}`)
  }
}

/** 检查更新中标记（防重复点击） */
const checkingUpdate = ref(false)

/**
 * 检查更新：对比最新版本 → 下载安装 → 重启应用。
 * 未配置更新服务（缺少签名公钥/更新仓库）或网络异常时降级为错误提示，不影响使用。
 */
async function handleCheckUpdate() {
  if (checkingUpdate.value) return
  checkingUpdate.value = true
  try {
    const update = await check()
    if (!update) {
      toast.success('已是最新版本')
      return
    }
    toast.info(`发现新版本 v${update.version}，正在后台下载安装…`)
    await update.downloadAndInstall((progress) => {
      // 下载过程不打扰用户，仅在下载完成时提示
      if (progress.event === 'Finished') {
        toast.info('更新下载完成，正在安装…')
      }
    })
    toast.success('更新已安装，应用即将重启')
    await relaunch()
  } catch (e) {
    toast.error(`检查更新失败：${e instanceof Error ? e.message : String(e)}`)
  } finally {
    checkingUpdate.value = false
  }
}
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

/* 应用更新 */
.about-section__update {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface-2);
}

.about-section__update-info {
  display: grid;
  gap: 2px;
}

.about-section__update-label {
  margin: 0;
  color: var(--ink);
  font-size: 13px;
  font-weight: 650;
}

.about-section__update-hint {
  margin: 0;
  color: var(--ink-3);
  font-size: 11px;
}

.about-section__update .is-spinning {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* 反馈工具 */
.about-section__feedback {
  display: grid;
  gap: 10px;
  padding: 14px 16px;
  border: 1px dashed var(--line);
  border-radius: var(--r-md);
  background: var(--surface-2);
}

.about-section__feedback-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.about-section__feedback-title {
  margin: 0;
  color: var(--ink);
  font-size: 13px;
  font-weight: 650;
}

.about-section__feedback-hint {
  color: var(--ink-3);
  font-size: 11px;
}

.about-section__feedback-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.about-section__feedback-actions .btn {
  gap: 6px;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 16px;
  border: 0;
  border-radius: var(--r-md);
  font-size: 13px;
  font-weight: 590;
  cursor: pointer;
  transition: background 0.15s;
}

.btn-secondary {
  color: var(--ink);
  background: var(--surface);
  border: 1px solid var(--line);
}

.btn-secondary:hover {
  background: var(--line);
}
</style>
