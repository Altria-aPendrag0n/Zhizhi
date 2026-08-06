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
  /** 分叉点上下文预览（划线内容及附近文本），仅分支会话持久化到文件正文开头 */
  fork_context?: string
  /** 划线文本（DOM 选择），供分叉点上下文渲染后高亮定位；仅分支会话持久化到 frontmatter */
  fork_highlight?: string
}

export interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
  /** AI 回答前的思考过程（独立存储，界面以浅色可折叠块展示） */
  thinking?: string
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
  /** 关联笔记路径列表（json sidecar 中的正向 wikilink 目标） */
  links?: string[]
}

// 设置相关类型
export type ProviderType = 'anthropic' | 'openai-compat'

export interface ProviderConfig {
  type: ProviderType
  apiKey: string
  baseUrl: string
  model: string
  /** 请求体附带 web_search 工具，由模型/服务端决定是否联网搜索 */
  enableWebSearch?: boolean
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

// 参考资料相关类型
export type ReferenceType = 'md' | 'pdf' | 'png'

export interface ReferenceMeta {
  id: string            // 唯一 id（uuid），用于文件命名
  path: string          // 元数据 JSON 文件路径，形如 {vault}/references/{id}.json
  title: string
  description?: string
  tags: string[]
  fileType: ReferenceType
  fileName: string      // 原始上传文件名
  filePath: string      // 实际文件路径，形如 {vault}/references/{id}.{ext}
  created: string       // ISO 时间
  updated: string       // ISO 时间
}

export interface Reference extends ReferenceMeta {
  /** 预览用：md 为正文文本；png 为 base64 data URL；pdf 无 */
  previewText?: string
}