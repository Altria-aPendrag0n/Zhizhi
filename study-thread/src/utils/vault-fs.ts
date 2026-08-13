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

export async function writeFileBytes(path: string, bytes: Uint8Array): Promise<void> {
  return invoke('write_file_bytes', { path, bytes: Array.from(bytes) })
}

export async function readFileBytes(path: string): Promise<Uint8Array> {
  const bytes: number[] = await invoke('read_file_bytes', { path })
  return new Uint8Array(bytes)
}

/** PDF 文本提取结果（对应 Rust 后端 extract_pdf_text 命令） */
export interface ExtractPdfResult {
  page_count: number
  markdown: string
  chars: number
}

/**
 * 解析本地 PDF 为带页边界标记（`<!-- page: N -->`）的 Markdown。
 * 扫描件（无文本层）会 reject 并返回明确错误信息。
 */
export async function extractPdfText(path: string): Promise<ExtractPdfResult> {
  return invoke('extract_pdf_text', { path })
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