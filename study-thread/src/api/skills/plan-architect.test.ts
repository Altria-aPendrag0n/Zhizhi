import { describe, it, expect } from 'vitest'
import { buildPlanArchitectPrompt, extractPlanDraft } from './plan-architect'

function planJSON(partial: Record<string, unknown> = {}): string {
  return JSON.stringify({
    plan: 'rust-30d',
    title: '30 天入门 Rust',
    goal: '能独立写出 CLI 工具',
    daily_minutes: 90,
    phases: [{ id: 'p1', title: '基础语法', objective: '掌握所有权与借用' }],
    tasks: [{ id: 't001', phase: 'p1', title: '安装工具链', detail: '安装 rustup 并跑通 Hello World', estimate: 60 }],
    body: '# 30 天入门 Rust',
    ...partial,
  })
}

describe('buildPlanArchitectPrompt', () => {
  it('注入 today / vaultOverview / references 且无残留占位符', () => {
    const prompt = buildPlanArchitectPrompt({
      today: '2026-09-03 星期四',
      vaultOverview: '（Vault 为空）',
      references: '（无参考资料）',
    })
    expect(prompt).toContain('2026-09-03 星期四')
    expect(prompt).toContain('（Vault 为空）')
    expect(prompt).toContain('（无参考资料）')
    expect(prompt).not.toMatch(/\{[a-zA-Z_][a-zA-Z0-9_]*\}/)
  })

  it('对话策略为访谈式（一次一问、每问带推荐答案、Vault 假设确认）', () => {
    const prompt = buildPlanArchitectPrompt({
      today: '2026-09-03 星期四',
      vaultOverview: '',
      references: '',
    })
    expect(prompt).toContain('一次只问一个问题')
    expect(prompt).toContain('推荐答案')
    expect(prompt).toContain('假设')
    // 决策树关键分支齐全
    expect(prompt).toContain('学习目标')
    expect(prompt).toContain('已有基础')
    expect(prompt).toContain('每日时长')
  })
})

describe('extractPlanDraft', () => {
  it('普通对话文本（无 JSON）返回 none', () => {
    expect(extractPlanDraft('你每天大概能学习多久？之前接触过 Rust 吗？')).toEqual({ status: 'none' })
  })

  it('解析 ```json 代码块为合法草稿', () => {
    const result = extractPlanDraft(`好的，这是你的学习计划：\n\n\`\`\`json\n${planJSON()}\n\`\`\`\n`)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.draft.kind).toBe('plan')
    expect(result.draft.plan).toBe('rust-30d')
    expect(result.draft.title).toBe('30 天入门 Rust')
    expect(result.draft.daily_minutes).toBe(90)
    expect(result.draft.status).toBe('active')
    expect(result.draft.created).not.toBe('')
    expect(result.draft.phases).toEqual([{ id: 'p1', title: '基础语法', objective: '掌握所有权与借用' }])
    expect(result.draft.tasks[0]).toEqual({
      id: 't001',
      phase: 'p1',
      title: '安装工具链',
      detail: '安装 rustup 并跑通 Hello World',
      estimate: 60,
      done: false,
      done_at: null,
      sessions: [],
    })
    expect(result.draft.body).toBe('# 30 天入门 Rust')
  })

  it('裸 JSON 对象（无代码块）同样可解析', () => {
    const result = extractPlanDraft(planJSON())
    expect(result.status).toBe('ok')
  })

  it('畸形 JSON 返回 invalid', () => {
    const result = extractPlanDraft('```json\n{ "title": "残缺" \n```')
    expect(result.status).toBe('invalid')
    if (result.status === 'invalid') expect(result.error).toContain('格式不合法')
  })

  it('缺少标题返回 invalid', () => {
    const result = extractPlanDraft(`\`\`\`json\n${planJSON({ title: '  ' })}\n\`\`\``)
    expect(result.status).toBe('invalid')
    if (result.status === 'invalid') expect(result.error).toContain('标题')
  })

  it('任务为空返回 invalid', () => {
    const result = extractPlanDraft(`\`\`\`json\n${planJSON({ tasks: [] })}\n\`\`\``)
    expect(result.status).toBe('invalid')
    if (result.status === 'invalid') expect(result.error).toContain('任务')
  })

  it('daily_minutes 非正数返回 invalid，缺省时归一为 60', () => {
    const bad = extractPlanDraft(`\`\`\`json\n${planJSON({ daily_minutes: 0 })}\n\`\`\``)
    expect(bad.status).toBe('invalid')

    const fallback = extractPlanDraft(`\`\`\`json\n${planJSON({ daily_minutes: undefined })}\n\`\`\``)
    expect(fallback.status).toBe('ok')
    if (fallback.status === 'ok') expect(fallback.draft.daily_minutes).toBe(60)
  })

  it('任务缺字段时按默认值归一（id/estimate/phase）', () => {
    const result = extractPlanDraft(
      `\`\`\`json\n${planJSON({
        phases: [{ id: 'p1', title: '基础语法' }],
        tasks: [{ title: '只有标题的任务' }],
      })}\n\`\`\``,
    )
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.draft.tasks[0].id).toBe('t1')
    expect(result.draft.tasks[0].phase).toBe('p1')
    expect(result.draft.tasks[0].estimate).toBe(30)
    expect(result.draft.tasks[0].sessions).toEqual([])
  })

  it('plan id 非法时从标题兜底，合法时归一为小写', () => {
    const fallback = extractPlanDraft(`\`\`\`json\n${planJSON({ plan: '不合法 id!' })}\n\`\`\``)
    expect(fallback.status).toBe('ok')
    if (fallback.status === 'ok') expect(fallback.draft.plan).toBe('30-天入门-Rust')

    const lower = extractPlanDraft(`\`\`\`json\n${planJSON({ plan: 'Rust-30D' })}\n\`\`\``)
    expect(lower.status).toBe('ok')
    if (lower.status === 'ok') expect(lower.draft.plan).toBe('rust-30d')
  })

  it('plan id 缺省且标题全被过滤时使用时间戳兜底', () => {
    const result = extractPlanDraft(`\`\`\`json\n${planJSON({ plan: undefined, title: '###' })}\n\`\`\``)
    expect(result.status).toBe('ok')
    if (result.status === 'ok') expect(result.draft.plan).toMatch(/^plan-\d+$/)
  })
})
