/**
 * Skill 加载器
 *
 * 用于解析 SKILL.md 文件，提取 frontmatter 元数据和 body 模板，
 * 并支持变量替换拼接最终的 prompt。
 *
 * SKILL.md 格式:
 * ```
 * ---
 * name: skill-name
 * description: 技能描述
 * ---
 * 技能模板内容，支持 {variable_name} 变量替换
 * ```
 *
 * 用法:
 * ```
 * import { parseSkill, buildPrompt, loadSkillFromFile } from '../skills/loader'
 *
 * // 从字符串解析
 * const skill = parseSkill(rawMarkdown)
 *
 * // 替换变量
 * const prompt = buildPrompt(skill, { highlighted_text: '...', session_context: '...' })
 *
 * // 从文件加载
 * const skill = await loadSkillFromFile('/path/to/SKILL.md')
 * ```
 */

import * as yaml from 'js-yaml'
import { readFile } from '../utils/vault-fs'
import type { Skill } from '../types'

/**
 * 从原始 Markdown 字符串解析 Skill
 * 提取 YAML frontmatter 作为元数据，剩余内容作为 body
 */
export function parseSkill(raw: string): Skill {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/
  const match = raw.match(frontmatterRegex)

  if (!match) {
    throw new Error('SKILL.md 格式错误: 缺少 frontmatter 块')
  }

  const frontmatterStr = match[1]
  const body = raw.slice(match[0].length).trim()

  let meta: Record<string, unknown>
  try {
    meta = yaml.load(frontmatterStr) as Record<string, unknown>
  } catch {
    throw new Error('SKILL.md 格式错误: frontmatter 解析失败')
  }

  if (!meta.name || typeof meta.name !== 'string') {
    throw new Error('SKILL.md 格式错误: frontmatter 中缺少 name 字段')
  }

  return {
    name: meta.name,
    description: (meta.description as string) || '',
    body,
  }
}

/**
 * 转义正则表达式中的特殊字符
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 将 Skill 模板中的变量替换为实际值
 * 模板中使用 {key} 语法标记变量位置
 */
export function buildPrompt(skill: Skill, vars: Record<string, string>): string {
  let result = skill.body

  for (const [key, value] of Object.entries(vars)) {
    // 使用正则全局替换，兼容 ES2020
    result = result.replace(new RegExp(`\\{${escapeRegex(key)}\\}`, 'g'), value)
  }

  return result
}

/**
 * 从文件系统加载 SKILL.md 文件
 * 使用 Tauri 的 read_file 命令读取文件内容
 */
export async function loadSkillFromFile(filePath: string): Promise<Skill> {
  const raw = await readFile(filePath)
  return parseSkill(raw)
}