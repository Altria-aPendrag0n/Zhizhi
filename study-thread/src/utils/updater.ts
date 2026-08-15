import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

/**
 * 更新信息（跨组件传递的结构化类型）。
 * 仅取实际用到的字段，避免 `Update` class 私有字段带来的 nominal 类型限制。
 */
export type AppUpdate = Pick<Update, 'version' | 'currentVersion' | 'downloadAndInstall'>

/** 检查是否有可用更新；无更新返回 null */
export async function checkForUpdate(): Promise<AppUpdate | null> {
  return await check()
}

/** 下载并安装更新，下载完成时回调；安装成功后重启应用 */
export async function installUpdate(
  update: AppUpdate,
  onDownloadFinished?: () => void,
): Promise<void> {
  await update.downloadAndInstall((progress) => {
    if (progress.event === 'Finished') onDownloadFinished?.()
  })
  await relaunch()
}
