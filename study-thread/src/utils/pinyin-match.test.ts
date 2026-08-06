import { describe, it, expect } from 'vitest'
import { toPinyinVariants, tagMatchesQuery } from './pinyin-match'

describe('toPinyinVariants', () => {
  it('返回全拼（无音调紧凑）与首字母缩写', () => {
    expect(toPinyinVariants('淡水虾')).toEqual(['danshuixia', 'dsx'])
  })

  it('多音字按常用读音输出（虾 → xia）', () => {
    expect(toPinyinVariants('虾')).toEqual(['xia', 'x'])
  })

  it('英文/数字原样保留，与中文拼音拼接', () => {
    expect(toPinyinVariants('AI笔记')).toEqual(['AIbiji', 'AIbj'])
  })

  it('同一文本结果有缓存（幂等）', () => {
    expect(toPinyinVariants('记忆')).toEqual(toPinyinVariants('记忆'))
  })
})

describe('tagMatchesQuery', () => {
  it('中文按子串匹配（单字匹配：输入"虾"命中含"虾"的标签）', () => {
    expect(tagMatchesQuery('淡水虾', '虾')).toBe(true)
    expect(tagMatchesQuery('小龙虾', '虾')).toBe(true)
    expect(tagMatchesQuery('虾', '虾')).toBe(true)
  })

  it('子串匹配不限于完整标签（输入"淡水"命中"淡水虾"）', () => {
    expect(tagMatchesQuery('淡水虾', '淡水')).toBe(true)
    expect(tagMatchesQuery('淡水虾', '海鱼')).toBe(false)
  })

  it('拼音全拼匹配：输入 "xia" 命中"虾"', () => {
    expect(tagMatchesQuery('淡水虾', 'xia')).toBe(true)
    expect(tagMatchesQuery('虾', 'xia')).toBe(true)
  })

  it('拼音首字母匹配：输入 "dsx" 命中"淡水虾"', () => {
    expect(tagMatchesQuery('淡水虾', 'dsx')).toBe(true)
  })

  it('英文标签原文匹配（输入 "AI" 命中"AI工具"）', () => {
    expect(tagMatchesQuery('AI工具', 'ai')).toBe(true)
    expect(tagMatchesQuery('AI工具', 'ai')).toBe(true)
  })

  it('大小写不敏感', () => {
    expect(tagMatchesQuery('淡水虾', 'XIA')).toBe(true)
    expect(tagMatchesQuery('记忆', '记忆')).toBe(true)
  })

  it('空查询始终命中', () => {
    expect(tagMatchesQuery('任意标签', '')).toBe(true)
    expect(tagMatchesQuery('任意标签', '   ')).toBe(true)
  })

  it('不相关拼音/中文不命中', () => {
    expect(tagMatchesQuery('淡水虾', 'yu')).toBe(false)
    expect(tagMatchesQuery('记忆', 'shu')).toBe(false)
  })
})
