import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

export interface DirEntry {
  name: string
  path: string
  is_dir: boolean
  children?: DirEntry[]
}

export interface VaultInfo {
  path: string
  note_count: number
  session_count: number
}

export async function readFile(path: string): Promise<string> {
  return invoke('read_file', { path })
}

export async function writeFile(path: string, content: string): Promise<void> {
  return invoke('write_file', { path, content })
}

export async function listDir(path: string): Promise<DirEntry[]> {
  return invoke('list_dir', { path })
}

export async function createDir(path: string): Promise<void> {
  return invoke('create_dir', { path })
}

export async function fileExists(path: string): Promise<boolean> {
  return invoke('file_exists', { path })
}

export async function deleteFile(path: string): Promise<void> {
  return invoke('delete_file', { path })
}

export interface FileChangeEvent {
  kind: string
  paths: string[]
}

let unlisten: UnlistenFn | null = null

export async function startWatching(path: string, callback: (event: FileChangeEvent) => void): Promise<void> {
  // 先停止之前的监听
  await stopWatching()
  
  // 启动 Rust 端监听
  await invoke('start_watch', { path })
  
  // 注册前端事件监听
  unlisten = await listen<FileChangeEvent>('file-changed', (event) => {
    callback(event.payload)
  })
}

export async function stopWatching(): Promise<void> {
  if (unlisten) {
    unlisten()
    unlisten = null
  }
  try {
    await invoke('stop_watch')
  } catch {
    // 如果没有在监听，忽略错误
  }
}