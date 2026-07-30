<template>
  <div class="vault-settings">
    <div v-if="!vaultStore.vaultPath" class="vault-settings__empty">
      <div class="vault-settings__welcome">
        <h2 class="text-lg font-bold text-primary mb-2">欢迎使用知枝</h2>
        <p class="text-muted-foreground text-sm mb-6">打开或创建一个 Vault 开始学习</p>
        <div class="vault-settings__actions">
          <button class="btn btn-primary" @click="handleOpenVault">打开 Vault</button>
          <button class="btn btn-secondary" @click="handleCreateVault">新建 Vault</button>
        </div>
      </div>
      <div v-if="settingsStore.recentVaults.length > 0" class="vault-settings__recent">
        <h3 class="text-sm font-semibold mb-2">最近打开</h3>
        <button
          v-for="vault in settingsStore.recentVaults"
          :key="vault"
          class="vault-settings__recent-item"
          @click="openVault(vault)"
        >
          {{ vault }}
        </button>
      </div>
    </div>
    <div v-else class="vault-settings__info">
      <span class="text-sm text-muted-foreground truncate">{{ vaultStore.vaultPath }}</span>
      <button class="btn btn-secondary text-xs" @click="vaultStore.closeVault()">关闭</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useVaultStore } from '../../stores/vault'
import { useSettingsStore } from '../../stores/settings'

const vaultStore = useVaultStore()
const settingsStore = useSettingsStore()

function handleOpenVault() {
  // Tauri 环境下使用 dialog，非 Tauri 环境使用 prompt
  const path = prompt('请输入 Vault 目录路径：')
  if (path) openVault(path)
}

function handleCreateVault() {
  const name = prompt('请输入新 Vault 名称：')
  if (name) {
    const path = prompt('请选择父目录路径（默认：桌面）：') || ''
    const fullPath = path ? `${path}/${name}` : name
    openVault(fullPath)
  }
}

function openVault(path: string) {
  vaultStore.openVault(path)
  settingsStore.addRecentVault(path)
}
</script>

<style scoped>
.vault-settings { padding: 16px; }
.vault-settings__empty { text-align: center; }
.vault-settings__welcome { padding: 32px 16px; }
.vault-settings__actions { display: flex; gap: 8px; justify-content: center; }
.vault-settings__recent { margin-top: 24px; text-align: left; }
.vault-settings__recent-item {
  display: block; width: 100%; padding: 8px 12px; border: 0; border-radius: 6px;
  background: transparent; color: var(--ink); font-size: 12px; text-align: left;
  cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.vault-settings__recent-item:hover { background: var(--brand-soft); }
.vault-settings__info { display: flex; align-items: center; gap: 8px; }

.btn {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 8px 16px; border: 0; border-radius: 8px; font-size: 13px;
  font-weight: 590; cursor: pointer; transition: background 0.15s;
}
.btn-primary { color: var(--brand-ink); background: var(--brand); }
.btn-primary:hover { background: var(--brand-strong); }
.btn-secondary { color: var(--ink); background: var(--surface-2); }
.btn-secondary:hover { background: var(--line); }
</style>