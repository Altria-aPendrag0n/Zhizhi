/**
 * 轻量应用日志系统
 *
 * 统一记录运行时日志（info / warn / error），同时输出到 console 与
 * localStorage 环形缓冲（保留最近 MAX_LOGS 条）。界面可在设置页
 * 「调试日志」面板中查看与清空，便于排查 LLM 出题解析等运行问题。
 *
 * 设计约束：
 * - 日志不影响主流程：localStorage 读写异常一律静默忽略
 * - 环形缓冲有上限，避免无限增长占满存储
 * - 纯前端实现，无外部依赖，可单测
 */

export type LogLevel = 'info' | 'warn' | 'error'

export interface LogEntry {
  /** 记录时间（ISO 字符串） */
  at: string
  /** 日志级别 */
  level: LogLevel
  /** 来源模块（如 review-quiz / extract-note） */
  module: string
  /** 日志消息 */
  message: string
  /** 附加结构化信息（JSON 字符串），可为空 */
  meta?: string
}

const LOG_KEY = 'study-thread-logs'
/** 日志环形缓冲上限（条） */
export const MAX_LOGS = 300

function readLogs(): LogEntry[] {
  try {
    const raw = localStorage.getItem(LOG_KEY)
    if (!raw) return []
    const data = JSON.parse(raw) as unknown
    return Array.isArray(data) ? (data as LogEntry[]) : []
  } catch {
    return []
  }
}

function writeLogs(entries: LogEntry[]): void {
  try {
    // 只保留最近 MAX_LOGS 条，控制存储体积
    localStorage.setItem(LOG_KEY, JSON.stringify(entries.slice(-MAX_LOGS)))
  } catch {
    // 存储满等异常静默忽略，日志不阻塞主流程
  }
}

function push(level: LogLevel, module: string, message: string, meta?: unknown): void {
  const entry: LogEntry = {
    at: new Date().toISOString(),
    level,
    module,
    message,
    meta: meta === undefined ? undefined : JSON.stringify(meta),
  }
  // console 输出供开发者直接查看
  const consoleFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
  consoleFn(`[zhizhi:${module}] ${message}`, meta ?? '')
  const entries = readLogs()
  entries.push(entry)
  writeLogs(entries)
}

/** 记录信息日志 */
export function logInfo(module: string, message: string, meta?: unknown): void {
  push('info', module, message, meta)
}

/** 记录警告日志 */
export function logWarn(module: string, message: string, meta?: unknown): void {
  push('warn', module, message, meta)
}

/** 记录错误日志（meta 建议传入完整上下文，如 LLM 原始响应） */
export function logError(module: string, message: string, meta?: unknown): void {
  push('error', module, message, meta)
}

/** 读取最近日志（设置页调试面板用，按时间正序） */
export function getLogs(): LogEntry[] {
  return readLogs()
}

/** 清空全部日志 */
export function clearLogs(): void {
  try {
    localStorage.removeItem(LOG_KEY)
  } catch {
    // 忽略
  }
}
