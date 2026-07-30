/**
 * 划线提炼笔记执行器
 *
 * 从用户选中的文本中提取结构化原子笔记。
 * 加载 SKILL.md 模板，替换变量，调用 LLM 生成笔记内容。
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

/**
 * 验证提取的笔记数据是否包含必要字段
 */
function validateExtractedNote(data: unknown): data is ExtractedNote {
  if (!data || typeof data !== 'object') return false
  const d = data as Record<string, unknown>
  return (
    typeof d.title === 'string' &&
    typeof d.proposition === 'string' &&
    typeof d.explanation === 'string' &&
    typeof d.type === 'string' &&
    ['concept', 'method', 'fact', 'question'].includes(d.type) &&
    Array.isArray(d.tags) &&
    d.tags.every((t: unknown) => typeof t === 'string') &&
    typeof d.confidence === 'number'
  )
}

/**
 * 从划线文本中提炼原子笔记
 *
 * @param highlightedText - 用户选中的文本
 * @param sessionContext - 划线文本所在对话的上下文
 * @param provider - LLM 提供商
 * @returns 提取的笔记数据
 */
export async function extractNote(
  highlightedText: string,
  sessionContext: string,
  provider: LLMProvider,
): Promise<ExtractedNote> {
  const skill = getSkill()
  const systemPrompt = buildPrompt(skill, {
    highlighted_text: highlightedText,
    session_context: sessionContext,
  })

  const messages: Message[] = [
    { role: 'user', content: '请根据上述要求提炼原子笔记。' },
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
    throw new Error(`笔记提取失败: 无法解析 LLM 响应为 JSON\n响应内容: ${fullResponse.slice(0, 200)}`)
  }

  if (!validateExtractedNote(parsed)) {
    throw new Error(`笔记提取失败: 响应缺少必要字段\n响应内容: ${JSON.stringify(parsed).slice(0, 200)}`)
  }

  return parsed
}