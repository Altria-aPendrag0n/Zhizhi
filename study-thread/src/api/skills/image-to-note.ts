/**
 * 图片转笔记执行器
 *
 * 将图片（照片/截图，可能含表格）通过多模态 LLM 识别为结构化 Markdown，
 * 并附笔记元信息（标题、描述、标签）。与 extract-note 同构：
 * 加载 SKILL.md 模板 → 组装多模态消息（文本 + 图片）→ 收集响应 → 解析 JSON → 校验。
 */

import type { LLMProvider, Message, ImageContent } from '../llm-provider'
import { parseSkill, buildPrompt } from '../../skills/loader'

// SKILL.md 内容（构建时内联）
import skillRaw from '../../skills/image-to-note/SKILL.md?raw'

/** 图片转笔记的用户意图 */
export type ImageToNoteIntent = 'note' | 'reference'

/** 图片识别结果：元信息 + Markdown 正文 */
export interface ImageNoteResult {
  title: string
  description: string
  tags: string[]
  markdown: string
}

/** 缓存解析后的 Skill 对象 */
let _skillCache: ReturnType<typeof parseSkill> | null = null

function getSkill() {
  if (!_skillCache) {
    _skillCache = parseSkill(skillRaw)
  }
  return _skillCache
}

/** 从 LLM 响应中提取 JSON（支持 ```json 代码块或裸 JSON 对象） */
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

/** 校验 LLM 输出是否含全部必要字段 */
export function validateImageNoteResult(data: unknown): data is ImageNoteResult {
  if (!data || typeof data !== 'object') return false
  const d = data as Record<string, unknown>
  return (
    typeof d.title === 'string' &&
    typeof d.description === 'string' &&
    Array.isArray(d.tags) &&
    d.tags.every((t: unknown) => typeof t === 'string') &&
    typeof d.markdown === 'string' &&
    d.markdown.trim().length > 0
  )
}

/** 将用户意图映射为提示词中的说明文字 */
const INTENT_HINTS: Record<ImageToNoteIntent, string> = {
  note: '用户想把这张图片保存为一张新笔记。请完整识别内容并按笔记要求输出。',
  reference: '用户想把这张图片识别为参考资料（与 PDF 提取产物类似）。请完整、准确地还原图片中的全部文字与表格，尽量减少遗漏。',
}

/**
 * 将图片识别为结构化 Markdown（含表格还原）与笔记元信息。
 *
 * @param image - 压缩后的图片数据（mimeType + base64）
 * @param provider - 图片转笔记专用模型 Provider（OpenAI 兼容多模态）
 * @param intent - 用户意图（转笔记 / 识别为参考资料）
 * @returns 识别结果：{ title, description, tags, markdown }
 */
export async function imageToMarkdown(
  image: ImageContent,
  provider: LLMProvider,
  intent: ImageToNoteIntent = 'note',
): Promise<ImageNoteResult> {
  const skill = getSkill()
  const systemPrompt = buildPrompt(skill, {
    image_intent: INTENT_HINTS[intent],
  })

  const messages: Message[] = [
    {
      role: 'user',
      content: '请识别这张图片的内容并输出笔记 Markdown。',
      images: [image],
    },
  ]

  // 收集完整响应
  let fullResponse = ''
  for await (const chunk of provider.chat(messages, {
    systemPrompt,
    temperature: 0.3,
    maxTokens: 4096,
    disableThinking: true,
    busyMessage: 'AI 正在识别图片…',
  })) {
    if (chunk.type === 'text') {
      fullResponse += chunk.content
    } else if (chunk.type === 'error') {
      throw new Error(`LLM 调用失败: ${chunk.content}`)
    }
  }

  if (!fullResponse.trim()) {
    throw new Error('AI 返回了空响应，请检查转笔记模型配置后重试。')
  }

  // 解析 JSON
  const jsonStr = extractJSON(fullResponse)
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    throw new Error(`图片识别失败: 无法解析 LLM 响应为 JSON\n响应内容: ${fullResponse.slice(0, 200)}`)
  }

  if (!validateImageNoteResult(parsed)) {
    throw new Error(`图片识别失败: 响应缺少必要字段\n响应内容: ${JSON.stringify(parsed).slice(0, 200)}`)
  }

  return {
    title: parsed.title.trim(),
    description: parsed.description.trim(),
    tags: parsed.tags.length > 0 ? parsed.tags : ['未分类'],
    markdown: parsed.markdown.trim(),
  }
}
