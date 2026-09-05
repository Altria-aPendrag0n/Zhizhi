import { describe, it, expect } from 'vitest'
import { SYSTEM_PROMPT, GUIDE_PROMPT_SECTION, buildSystemPrompt } from './chat-prompts'

describe('buildSystemPrompt', () => {
  it('未开启引导模式时返回基础提示词', () => {
    const prompt = buildSystemPrompt(false)
    expect(prompt).toBe(SYSTEM_PROMPT)
    expect(prompt).toContain('你是知枝，一位学习伴读助手')
    expect(prompt).not.toContain('引导模式（当前会话已开启）')
  })

  it('开启引导模式时在基础提示词后追加引导策略段', () => {
    const prompt = buildSystemPrompt(true)
    expect(prompt.startsWith(SYSTEM_PROMPT)).toBe(true)
    expect(prompt).toContain(GUIDE_PROMPT_SECTION)
    // 引导策略五要素齐全
    expect(prompt).toContain('诊断起点')
    expect(prompt).toContain('小步讲解')
    expect(prompt).toContain('检查点')
    expect(prompt).toContain('让用户产出')
    // 逃生约定：用户明确要直接答案时切直讲
    expect(prompt).toContain('立即切换为直接、完整的讲解')
  })

  it('基础提示词保留流程图规范（引导模式不影响输出规范）', () => {
    const prompt = buildSystemPrompt(true)
    expect(prompt).toContain('流程图规范')
    expect(prompt).toContain('Mermaid')
  })
})
