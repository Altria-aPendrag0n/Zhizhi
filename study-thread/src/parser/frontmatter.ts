import * as yaml from 'js-yaml'

export interface FrontmatterResult {
  meta: Record<string, unknown>
  body: string
}

function normalizeYamlValue(value: unknown): unknown {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return ''
    return value.getUTCHours() === 0 && value.getUTCMinutes() === 0 && value.getUTCSeconds() === 0 && value.getUTCMilliseconds() === 0
      ? value.toISOString().slice(0, 10)
      : value.toISOString()
  }

  if (Array.isArray(value)) return value.map(normalizeYamlValue)

  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeYamlValue(item)]))
  }

  return value
}

export function parseFrontmatter(content: string): FrontmatterResult {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/
  const match = content.match(frontmatterRegex)

  if (!match) {
    return { meta: {}, body: content }
  }

  let meta: Record<string, unknown> = {}

  try {
    // 使用 YAML 1.2 core schema：日期字符串（如 2024-01-01）保持为字符串，
    // 避免被默认 schema 解析为 Date 后产生时区偏移或无效日期。
    const parsed = yaml.load(match[1], { schema: yaml.CORE_SCHEMA })
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      meta = normalizeYamlValue(parsed) as Record<string, unknown>
    }
  } catch {
    // 宽松容错：旧版本 serializeNote 曾把多行划线文本（如表格）裸写入 highlight 字段，
    // 换行未转义导致整个 frontmatter 解析失败（tags 等字段一并丢失）。此处尝试丢弃
    // highlight 的多行值后重新解析，尽力恢复 title/tags/description 等关键字段。
    meta = parseFrontmatterLenient(match[1])
  }

  return { meta, body: content.slice(match[0].length) }
}

/**
 * 宽松解析损坏的 frontmatter：丢弃跨行未闭合的 highlight 双引号值，
 * 保留其余字段后重新用 YAML 解析；仍失败则返回空对象。
 */
function parseFrontmatterLenient(frontmatter: string): Record<string, unknown> {
  const lines = frontmatter.split('\n')
  const cleaned: string[] = []
  let skipping = false

  for (const line of lines) {
    if (skipping) {
      // 下一个顶层字段（非缩进行、非空行）表示 highlight 多行结束
      if (/^[A-Za-z_][\w-]*:\s*/.test(line)) {
        skipping = false
        cleaned.push(line)
      }
      continue
    }
    // 检测多行 highlight 的开始：highlight: "..." 且当前行内无闭合引号
    if (/^\s*highlight:\s*"/.test(line) && !/"\s*$/.test(line.trim())) {
      skipping = true
      continue
    }
    cleaned.push(line)
  }

  try {
    const parsed = yaml.load(cleaned.join('\n'), { schema: yaml.CORE_SCHEMA })
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (normalizeYamlValue(parsed) as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}
