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
  /** 复习进度（与 `.study-thread/review-state.json` 队列保持一致的镜像字段，权威数据在 review store） */
  review: {
    /** 下次复习时间（ISO），null 表示未进入复习队列 */
    next: string | null
    /** 当前间隔（天） */
    interval: number
    /** 掌握度 0-1（由复习评级推进） */
    mastery: number
  }
  content: string
}

// 复习相关类型（P1 间隔复习调度层）
export type ReviewRating = 'again' | 'hard' | 'good' | 'easy'

export interface ReviewHistoryEntry {
  at: string // ISO 时间
  rating: ReviewRating
}

/** 复习队列中的一条任务，持久化于 `<vault>/.study-thread/review-state.json` */
export interface ReviewTask {
  notePath: string // notes/<标题>.md
  title: string // 冗余标题，列表展示无需重读文件
  type: string // concept | method | fact | question（决定间隔序列）
  dueAt: string // ISO 时间，到期时间
  interval: number // 当前间隔（天）
  mastery: number // 掌握度 0-1
  history: ReviewHistoryEntry[] // 复习评级历史（为后续 FSRS 式个性化调度预留）
}

// 复习出题相关类型（P2 AI 复习会话）
export type ReviewQuestionLevel = 'recognize' | 'apply' | 'explain'

export interface ReviewQuestion {
  level: ReviewQuestionLevel
  question: string
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