/**
 * 学习统计工具
 *
 * 按天聚合三种学习行为，供主界面（/home）的数据总览与学习频率格子图使用：
 * - 问答（qa）：学习会话 / 分支会话中的用户消息次数（复习会话不计入问答）
 * - 复习（review）：`.study-thread/review-state.json` 队列中每次评级记录（history[].at）
 * - 笔记（note）：notes/ 目录下笔记 frontmatter 的 created 日期
 *
 * 统计口径：
 * - 新产生的会话消息带消息级时间戳（session store addMessage 自动写入），精确到当天；
 * - 存量会话文件消息头无时间戳，按会话 frontmatter 的 created 日期近似归属。
 */

import type { NoteMeta } from '../types'
import { readFile, listDir } from './vault-fs'
import { parseFrontmatter } from '../parser/frontmatter'

export interface DailyCounts {
  qa: number
  review: number
  note: number
}

/** dateKey（YYYY-MM-DD，本地时区）→ 当日三种学习次数 */
export type DailyCountMap = Map<string, DailyCounts>

export interface LearningStats {
  /** 发生学习的日期 → 当日次数（不含零学习日期） */
  daily: DailyCountMap
  totalQa: number
  totalReview: number
  totalNote: number
  /** 有学习记录的天数 */
  totalDays: number
  /** 连续学习天数（今天无学习时从昨天起算） */
  streakDays: number
}

/**
 * 本地时区 YYYY-MM-DD（避免 toISOString 的 UTC 偏移导致日期错位）。
 */
export function toDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * 解析任意时间值（ISO 字符串/Date）为日期键；非法值返回 null。
 */
export function parseDateKey(value: string): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : toDateKey(d)
}

const USER_HEADER_RE = /^##\s*用户(?:[ \t]*·[ \t]*(.+))?[ \t]*$/

/**
 * 从会话 Markdown 正文提取每条用户消息的学习日期。
 *
 * 消息头格式：`## 用户`（存量）或 `## 用户 · <ISO timestamp>`（新会话）。
 * 带时间戳时精确到当天；无时间戳时回退到会话创建日期（frontmatter created 的近似）。
 *
 * @param body - 去掉 frontmatter 后的会话正文
 * @param fallbackDate - 会话创建时间（ISO），无消息级时间戳时作为近似日期
 */
export function extractUserMessageDates(body: string, fallbackDate?: string): string[] {
  const fallback = fallbackDate ? parseDateKey(fallbackDate) : null
  const dates: string[] = []
  for (const line of body.split('\n')) {
    const match = line.match(USER_HEADER_RE)
    if (!match) continue
    // 注意：不能直接用 parseDateKey('') 判断失败——空串直接回退
    const date = match[1] ? parseDateKey(match[1].trim()) : fallback
    if (date) dates.push(date)
  }
  return dates
}

/**
 * 从完整会话文件内容（frontmatter + 正文）提取用户消息日期。
 * frontmatter 缺失 created 时返回空数组。
 */
export function extractSessionQaDates(content: string): string[] {
  const { meta, body } = parseFrontmatter(content)
  const created = typeof meta.created === 'string' ? meta.created : undefined
  return extractUserMessageDates(body, created)
}

/** 解析 review-state.json：每次评级记录计一次复习 */
export function extractReviewDates(state: unknown): string[] {
  const dates: string[] = []
  if (!state || typeof state !== 'object') return dates
  const queue = (state as { queue?: unknown }).queue
  if (!Array.isArray(queue)) return dates
  for (const task of queue) {
    if (!task || typeof task !== 'object') continue
    const history = (task as { history?: unknown }).history
    if (!Array.isArray(history)) continue
    for (const entry of history) {
      if (!entry || typeof entry !== 'object') continue
      const at = (entry as { at?: unknown }).at
      if (typeof at === 'string') {
        const date = parseDateKey(at)
        if (date) dates.push(date)
      }
    }
  }
  return dates
}

/** 笔记创建日期：每篇笔记按 created 计一次 */
export function extractNoteDates(notes: NoteMeta[]): string[] {
  const dates: string[] = []
  for (const note of notes) {
    const date = parseDateKey(note.created)
    if (date) dates.push(date)
  }
  return dates
}

/**
 * 聚合三类日期列表为按天计数表。
 */
