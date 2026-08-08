/**
 * 学习者画像更新执行器
 *
 * 分析完整会话记录，生成学习者画像更新建议。
 * 加载 SKILL.md 模板，替换变量，调用 LLM 生成画像 diff。
 */

import type { LLMProvider, Message } from '../llm-provider'
import type { Session, Note } from '../../types'
import { parseSkill, buildPrompt } from '../../skills/loader'

import skillRaw from '../../skills/update-learner/SKILL.md?raw'

/** 缓存解析后的 Skill 对象 */
let _skillCache: ReturnType<typeof parseSkill> | null = null

function getSkill() {
  if (!_skillCache) {
    _skillCache = parseSkill(skillRaw)
  }
  return _skillCache
}

/** 概念变更条目 */
export interface ConceptChange {
  name: string
  confidence?: string
  old_confidence?: string
  new_confidence?: string
  description?: string
  change_description?: string
  reason?: string
  prerequisites?: string[]
  complements?: string[]
}

/** 建议学习主题 */
export interface SuggestedTopic {
  topic: string
  reason: string
}

/** 学习者画像更新 diff */
export interface ProfileDiff {
  added_concepts: ConceptChange[]
  updated_concepts: ConceptChange[]
  removed_concepts: ConceptChange[]
  suggested_topics: SuggestedTopic[]
  summary: string
}

/**
 * 将会话消息序列化为文本格式
 */
function serializeSession(session: Session): string {
  const lines: string[] = []
  lines.push(`# 会话: ${session.title}`)
  lines.push(`创建时间: ${session.created}`)
  lines.push('')
  for (const msg of session.messages) {
    const role = msg.role === 'user' ? '用户' : '知枝'
    lines.push(`## ${role}`)
    lines.push(msg.content)
    lines.push('')
  }
  return lines.join('\n')
}

/**
 * 将笔记列表序列化为文本格式
 */
function serializeNotes(notes: Note[]): string {
  if (notes.length === 0) return '（本次无新笔记）'
  const lines: string[] = []
  for (const note of notes) {
    lines.push(`- **${note.title}** (${note.type})`)
    lines.push(`  内容: ${note.content.slice(0, 200)}`)
    lines.push(`  标签: ${note.tags.join(', ')}`)
    lines.push('')
  }
  return lines.join('\n')
}

/**
 * 从 LLM 响应中提取 JSON
 */
function extractJSON(text: string): string {
  const codeBlockMatch = text.match(/```json\s*([\s\S]*?)```/)
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim()
  }
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    return jsonMatch[0].trim()
  }
  return text.trim()
}

/**
 * 验证 ProfileDiff 数据是否包含必要字段
 */
function validateProfileDiff(data: unknown): data is ProfileDiff {
  if (!data || typeof data !== 'object') return false
  const d = data as Record<string, unknown>
  return (
    Array.isArray(d.added_concepts) &&
    Array.isArray(d.updated_concepts) &&
    Array.isArray(d.removed_concepts) &&
    Array.isArray(d.suggested_topics) &&
    typeof d.summary === 'string'
  )
}

/**
 * 生成学习者画像更新建议
 *
 * @param session - 完整会话
 * @param existingProfile - 现有 learner.md 内容
 * @param newNotes - 本次会话生成的笔记
 * @param provider - LLM 提供商
 * @param reviewPerformance - 复习表现摘要（P3-5：近 N 次评级分布与掌握度，可空），供 confidence 升降档参考
 * @returns 画像更新 diff
 */
export async function generateProfileUpdate(
  session: Session,
  existingProfile: string,
  newNotes: Note[],
  provider: LLMProvider,
  reviewPerformance?: string,
): Promise<ProfileDiff> {
  const skill = getSkill()
  const systemPrompt = buildPrompt(skill, {
    session_transcript: serializeSession(session),
    existing_profile: existingProfile || '（尚无现有画像）',
    new_notes: serializeNotes(newNotes),
    review_performance: reviewPerformance && reviewPerformance.trim() ? reviewPerformance.trim() : '（暂无复习表现数据）',
  })

  const messages: Message[] = [
    { role: 'user', content: '请根据上述要求分析本次学习会话，生成学习者画像更新建议。' },
  ]

  // 收集完整响应
  let fullResponse = ''
  for await (const chunk of provider.chat(messages, {
    systemPrompt,
    temperature: 0.3,
    maxTokens: 2048,
  })) {
    if (chunk.type === 'text') {
      fullResponse += chunk.content
    } else if (chunk.type === 'error') {
      throw new Error(`LLM 调用失败: ${chunk.content}`)
    }
  }

  // 解析 JSON
  const jsonStr = extractJSON(fullResponse)
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    throw new Error(
      `画像更新失败: 无法解析 LLM 响应为 JSON\n响应内容: ${fullResponse.slice(0, 200)}`,
    )
  }

  if (!validateProfileDiff(parsed)) {
    throw new Error(
      `画像更新失败: 响应缺少必要字段\n响应内容: ${JSON.stringify(parsed).slice(0, 200)}`,
    )
  }

  return parsed
}