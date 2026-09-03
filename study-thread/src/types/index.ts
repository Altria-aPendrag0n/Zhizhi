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
  /** 划线文本在消息中的出现序号（第 N 处），重复文本时精确定位；默认第 1 处 */
  fork_highlight_occ?: number
  /** 会话种类：'review' 为复习会话（独立根会话，不进入分支树）；'plan' 为计划会话（学习计划生成向导）；学习会话不设置 */
  kind?: 'review' | 'plan'
  /** 复习会话关联的被复习笔记路径（kind=review 时存在），持久化到 frontmatter */
  reviewed_note?: string
  /** 复习会话的出题结果（持久化到 frontmatter，重新打开时无需重新出题） */
  review_questions?: ReviewQuestion[]
  /** 复习簇内全部笔记路径（P4 簇复习，首条为中心被复习笔记；单条复习不设置） */
  review_cluster?: string[]
  /** 复习会话是否已完成（评级/结束复习后置 true）；已完成会话保留在资源库供回看，不再被「开始复习」复用 */
  review_completed?: boolean
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

/** 复习间隔算法（P1 增强）：classic 经典类型化间隔序列；fsrs 基于 history 的个性化遗忘曲线调度 */
export type ReviewAlgorithm = 'classic' | 'fsrs'

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
  /** 已毕业（P1 增强）：掌握度达标且连续 good/easy 后标记，移出到期清单但保留在队列，可手动重新激活 */
  graduated?: boolean
}

// 复习出题相关类型（P2 AI 复习会话）
export type ReviewQuestionLevel = 'recognize' | 'apply' | 'explain'

/** 复习题型（P5 扩展）：choice 选择 / true_false 判对错 / fill_blank 填空 / ordering 排序 / short_answer 简答 / debate 辩论 */
export type ReviewQuestionType = 'choice' | 'true_false' | 'fill_blank' | 'ordering' | 'short_answer' | 'debate'

export interface ReviewQuestion {
  level: ReviewQuestionLevel
  /** 题型（P5）：LLM 缺省/非法时由出题校验降级为 short_answer，保证会话不中断 */
  type: ReviewQuestionType
  question: string
  /** choice：选项列表（题干不含 A/B/C/D 字母，前端渲染） */
  options?: string[]
  /** ordering：乱序步骤列表，前端重排后作答 */
  steps?: string[]
  /** fill_blank：填空数量（默认 1，题干用 ____ 标注空位） */
  blanks?: number
  /** debate：AI 持方观点（辩论初始立场） */
  position?: string
  /** debate：最大辩论轮次（默认 3） */
  maxRounds?: number
  /**
   * 情景（情景题）：AI 提供一个贴近实际的情境，让用户在该情境下作答（题型仍为上述六类之一），
   * 使复习跳出枯燥记忆、带上实践/迁移感。可选；缺省即为普通题。
   */
  scenario?: string
  /**
   * 标准答案（确定答案题型出题时附带：choice 存正确选项文本、true_false 存"正确/错误"、
   * fill_blank 存填空内容（多空用「；」分隔）、ordering 存正确顺序"1. xxx\n2. yyy"）。
   * 供判正误与反馈对照；short_answer/debate 等自由作答题型缺省，由 AI 对照笔记原文判断。
   */
  answer?: string
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

// 知枝官方账号（与服务端 /api/me 响应对齐）
export interface OfficialPlan {
  id: string
  name: string
  price_cents: number
  token_quota: number
  model_group: string | null
}

export interface OfficialUser {
  id: string
  identifier: string
  username: string
  plan_id: string | null
  plan_expires_at: number | null
  quota_tokens: number
  api_key_created: boolean
  plan: OfficialPlan | null
}

// 学习计划相关类型（学习计划 Agent，设计见 docs/todo/学习计划Agent开发方案.md）
/** 计划状态：active 进行中 / paused 暂停（保留进度）/ archived 归档（只读） */
export type PlanStatus = 'active' | 'paused' | 'archived'

export interface PlanPhase {
  id: string
  title: string
  /** 阶段目标（一句话，供生成会话与展示） */
  objective?: string
}

export interface PlanTask {
  id: string
  /** 所属阶段 id */
  phase: string
  title: string
  /** 任务细节（作为「开始学习」会话的初始上下文） */
  detail?: string
  /** 预估时长（分钟） */
  estimate: number
  done: boolean
  done_at: string | null
  /** 关联学习会话路径（「开始学习」后回填） */
  sessions: string[]
}

/** 学习计划文档，权威数据为 `<vault>/plans/<plan-id>.md` 的 frontmatter，正文仅供阅读 */
export interface PlanDoc {
  /** 文件路径（加载后填充，不写入 frontmatter） */
  path: string
  kind: 'plan'
  /** 计划 id，同文件名 */
  plan: string
  title: string
  goal: string
  status: PlanStatus
  created: string
  /** 每日学习容量（分钟），今日任务按此从队首填充 */
  daily_minutes: number
  phases: PlanPhase[]
  tasks: PlanTask[]
  /** 正文：AI 生成的可读计划，机器不解析，序列化时原样保留 */
  body: string
  /** frontmatter 中的未知字段（解析时保留、序列化时写回，不丢失用户手改内容） */
  extra?: Record<string, unknown>
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

/** PDF 解析状态：pending=待解析 / parsing=解析中 / parsed=已解析 / failed=解析失败 */
export type ReferenceParseStatus = 'pending' | 'parsing' | 'parsed' | 'failed'

export interface ReferenceMeta {
  id: string            // 唯一 id（uuid），用于文件命名
  path: string          // 元数据 JSON 文件路径，形如 {vault}/references/{id}/{id}.json
  title: string
  description?: string
  tags: string[]
  fileType: ReferenceType
  fileName: string      // 原始上传文件名
  filePath: string      // 实际文件路径，形如 {vault}/references/{id}/{id}.{ext}
  created: string       // ISO 时间
  updated: string       // ISO 时间
  /** PDF 解析状态（仅 pdf 使用；md/png 不设置） */
  parseStatus?: ReferenceParseStatus
  /** 解析失败原因（扫描件无文本层 / 加密 / 损坏等） */
  parseError?: string
  /** PDF 页数（parsed 后写入） */
  pageCount?: number
  /** 提取产物字符数（用于小/大 PDF 判定与上下文预算） */
  extractedChars?: number
  /** 提取产物路径：{vault}/references/{id}/{id}.extracted.md */
  extractedPath?: string
  /** 提取时间 */
  extractedAt?: string
}

export interface Reference extends ReferenceMeta {
  /** 预览用：md 为正文文本；png 为 base64 data URL；pdf 无 */
  previewText?: string
}