export function aggregateDailyCounts(dates: { qa: string[]; review: string[]; note: string[] }): DailyCountMap {
  const map: DailyCountMap = new Map()
  const bump = (key: string, field: keyof DailyCounts) => {
    const entry = map.get(key) ?? { qa: 0, review: 0, note: 0 }
    entry[field]++
    map.set(key, entry)
  }
  for (const key of dates.qa) bump(key, 'qa')
  for (const key of dates.review) bump(key, 'review')
  for (const key of dates.note) bump(key, 'note')
  return map
}

/**
 * 汇总统计：总数 / 有记录天数 / 连续学习天数。
 *
 * 连续天数从今天起向前数；今天尚无记录时从昨天起算（GitHub 风格：今天还没学到也不算断签）。
 */
export function summarizeStats(daily: DailyCountMap, now: Date = new Date()): LearningStats {
  let totalQa = 0
  let totalReview = 0
  let totalNote = 0
  for (const entry of daily.values()) {
    totalQa += entry.qa
    totalReview += entry.review
    totalNote += entry.note
  }

  const today = toDateKey(now)
  // 今天有学习 → 从今天起算；否则从昨天起算（允许"今天还没学"不断签）
  const startKey = daily.has(today) ? today : toDateKey(new Date(now.getTime() - 24 * 60 * 60 * 1000))
  let streak = 0
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (daily.has(startKey)) {
    // 从 startKey 对应的日期逐日向前
    let date = new Date(cursor)
    if (!daily.has(today)) date = new Date(date.getTime() - 24 * 60 * 60 * 1000)
    while (daily.has(toDateKey(date))) {
      streak++
      date = new Date(date.getTime() - 24 * 60 * 60 * 1000)
    }
  }

  return {
    daily,
    totalQa,
    totalReview,
    totalNote,
    totalDays: daily.size,
    streakDays: streak,
  }
}

/**
 * 从 vault 聚合全部学习统计（主界面入口）。
 *
 * @param vaultPath - vault 根目录
 * @param noteMetas - 可选：笔记元数据列表。提供时直接复用（避免重复扫描目录），
 *                    未提供时扫描 notes/ 目录读取 frontmatter。
 */
export async function collectLearningStats(vaultPath: string, noteMetas?: NoteMeta[]): Promise<LearningStats> {
  const [qaDates, reviewDates, noteDates] = await Promise.all([
    collectSessionQaDates(vaultPath),
    collectReviewDates(vaultPath),
    noteMetas && noteMetas.length > 0
      ? Promise.resolve(extractNoteDates(noteMetas))
      : collectNoteDates(vaultPath),
  ])
  return summarizeStats(aggregateDailyCounts({ qa: qaDates, review: reviewDates, note: noteDates }))
}

/** 扫描 sessions/ 目录，汇总所有学习/分支会话的用户消息日期（排除复习会话） */
async function collectSessionQaDates(vaultPath: string): Promise<string[]> {
  try {
    const entries = await listDir(`${vaultPath}/sessions`)
    const dates: string[] = []
    for (const entry of entries) {
      if (entry.is_dir) continue
      if (!entry.name.toLowerCase().endsWith('.md')) continue
      if (entry.name.toLowerCase().startsWith('review-') || entry.name.toLowerCase().startsWith('review_')) continue
      try {
        const content = await readFile(entry.path)
        dates.push(...extractSessionQaDates(content))
      } catch {
        // 单个会话读取失败不影响整体统计
      }
    }
    return dates
  } catch {
    return []
  }
}

/** 读取 review-state.json 的评级历史日期（文件缺失/损坏时返回空） */
async function collectReviewDates(vaultPath: string): Promise<string[]> {
  try {
    const content = await readFile(`${vaultPath}/.study-thread/review-state.json`)
    return extractReviewDates(JSON.parse(content))
  } catch {
    return []
  }
}

/** 扫描 notes/ 目录，按 frontmatter created 提取笔记创建日期 */
async function collectNoteDates(vaultPath: string): Promise<string[]> {
  try {
    const entries = await listDir(`${vaultPath}/notes`)
    const dates: string[] = []
    const walk = async (items: Awaited<ReturnType<typeof listDir>>) => {
      for (const entry of items) {
        if (entry.is_dir) {
          await walk(await listDir(entry.path))
          continue
        }
        if (!entry.name.toLowerCase().endsWith('.md')) continue
        try {
          const content = await readFile(entry.path)
          const { meta } = parseFrontmatter(content)
          const created = typeof meta.created === 'string' ? meta.created : undefined
          const date = created ? parseDateKey(created) : null
          if (date) dates.push(date)
        } catch {
          // 单个笔记读取失败不影响整体统计
        }
      }
    }
    await walk(entries)
    return dates
  } catch {
    return []
  }
}
