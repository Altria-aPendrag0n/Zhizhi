import { describe, it, expect, vi } from 'vitest'
import { parseSkill, buildPrompt } from './loader'

// Mock vault-fs
vi.mock('../utils/vault-fs', () => ({
  readFile: vi.fn(),
}))

describe('parseSkill', () => {
  it('解析标准 SKILL.md', () => {
    const raw = `---
name: test-skill
description: 测试技能
---
这是技能模板内容，变量 {test_var} 会被替换。`
    const skill = parseSkill(raw)
    expect(skill.name).toBe('test-skill')
    expect(skill.description).toBe('测试技能')
    expect(skill.body).toBe('这是技能模板内容，变量 {test_var} 会被替换。')
  })

  it('缺少 frontmatter 时抛出错误', () => {
    const raw = '没有 frontmatter 的内容'
    expect(() => parseSkill(raw)).toThrow('缺少 frontmatter 块')
  })

  it('缺少 name 字段时抛出错误', () => {
    const raw = `---
description: 无名称
---
内容`
    expect(() => parseSkill(raw)).toThrow('缺少 name 字段')
  })

  it('frontmatter 解析失败时抛出错误', () => {
    const raw = `---
invalid: yaml: : :
---
内容`
    expect(() => parseSkill(raw)).toThrow('frontmatter 解析失败')
  })

  it('处理没有 description 的 skill', () => {
    const raw = `---
name: no-desc
---
内容`
    const skill = parseSkill(raw)
    expect(skill.name).toBe('no-desc')
    expect(skill.description).toBe('')
  })
})

describe('buildPrompt', () => {
  it('替换单个变量', () => {
    const skill = {
      name: 'test',
      description: '',
      body: '请分析以下文本：{text}',
    }
    const result = buildPrompt(skill, { text: '费曼学习法' })
    expect(result).toBe('请分析以下文本：费曼学习法')
  })

  it('替换多个变量', () => {
    const skill = {
      name: 'test',
      description: '',
      body: '用户问题：{question}\n\n上下文：{context}',
    }
    const result = buildPrompt(skill, {
      question: '什么是学习？',
      context: '之前讨论了费曼学习法',
    })
    expect(result).toContain('用户问题：什么是学习？')
    expect(result).toContain('上下文：之前讨论了费曼学习法')
  })

  it('相同变量多次出现全部替换', () => {
    const skill = {
      name: 'test',
      description: '',
      body: '关键词：{keyword}，再次提到 {keyword}',
    }
    const result = buildPrompt(skill, { keyword: '学习' })
    expect(result).toBe('关键词：学习，再次提到 学习')
  })

  it('变量值中包含特殊字符时正确处理', () => {
    const skill = {
      name: 'test',
      description: '',
      body: '{text}',
    }
    const result = buildPrompt(skill, { text: '包含 $ ^ . * + 等特殊字符' })
    expect(result).toBe('包含 $ ^ . * + 等特殊字符')
  })

  it('不存在的变量保持原样', () => {
    const skill = {
      name: 'test',
      description: '',
      body: '模板中有 {existing_var} 和 {missing_var}',
    }
    const result = buildPrompt(skill, { existing_var: '值' })
    expect(result).toContain('值')
    expect(result).toContain('{missing_var}')
  })
})