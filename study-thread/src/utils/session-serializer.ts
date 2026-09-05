/**
 * 会话序列化工具
 * 将会话数据序列化为 Markdown 文件，支持写入 vault sessions/ 目录
 */

import type { Session, Message, CitationSource } from '../types'
import type { NoteReference } from './session-linker'
import { writeFile, createDir, listDir } from './vault-fs'
import type { DirEntry } from './vault-fs'
import { serializeForkContext, FORK_CONTEXT_START, FORK_CONTEXT_END, THINKING_START, THINKING_END } from './branch-context'
import { parseFrontmatter } from '../parser/frontmatter'

/**
 * 生成会话标题（取首条用户消息前 30 字）
 */
export function generateSessionTitle(messages: Message[]): string {
  const firstUserMsg = messages.find(m => m.role === 'user')
  if (!firstUserMsg) return '新会话'
  const text = firstUserMsg.content.replace(/\n/g, ' ').trim()
  return text.length > 30 ? text.slice(0, 30) + '...' : text
}

/**
 * 清理文件名，移除 Windows 不允许的字符
 */
export function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '').trim() || 'untitled'
}

/**
 * 将标题转换为文件名可读 slug：去空白/链接敏感字符，压缩连字符，截断 40 字。
 * 空标题或全被过滤时返回空串（文件名不加 slug，保持纯 id）。
 */
