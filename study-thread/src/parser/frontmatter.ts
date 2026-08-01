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
    meta = {}
  }

  return { meta, body: content.slice(match[0].length) }
}
