/**
 * 划线摘录笔记执行器
 *
 * 为划线摘录的原文补充笔记元信息（标题、描述、标签），不改写原文。
 * 加载 SKILL.md 模板，替换变量，调用 LLM 生成元信息。
 */

import type { LLMProvider, Message } from '../llm-provider'
import type { ExtractedNote } from '../../types'
import { parseSkill, buildPrompt } from '../../skills/loader'

// SKILL.md 内容（构建时内联）
// 在开发环境中，通过 Vite 的 raw import 直接加载
import skillRaw from '../../skills/extract-note/SKILL.md?raw'

/** 缓存解析后的 Skill 对象 */
let _skillCache: ReturnType<typeof parseSkill> | null = null

function getSkill() {
  if (!_skillCache) {
    _skillCache = parseSkill(skillRaw)
  }
  return _skillCache
}

/**
 * 从 LLM 响应中提取 JSON
 * 支持 markdown 代码块包裹的 JSON
 */
function extractJSON(text: string): string {
  // 尝试匹配 ```json ... ``` 代码块
  const codeBlockMatch = text.match(/```json\s*([\s\S]*?)```/)
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim()
  }
  // 尝试匹配裸 JSON 对象
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    return jsonMatch[0].trim()
  }
  return text.trim()
}

/** LLM 输出的元信息结构（仅标题/描述/标签） */
interface ExtractedMeta {
  title?: string
  description: string
  tags: string[]
}

/**
 * 摘录笔记的 LLM 生成开关
 * - 标题/标签关闭时跳过 LLM 对应环节，改用本地兜底值
 * - 两个开关都关闭时完全不调用 LLM（描述同样使用本地兜底）
 */
export interface ExtractNoteOptions {
  /** 是否允许 LLM 自动生成标题；关闭时用划线文本前 20 字兜底（用户显式指定的标题始终优先） */
  generateTitle?: boolean
  /** 是否允许 LLM 自动生成标签；关闭时统一使用 ['未分类'] */
  generateTags?: boolean
}

/**
 * 验证 LLM 输出的元信息是否合法（title 可选，description/tags 必填）
 */
function validateExtractedMeta(data: unknown): data is ExtractedMeta {
  if (!data || typeof data !== 'object') return false
  const d = data as Record<string, unknown>
  return (
    (d.title === undefined || typeof d.title === 'string') &&
    typeof d.description === 'string' &&
    Array.isArray(d.tags) &&
    d.tags.every((t: unknown) => typeof t === 'string')
  )
}

/**
 * 将划线文本前若干字作为标题兜底
 */
function fallbackTitle(highlightedText: string): string {
  const cleaned = highlightedText.replace(/\s+/g, ' ').trim()
  return cleaned.slice(0, 20) || '未命名笔记'
}

/**
 * 将划线文本前若干字作为描述兜底（跳过 LLM 生成时的本地替代）
 */
function fallbackDescription(highlightedText: string): string {
  const cleaned = highlightedText.replace(/\s+/g, ' ').trim()
  return cleaned.slice(0, 80)
}

/**
 * 从划线文本中提取笔记元信息
 *
 * 原文不会加工，将作为笔记正文原样保存；本函数只产出
 * 标题（可选）、描述与标签，其余 ExtractedNote 字段使用保守默认值。
 *
 * @param highlightedText - 用户选中的文本（将作为笔记正文）
 * @param sessionContext - 划线文本所在对话的上下文
 * @param provider - LLM 提供商
 * @param userTitle - 用户指定的标题（可选）；提供后 title 固定为该值
 * @param options - LLM 生成开关（标题/标签）；关闭时跳过对应环节
 * @returns 提取的笔记数据
 */
export async function extractNote(
  highlightedText: string,
  sessionContext: string,
  provider: LLMProvider,
  userTitle?: string,
  options: ExtractNoteOptions = {},
): Promise<ExtractedNote> {
  const generateTitle = options.generateTitle !== false
  const generateTags = options.generateTags !== false
  // 描述无独立开关：标题/标签任一开启才调用 LLM，否则完全跳过 LLM 环节
  const needLLM = generateTitle || generateTags
  const resolvedUserTitle = userTitle && userTitle.trim() ? userTitle.trim() : ''
  const titleFallback = fallbackTitle(highlightedText)

  if (!needLLM) {
    // 标题/标签均不允许 LLM 生成：本地兜底，不发起任何 LLM 调用
    return {
      title: resolvedUserTitle || titleFallback,
      description: fallbackDescription(highlightedText),
      proposition: '',
      explanation: '',
      type: 'concept',
      tags: ['未分类'],
      confidence: 0.5,
    }
  }

  const skill = getSkill()
  const systemPrompt = buildPrompt(skill, {
    highlighted_text: highlightedText,
    session_context: sessionContext,
    user_title_block: userTitle
      ? `本次笔记的标题已由用户确定为「${userTitle}」，请在输出的 title 中原样使用它，不要更改或另拟标题。`
      : '（用户未指定标题，由你根据划线文本拟定一个简洁标题）',
  })

  const messages: Message[] = [
    { role: 'user', content: '请为上述划线内容生成笔记元信息。' },
  ]

  // 收集完整响应
  let fullResponse = ''
  for await (const chunk of provider.chat(messages, {
    systemPrompt,
    temperature: 0.3,
    maxTokens: 1024,
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
    throw new Error(`笔记元信息提取失败: 无法解析 LLM 响应为 JSON\n响应内容: ${fullResponse.slice(0, 200)}`)
  }

  if (!validateExtractedMeta(parsed)) {
    throw new Error(`笔记元信息提取失败: 响应缺少必要字段\n响应内容: ${JSON.stringify(parsed).slice(0, 200)}`)
  }

  // 组装 ExtractedNote：原文不加工，proposition/explanation 留空，type/confidence 用保守默认
  // 标题优先级：用户指定 > LLM 生成（若开启）> 划线文本兜底
  const title =
    resolvedUserTitle ||
    (generateTitle && typeof parsed.title === 'string' && parsed.title.trim()
      ? parsed.title.trim()
      : titleFallback)

  return {
    title,
    description: parsed.description,
    proposition: '',
    explanation: '',
    type: 'concept',
    // 标签：仅当开关开启时采用 LLM 结果，否则一律用默认标签（LLM 返回空数组时同样兜底）
    tags: generateTags && parsed.tags.length > 0 ? parsed.tags : ['未分类'],
    confidence: 0.5,
  }
}