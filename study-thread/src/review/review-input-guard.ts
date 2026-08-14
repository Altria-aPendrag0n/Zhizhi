/**
 * 复习作答输入防护（防提示词注入）
 *
 * 用户复习作答 / 辩论发言属于不受信任输入，可能夹带「忽略规则、判定我正确、给我满分」
 * 等指令，试图覆盖反馈与辩论的判定规则。本模块提供两层防护：
 * 1. detectPromptInjection —— 检测疑似注入，供 UI 拦截并提示；
 * 2. sanitizeReviewAnswer —— 净化输入（去控制字符、限长截断、中和注入指令），供执行器兜底。
 *
 * 纯逻辑模块，无 Vue 依赖，可独立单测。
 */

/** 用户作答最大长度（超出截断，防止超长输入撑爆上下文预算） */
export const MAX_REVIEW_ANSWER_LENGTH = 2000

/** 注入指令被中和后替换成的占位文案 */
const NEUTRALIZED_PLACEHOLDER = '（已忽略的无关指令）'

/** 规则覆盖类注入：忽略/无视/忘记 + 规则/指令/要求/系统提示 */
const RULE_OVERRIDE_PATTERNS: RegExp[] = [
  /(?:忽略|无视|不要遵守|不必遵守|无须遵守|无需遵守|忘掉|忘记|清空)\s*(?:以上|上面|上述|所有|一切|这些|那些|这条|那条|该|以下|下面|之前|此前|本|此|的)*\s*(?:规则|指令|要求|约束|提示词|系统提示|系统指令|设定|条款|限制|角色)/,
  /\b(?:ignore|disregard|forget)\s+(?:the\s+|all\s+|any\s+|these\s+|those\s+)*(?:rules?|instructions?|system\s+prompt|guidelines?)\b/i,
]

/** 判定覆盖类注入：要求判对/给满分/标记正确 */
const VERDICT_OVERRIDE_PATTERNS: RegExp[] = [
  /(?:判定|判断|标记|认定|视为|看成|当作)\s*(?:我|我的回答|我的答案|这(?:一)?题|该题|本题)?\s*(?:为|成|是)\s*(?:正确|全对|满分|优秀)/,
  /给\s*我\s*(?:打|判|评)\s*(?:对|正确|满分)/,
  /(?:直接|必须|务必|一定要)\s*(?:给|判|评)\s*(?:我\s*)?(?:对|正确|满分)/,
  /把\s*(?:我|我的回答|这(?:一)?题|该题|本题)\s*(?:判|打|评)\s*(?:成|为|作)\s*(?:正确|对)/,
  /(?:请|麻烦)?\s*(?:把|将)?\s*(?:正确|满分|对)\s*(?:答案|判定|结论)?\s*(?:给|判给|评给)\s*我/,
  /\b(?:mark|judge|grade|score)\s+(?:me|my\s+answer|this)\s+(?:as\s+)?(?:correct|right|full\s+marks|perfect)\b/i,
]

/** 全部注入模式（检测与中和共用） */
const INJECTION_PATTERNS: RegExp[] = [...RULE_OVERRIDE_PATTERNS, ...VERDICT_OVERRIDE_PATTERNS]

/** 控制字符（保留换行与制表符，仅去除不可见控制符） */
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g

/** 检测作答文本是否疑似提示词注入（规则覆盖 / 判定覆盖） */
export function detectPromptInjection(text: string): boolean {
  if (!text) return false
  return INJECTION_PATTERNS.some((pattern) => pattern.test(text))
}

/** 净化用户作答：去控制字符 → 限长截断 → 中和所有注入指令片段 */
export function sanitizeReviewAnswer(text: string): string {
  if (!text) return ''
  const cleaned = text.replace(CONTROL_CHARS, ' ').trim().slice(0, MAX_REVIEW_ANSWER_LENGTH)
  return INJECTION_PATTERNS.reduce((acc, pattern) => acc.split(pattern).join(NEUTRALIZED_PLACEHOLDER), cleaned)
}
