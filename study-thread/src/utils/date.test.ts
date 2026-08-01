import { describe, it, expect } from 'vitest'
import { parseNoteDate, formatNoteShortDate, formatNoteFullDate } from './date'

describe('parseNoteDate', () => {
  it('解析标准 ISO 日期', () => {
    expect(parseNoteDate('2026-06-15T00:00:00.000Z')?.toISOString()).toBe('2026-06-15T00:00:00.000Z')
  })

  it('解析 date-only 日期', () => {
    expect(parseNoteDate('2026-06-15')?.toISOString()).toBe('2026-06-15T00:00:00.000Z')
  })

  it('空字符串与空白返回 null', () => {
    expect(parseNoteDate('')).toBeNull()
    expect(parseNoteDate('   ')).toBeNull()
  })

  it('非字符串返回 null', () => {
    expect(parseNoteDate(undefined as unknown as string)).toBeNull()
  })

  it('无法解析的字符串返回 null（而非 Invalid Date）', () => {
    expect(parseNoteDate('Invalid Date')).toBeNull()
    expect(parseNoteDate('2026年6月15日')).toBeNull()
    expect(parseNoteDate('not-a-date')).toBeNull()
  })
})

describe('formatNoteShortDate', () => {
  it('有效日期格式化为月/日', () => {
    const result = formatNoteShortDate('2026-06-15T00:00:00.000Z')
    expect(result).toContain('6')
    expect(result).toContain('15')
  })

  it('无效日期返回空字符串而非 Invalid Date', () => {
    expect(formatNoteShortDate('')).toBe('')
    expect(formatNoteShortDate('垃圾文本')).toBe('')
    expect(formatNoteShortDate('Invalid')).toBe('')
  })
})

describe('formatNoteFullDate', () => {
  it('有效日期格式化为完整日期', () => {
    const result = formatNoteFullDate('2026-06-15T00:00:00.000Z')
    expect(result).toContain('2026')
    expect(result).toContain('6')
    expect(result).toContain('15')
  })

  it('无效日期回退返回原字符串', () => {
    expect(formatNoteFullDate('')).toBe('')
    expect(formatNoteFullDate('垃圾文本')).toBe('垃圾文本')
  })
})