export function slugifyTitle(title: string): string {
  const slug = sanitizeFileName(title)
    .replace(/\s+/g, '-')
    .replace(/[#\[\](){}^|]+/g, '')
    .replace(/-+/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '')
    .slice(0, 40)
  return slug === 'untitled' ? '' : slug
}

/**
 * 生成会话文件名：`{id}-{slug}.md`（slug 存在时）或 `{id}.md`（无标题）。
 * 文件类型由 id 前缀（sess_/new_/branch_/review_/note_root_）区分，不再使用 branch-/review- 文件前缀。
 */
export function buildSessionFileName(sessionId: string, title?: string): string {
  const safeId = sanitizeFileName(sessionId)
  const slug = title ? slugifyTitle(title) : ''
  return slug ? `${safeId}-${slug}.md` : `${safeId}.md`
}

/**
 * 序列化会话为 Markdown 字符串
 */
export function serializeSession(session: Session, noteRefs: NoteReference[] = []): string {
  const lines: string[] = []

  // YAML frontmatter
  lines.push('---')
  lines.push(`session_id: ${session.id}`)
  lines.push(`title: ${session.title}`)
  lines.push(`created: ${session.created}`)
  if (session.tags.length > 0) {
    lines.push(`tags: [${session.tags.join(', ')}]`)
  }
  if (session.parent_session) {
    lines.push(`parent_session: ${session.parent_session}`)
  }
  if (session.fork_point) {
    lines.push(`fork_point: ${session.fork_point}`)
  }
  if (session.fork_highlight) {
    // 划线文本可能含引号/特殊字符，用 JSON 字符串保证 YAML 解析安全
    lines.push(`fork_highlight: ${JSON.stringify(session.fork_highlight)}`)
  }
  if (session.fork_highlight_occ && session.fork_highlight_occ > 1) {
    // 划线文本在消息中的出现序号（第 N 处），重复文本时 DOM 高亮按序号定位
    lines.push(`fork_highlight_occ: ${session.fork_highlight_occ}`)
  }
  // 复习会话标记：kind + 被复习笔记路径 + 出题结果（P2 复习会话）
  if (session.kind) {
    lines.push(`kind: ${session.kind}`)
  }
  if (session.plan_id) {
    // 计划会话关联的学习计划 id（kind=plan），确认生成计划后回填
    lines.push(`plan_id: ${session.plan_id}`)
  }
  if (session.reviewed_note) {
    // 路径可能含引号/特殊字符，用 JSON 字符串保证 YAML 解析安全
    lines.push(`reviewed_note: ${JSON.stringify(session.reviewed_note)}`)
  }
  if (session.review_questions && session.review_questions.length > 0) {
    // 出题结果以 JSON 字符串序列化，重新打开复习会话时无需重新出题
    lines.push(`review_questions: ${JSON.stringify(session.review_questions)}`)
  }
  if (session.review_cluster && session.review_cluster.length > 0) {
    // 复习簇笔记路径列表（P4 簇复习），JSON 字符串保证 YAML 解析安全
    lines.push(`review_cluster: ${JSON.stringify(session.review_cluster)}`)
  }
  if (session.review_completed) {
    // 已完成标记：资源库「复习会话」据此区分完成态；「开始复习」跳过已完成会话重新出题
    lines.push('review_completed: true')
  }
  lines.push('---')
  lines.push('')

  // 分叉点上下文（分支会话）：持久化到正文开头，前端识别后渲染
  if (session.fork_context) {
    lines.push(serializeForkContext(session.fork_context))
    lines.push('')
  }

  // 消息内容
  for (const [messageIndex, msg] of session.messages.entries()) {
    const role = msg.role === 'user' ? '用户' : msg.role === 'assistant' ? '知枝' : '系统'
    const time = msg.timestamp ? ` · ${msg.timestamp}` : ''
    lines.push(`## ${role}${time}`)
    lines.push('')
    // AI 思考过程以特殊标记区块持久化（与分叉上下文同风格），切换会话后仍可恢复
    if (msg.role === 'assistant' && msg.thinking) {
      lines.push(serializeThinkingBlock(msg.thinking))
      lines.push('')
    }
    // 来源锚定：引用来源列表以区块持久化，历史消息角标可恢复（来源锚定 v0.3.1）
    if (msg.role === 'assistant' && msg.citations && msg.citations.length > 0) {
      lines.push(serializeCitationsBlock(msg.citations))
      lines.push('')
    }
    lines.push(msg.content)
    for (const noteRef of noteRefs.filter((ref) => ref.messageIndex === messageIndex)) {
      const kindLabel = noteRef.kind === 'branch' ? '已生成分支' : '已生成笔记'
      const highlight = noteRef.highlight ? ` 划线「${noteRef.highlight.replace(/\s+/g, ' ')}」` : ''
      // 重复文本出现多次时记录出现序号（第 N 处），应用高亮时按序号定位到划线处
      const occurrence = noteRef.occurrence && noteRef.occurrence > 1 ? `〔${noteRef.occurrence}〕` : ''
      lines.push('')
      lines.push(`> ${kindLabel}: [[${noteRef.path}|${noteRef.title}]]${highlight}${occurrence}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * 序列化 AI 思考过程为可写入消息正文的区块文本。
 * 区块以 HTML 注释包裹，不参与 markdown 渲染；内容中的 `-->` 转义为 `--&gt;`，避免提前闭合标记。
 */
export function serializeThinkingBlock(text: string): string {
  if (!text) return ''
  const escaped = text.split('-->').join('--&gt;')
  return `${THINKING_START}\n${escaped}\n${THINKING_END}`
}

/** 来源引用区块标记（assistant 消息，来源锚定持久化，JSON 单行存放） */
export const CITATIONS_START = '<!-- citations -->'
export const CITATIONS_END = '<!-- /citations -->'

/**
 * 序列化回答引用来源为区块文本（JSON 单行，`-->` 转义防提前闭合）。
 * 空列表返回空串（不写区块）。
 */
export function serializeCitationsBlock(citations: CitationSource[]): string {
  if (!citations || citations.length === 0) return ''
  const escaped = JSON.stringify(citations).split('-->').join('--&gt;')
  return `${CITATIONS_START}\n${escaped}\n${CITATIONS_END}`
}

/**
 * 宽松校验 citations JSON：结构不符的条目跳过，全部无效返回 undefined
 * （手改文件不应导致崩溃，与 plan-parser 容错哲学一致）。
 */
function toCitations(value: unknown): CitationSource[] | undefined {
  if (!Array.isArray(value)) return undefined
  const list: CitationSource[] = []
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue
    const o = item as Record<string, unknown>
    if (typeof o.index !== 'number' || typeof o.path !== 'string' || typeof o.title !== 'string') continue
    list.push({
      index: o.index,
      kind: o.kind === 'reference' ? 'reference' : 'note',
      path: o.path,
      title: o.title,
      snippet: typeof o.snippet === 'string' ? o.snippet : '',
      sectionTitle: typeof o.sectionTitle === 'string' ? o.sectionTitle : undefined,
      pageFrom: typeof o.pageFrom === 'number' ? o.pageFrom : undefined,
      pageTo: typeof o.pageTo === 'number' ? o.pageTo : undefined,
    })
  }
  return list.length > 0 ? list : undefined
}

/**
 * 生成会话文件路径（写路径）。文件名统一为 `{id}-{slug}.md`，id 区分类型，
 * 不再使用旧的 branch-/review- 双前缀。isBranch/isReview 仅保留签名兼容。
 * @param vaultPath vault 根目录路径
 * @param sessionId 会话稳定 id
 * @param title 可选标题，用于生成可读 slug
 */
export function getSessionFilePath(
  vaultPath: string,
  sessionId: string,
  _isBranch = false,
  _isReview = false,
  title?: string,
): string {
  const sessionsDir = `${vaultPath}/sessions`
  return `${sessionsDir}/${buildSessionFileName(sessionId, title)}`
}

/**
 * 按 sessionId 定位 vault 中实际存在的会话文件（读路径统一入口）。
 * 兼容新旧命名：`{id}.md`、`{id}-{slug}.md` 以及旧前缀 `branch-{id}.md` / `review-{id}.md`。
 * 找不到返回 null（调用方决定回退到 getSessionFilePath 生成新路径）。
 */
export async function resolveSessionFile(vaultPath: string, sessionId: string): Promise<string | null> {
  const sessionsDir = `${vaultPath}/sessions`
  let entries: DirEntry[]
  try {
    entries = await listDir(sessionsDir)
  } catch {
    return null
  }
  const safeId = sanitizeFileName(sessionId).toLowerCase()
  const exact = `${safeId}.md`
  const slugPrefix = `${safeId}-`
  const legacyBranch = `branch-${safeId}.md`
  const legacyReview = `review-${safeId}.md`
  for (const entry of entries) {
    if (entry.is_dir) continue
    const name = entry.name.toLowerCase()
    if (!name.endsWith('.md')) continue
    if (name === exact || name.startsWith(slugPrefix) || name === legacyBranch || name === legacyReview) {
      return entry.path
    }
  }
  return null
}

/**
 * 将引用（可能是 id，也可能是旧数据写入的文件路径）规范化为稳定 sessionId。
 * id 不含 `/`、`\`，路径含分隔符；路径场景从文件名提取 id。
 */
export function sessionIdFromReference(reference: string): string {
  if (!reference) return ''
  if (!/[\\/]/.test(reference)) return reference
  return sessionIdFromFileName(reference)
}

export async function saveSessionToVault(
  vaultPath: string,
  session: Session,
  isBranch = false,
  noteRefs: NoteReference[] = [],
  isReview = false,
): Promise<string> {
  const sessionsDir = `${vaultPath}/sessions`
  await createDir(sessionsDir)

  // 已存在同 id 文件则沿用其路径（兼容旧命名 {id}.md / branch-{id}.md 与旧 slug），
  // 文件名在首次创建后保持稳定；标题变更仅在显式重命名时改变 slug。
  let filePath = await resolveSessionFile(vaultPath, session.id)
  if (!filePath) {
    filePath = getSessionFilePath(vaultPath, session.id, isBranch, isReview, session.title)
  }

  const content = serializeSession(session, noteRefs)
  await writeFile(filePath, content)

  return filePath
}

// ===================== 从 vault 加载会话 =====================

/** 会话列表元数据（侧边栏展示用）：仅解析 frontmatter，不读正文消息 */
export interface SessionMeta {
  id: string
  title: string
  /** ISO 创建时间（frontmatter created 缺失时回退为 1970，排序沉底） */
  created: string
  filePath: string
  /** 会话种类：review 复习会话 / plan 计划会话；学习会话为 undefined（侧边栏分组展示用） */
  kind?: 'review' | 'plan'
}

/** 消息头：`## 用户/知枝/系统`，可带 ` · <ISO 时间戳>`（统计问答按天归属） */
const MSG_HEADER_RE = /^## (用户|知枝|系统)(?: · (.+))?\s*$/
/** 划线引用标记行（已生成笔记/分支），解析消息内容时跳过，不混入正文 */
const REF_LINE_RE = /^> 已生成(笔记|分支):\s*\[\[/

function toString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function toTags(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === 'string') : []
}

/** frontmatter kind 归一化：review/plan 之外的值（含缺失）均视为学习会话（undefined），兼容旧文件 */
function normalizeKind(value: unknown): 'review' | 'plan' | undefined {
  return value === 'review' || value === 'plan' ? value : undefined
}

/** frontmatter session_id 缺失时按文件名兜底，兼容新旧命名（sess_1-标题.md / branch-branch_1.md → sess_1 / branch_1） */
export function sessionIdFromFileName(filePath: string): string {
  const name = filePath.split(/[\\/]/).pop() || ''
  const base = name.replace(/\.md$/i, '')
  let id = base
  if (id.startsWith('branch-')) id = id.slice('branch-'.length)
  else if (id.startsWith('review-')) id = id.slice('review-'.length)
  // 新命名 {id}-{slug}：id 由下划线+数字组成、不含 '-'，首个 '-' 之后为 slug
  const dash = id.indexOf('-')
  if (dash > 0) id = id.slice(0, dash)
  return id
}

/** 移除正文中的分叉点上下文区块（解析消息前调用，避免区块内容被当作消息） */
function removeForkContextBlock(body: string): string {
  const start = body.indexOf(FORK_CONTEXT_START)
  if (start === -1) return body
  const end = body.indexOf(FORK_CONTEXT_END, start)
  if (end === -1) return body
  return body.slice(0, start) + body.slice(end + FORK_CONTEXT_END.length)
}

/** 提取正文中的分叉点上下文区块内容（无区块返回空串） */
function extractForkContextBlock(body: string): string {
  const start = body.indexOf(FORK_CONTEXT_START)
  if (start === -1) return ''
  const end = body.indexOf(FORK_CONTEXT_END, start)
  if (end === -1) return ''
  return body.slice(start + FORK_CONTEXT_START.length, end).trim()
}

/**
 * 轻量解析会话文件元数据（侧边栏会话列表用，不解析正文消息）。
 * frontmatter 缺失/损坏时按文件名兜底 id 与标题。
 */
export function parseSessionMeta(content: string, filePath: string): SessionMeta {
  const { meta } = parseFrontmatter(content)
  return {
    id: toString(meta.session_id) || sessionIdFromFileName(filePath),
    title: toString(meta.title) || sessionIdFromFileName(filePath),
    created: toString(meta.created) || '1970-01-01T00:00:00.000Z',
    filePath,
    kind: normalizeKind(meta.kind),
  }
}

/**
 * 从会话正文解析消息列表（保留消息级时间戳与 AI 思考过程）。
 *
 * 消息头 `## 用户/知枝/系统` 带 ` · <ISO>` 时时间戳保留到 message.timestamp
 * （主界面按天统计问答依赖该字段）；存量文件无时间戳时为 undefined。
 * 分叉点上下文区块、`<!-- thinking -->` 思考过程区块与 `> 已生成笔记/分支` 引用行
 * 是特殊标记：thinking 提取为 message.thinking，其余跳过不混入正文。
 */
export function parseSessionMessages(body: string): Message[] {
  const messages: Message[] = []
  const lines = removeForkContextBlock(body).split('\n')
  let current: {
    role: Message['role']
    timestamp?: string
    content: string[]
    thinking?: string[]
    citationsRaw?: string[]
  } | null = null
  let inThinking = false
  let inCitations = false

  const flush = () => {
    if (!current || current.content.length === 0) return
    const message: Message = { role: current.role, content: current.content.join('\n').trim() }
    if (current.timestamp) message.timestamp = current.timestamp
    // 思考过程区块反序列化（`--&gt;` 还原为 `-->`）
    if (current.thinking && current.thinking.length > 0) {
      message.thinking = current.thinking.join('\n').trim().split('--&gt;').join('-->')
    }
    // 来源引用区块反序列化：JSON 损坏时忽略（旧文件/手改容错）
    if (current.citationsRaw && current.citationsRaw.length > 0) {
      try {
        const parsed = toCitations(
          JSON.parse(current.citationsRaw.join('\n').split('--&gt;').join('-->')),
        )
        if (parsed) message.citations = parsed
      } catch {
        // 忽略损坏的 citations 区块
      }
    }
    messages.push(message)
  }

  for (const line of lines) {
    const match = line.match(MSG_HEADER_RE)
    if (match) {
      flush()
      const role = match[1] === '用户' ? 'user' : match[1] === '知枝' ? 'assistant' : 'system'
      current = { role, timestamp: match[2]?.trim() || undefined, content: [] }
      inThinking = false
      inCitations = false
      continue
    }
    if (!current) continue
    if (line.startsWith(THINKING_START)) {
      inThinking = true
      current.thinking = current.thinking ?? []
      continue
    }
    if (inThinking) {
      if (line.startsWith(THINKING_END)) {
        inThinking = false
      } else {
        current.thinking!.push(line)
      }
      continue
    }
    if (line.startsWith(CITATIONS_START)) {
      inCitations = true
      current.citationsRaw = current.citationsRaw ?? []
      continue
    }
    if (inCitations) {
      if (line.startsWith(CITATIONS_END)) {
        inCitations = false
      } else {
        current.citationsRaw!.push(line)
      }
      continue
    }
    // 跳过划线引用标记行，避免混入消息正文
    if (REF_LINE_RE.test(line)) continue
    current.content.push(line)
  }
  flush()

  return messages
}

/**
 * 从会话 md 文件内容解析完整会话（frontmatter + 正文消息）。
 *
 * 会话以 md + 特殊标记符（frontmatter、`## 角色 · 时间戳` 消息头、
 * `<!-- fork-context -->` 区块、`> 已生成笔记/分支` 引用行）持久化在 vault，
 * 本函数是读取侧的唯一入口。复习会话（kind: review）建议走
 * review-session 的 loadReviewSession（含出题结果规范化），此处不解析 review_questions。
 */
export function parseSessionFile(content: string, filePath = ''): Session {
  const { meta, body } = parseFrontmatter(content)
  const createdAt = toString(meta.created) || '1970-01-01T00:00:00.000Z'
  const forkPoint = meta.fork_point
  return {
    id: toString(meta.session_id) || sessionIdFromFileName(filePath),
    title: toString(meta.title) || sessionIdFromFileName(filePath),
    created: createdAt,
    parent_session: toString(meta.parent_session) || null,
    fork_point: forkPoint != null ? String(forkPoint) : null,
    tags: toTags(meta.tags),
    messages: parseSessionMessages(body),
    fork_context: extractForkContextBlock(body) || undefined,
    fork_highlight: toString(meta.fork_highlight) || undefined,
    fork_highlight_occ: typeof meta.fork_highlight_occ === 'number' && meta.fork_highlight_occ > 1
      ? meta.fork_highlight_occ
      : undefined,
    kind: normalizeKind(meta.kind),
    plan_id: toString(meta.plan_id) || undefined,
    reviewed_note: toString(meta.reviewed_note) || undefined,
    review_cluster: Array.isArray(meta.review_cluster) && meta.review_cluster.every((item): item is string => typeof item === 'string')
      ? meta.review_cluster
      : undefined,
    review_completed: meta.review_completed === true,
  }
}