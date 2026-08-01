// Vault 相关类型
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

// 会话相关类型
export interface Session {
  id: string
  title: string
  created: string
  parent_session: string | null
  fork_point: string | null
  tags: string[]
  messages: Message[]
}

export interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
  timestamp?: string
}

// 笔记相关类型
export interface Note {
  path: string
  title: string
  description?: string
  type: 'concept' | 'method' | 'fact' | 'question'
  tags: string[]
  created: string
  updated: string
  source?: {
    session: string
    highlight: string
  }
  confidence: number
  review: {
    next: string | null
    interval: number
    mastery: number
  }
  content: string
}

export interface NoteMeta {
  path: string
  title: string
  description?: string
  type: string
  tags: string[]
  created: string
  updated: string
  proposition?: string
  source?: {
    session: string
    highlight: string
  }
}

// 设置相关类型
export type ProviderType = 'anthropic' | 'openai-compat'

export interface ProviderConfig {
  type: ProviderType
  apiKey: string
  baseUrl: string
  model: string
}

// Stream 相关类型
export interface StreamChunk {
  type: 'text' | 'stop' | 'error' | 'thinking'
  content: string
}

export interface ChatOptions {
  model?: string
  maxTokens?: number
  temperature?: number
  systemPrompt?: string
  signal?: AbortSignal
}

// Skill 系统类型
export interface Skill {
  name: string
  description: string
  body: string
}

// 原子笔记提取结果
export interface ExtractedNote {
  title: string
  description: string
  proposition: string
  explanation: string
  type: 'concept' | 'method' | 'fact' | 'question'
  tags: string[]
  confidence: number
}