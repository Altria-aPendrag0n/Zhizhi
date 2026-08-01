/**
 * 笔记日期工具
 *
 * 统一处理笔记 frontmatter 中的时间字段：
 * - 对空值、缺失、非法格式一律返回 null / 兜底值，杜绝 Invalid Date 泄漏到界面
 * - toLocaleDateString 对 Invalid Date 不抛异常，而是返回 "Invalid Date" 字符串，
 *   因此必须显式校验有效性，不能依赖 try/catch
 */

/**
 * 将时间字段解析为 Date。
 *
 * 空字符串、空白、非字符串或无法解析的值返回 null。
 */
export function parseNoteDate(value: string): Date | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const d = new Date(trimmed)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * 列表卡片短日期，如「6月15日」。
 * 无效或缺失时返回空字符串，避免显示 Invalid Date。
 */
export function formatNoteShortDate(value: string): string {
  const d = parseNoteDate(value)
  if (!d) return ''
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

/**
 * 详情页完整日期，如「2026年6月15日」。
 * 无效时回退返回原字符串，保证调用方始终拿到可展示内容。
 */
export function formatNoteFullDate(value: string): string {
  const d = parseNoteDate(value)
  if (!d) return value
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
