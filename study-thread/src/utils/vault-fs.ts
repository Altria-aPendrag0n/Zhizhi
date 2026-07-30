import { invoke } from '@tauri-apps/api/core'

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