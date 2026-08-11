<template>
  <section class="vault-settings">
    <div class="vault-settings__heading">
      <div>
        <p class="vault-settings__eyebrow">Workspace</p>
        <h2 class="vault-settings__title">学习仓库</h2>
      </div>
      <span class="vault-settings__status" :class="{ 'is-open': vaultStore.vaultPath }">
        {{ vaultStore.vaultPath ? '已打开' : '未选择' }}
      </span>
    </div>

    <template v-if="vaultStore.vaultPath">
      <p class="vault-settings__path" :title="vaultStore.vaultPath">{{ vaultStore.vaultPath }}</p>
      <div class="vault-settings__actions">
        <button class="btn btn-primary" type="button" @click="handleOpenVault">切换 Vault</button>
        <button class="btn btn-secondary" type="button" @click="vaultStore.closeVault()">关闭</button>
      </div>
    </template>

    <template v-else>
      <p class="vault-settings__description">打开已有目录，或新建一个包含笔记与会话目录的 Vault。</p>
      <div class="vault-settings__actions">
        <button class="btn btn-primary" type="button" @click="handleOpenVault">打开 Vault</button>
        <button class="btn btn-secondary" type="button" @click="handleCreateVault">新建 Vault</button>
      </div>
    </template>

    <div v-if="settingsStore.recentVaults.length" class="vault-settings__recent">
      <h3 class="vault-settings__recent-title">最近打开</h3>
      <button
        v-for="vault in settingsStore.recentVaults"
        :key="vault"
        class="vault-settings__recent-item"
        type="button"
        :title="vault"
        @click="openVault(vault)"
      >
        {{ vault }}
      </button>
    </div>

    <p v-if="errorMessage" class="vault-settings__error">{{ errorMessage }}</p>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { open } from '@tauri-apps/plugin-dialog'
import { useSettingsStore } from '../../stores/settings'
import { useVaultStore } from '../../stores/vault'
import { createDir } from '../../utils/vault-fs'

const vaultStore = useVaultStore()
const settingsStore = useSettingsStore()
const errorMessage = ref('')

async function handleOpenVault() {
  const selected = await open({
    directory: true,
    multiple: false,
    title: '选择 Vault 目录',
  })
  const path = Array.isArray(selected) ? selected[0] : selected
  if (path) await openVault(path)
}

async function handleCreateVault() {
  const parentPath = await open({
    directory: true,
    multiple: false,
    title: '选择新 Vault 的父目录',
  })
  const resolvedParent = Array.isArray(parentPath) ? parentPath[0] : parentPath
  if (!resolvedParent) return

  const name = prompt('请输入新 Vault 名称：')?.trim()
  if (!name) return

  const path = joinPath(resolvedParent, name)

  try {
    await Promise.all([
      createDir(joinPath(path, 'notes')),
      createDir(joinPath(path, 'sessions')),
      createDir(joinPath(path, 'attachments')),
      createDir(joinPath(path, '.study-thread')),
    ])
    await openVault(path)
  } catch (error) {
    errorMessage.value = toErrorMessage(error, '新建 Vault 失败')
  }
}

async function openVault(path: string) {
  errorMessage.value = ''

  try {
    await vaultStore.openVault(path)
    settingsStore.addRecentVault(path)
  } catch (error) {
    errorMessage.value = toErrorMessage(error, '打开 Vault 失败')
  }
}

function joinPath(basePath: string, name: string): string {
  const separator = basePath.includes('\\') ? '\\' : '/'
  return `${basePath.replace(/[\\/]+$/, '')}${separator}${name}`
}

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? `${fallback}：${error.message}` : fallback
}
</script>

<style scoped>
.vault-settings {
  display: grid;
  gap: 16px;
  padding: 22px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
}

.vault-settings__heading,
.vault-settings__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.vault-settings__eyebrow {
  margin: 0 0 4px;
  color: var(--brand);
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.vault-settings__title,
.vault-settings__recent-title {
  margin: 0;
  color: var(--ink);
}

.vault-settings__title {
  font-size: 16px;
  font-weight: 650;
}

.vault-settings__status {
  padding: 4px 8px;
  border-radius: 999px;
  color: var(--ink-2);
  background: var(--surface-2);
  font-size: 11px;
}

.vault-settings__status.is-open {
  color: var(--state-success);
  background: color-mix(in srgb, var(--state-success) 12%, transparent);
}

.vault-settings__description,
.vault-settings__path {
  margin: 0;
  color: var(--ink-2);
  font-size: 13px;
  line-height: 1.55;
}

.vault-settings__path {
  overflow: hidden;
  padding: 10px 12px;
  border-radius: 6px;
  background: var(--surface-2);
  color: var(--ink);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vault-settings__actions {
  justify-content: flex-start;
}

.vault-settings__recent {
  display: grid;
  gap: 6px;
  padding-top: 4px;
}

.vault-settings__recent-title {
  font-size: 12px;
  font-weight: 650;
}

.vault-settings__recent-item {
  overflow: hidden;
  padding: 8px 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--ink-2);
  cursor: pointer;
  font-size: 12px;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vault-settings__recent-item:hover {
  background: var(--brand-soft);
  color: var(--ink);
}

.vault-settings__error {
  margin: 0;
  color: var(--state-error);
  font-size: 12px;
  line-height: 1.5;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 16px;
  border: 0;
  border-radius: var(--r-md);
  font-size: 13px;
  font-weight: 590;
  cursor: pointer;
  transition: background 0.15s;
}

.btn-primary {
  color: var(--brand-ink);
  background: var(--brand);
}

.btn-primary:hover {
  background: var(--brand-strong);
}

.btn-secondary {
  color: var(--ink);
  background: var(--surface-2);
}

.btn-secondary:hover {
  background: var(--line);
}
</style>
