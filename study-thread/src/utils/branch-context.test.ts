import { describe, expect, it } from 'vitest'
import type { Message } from '../types'
import {
  parseMessages,
  buildForkContextPreview,
  stripInheritedContext,
  serializeForkContext,
  extractForkContext,
} from './branch-context'

const messages: Message[] = [
  { role: 'user', content: '问题1' },
  { role: 'assistant', content: '回答1，这是划线所在的回答' },
  { role: 'user', content: '问题2' },
]

describe('parseMessages', () => {
  it('解析会话 Markdown 正文为消息', () => {
    const body = `## 用户
问题1

## 知枝
回答1`
    const parsed = parseMessages(body, Number.MAX_SAFE_INTEGER)
    expect(parsed).toEqual([
      { role: 'user', content: '问题1' },
      { role: 'assistant', content: '回答1' },
    ])
  })

  it('按 upToIndex 截断分叉点前的消息', () => {
    const body = `## 用户
问题1

## 知枝
回答1

## 用户
问题2

## 知枝
回答2`
    const parsed = parseMessages(body, 1)
    expect(parsed).toHaveLength(2)
    expect(parsed[1].content).toBe('回答1')
  })

  it('正文开头存在分叉点上下文区块时跳过，不影响消息解析', () => {
    const preview = '（前一条 · 知枝）\n前一条内容\n\n（划线内容 · 知枝）\n划线内容'
    const body = `${serializeForkContext(preview)}\n\n## 用户\n问题1\n\n## 知枝\n回答1`
    const parsed = parseMessages(body, Number.MAX_SAFE_INTEGER)
    expect(parsed).toEqual([
      { role: 'user', content: '问题1' },
      { role: 'assistant', content: '回答1' },
    ])
  })

  it('消息内的 AI 思考过程区块被跳过，不混入消息正文', () => {
    const body = `## 用户
问题1

## 知枝
<!-- thinking -->
思考步骤
<!-- /thinking -->

回答1`
    const parsed = parseMessages(body, Number.MAX_SAFE_INTEGER)
    expect(parsed).toEqual([
      { role: 'user', content: '问题1' },
      { role: 'assistant', content: '回答1' },
    ])
  })
})

describe('serializeForkContext / extractForkContext', () => {
  it('序列化与提取往返一致', () => {
    const preview = '（前一条 · 知枝）\n附近文本\n\n（划线内容 · 知枝）\n划线文本'
    const body = `${serializeForkContext(preview)}\n\n## 用户\n问题`
    expect(extractForkContext(body)).toBe(preview)
  })

  it('空文本序列化结果为空串', () => {
    expect(serializeForkContext('')).toBe('')
  })

  it('无区块时提取返回空串', () => {
    expect(extractForkContext('## 用户\n问题')).toBe('')
  })

  it('区块内容含 --> 时转义，避免提前闭合标记', () => {
    const preview = '内容包含 --> 符号'
    const serialized = serializeForkContext(preview)
    // 内容中的 --> 被转义为 --&gt;，区块结束标记仍完整
    expect(serialized).toContain('内容包含 --&gt; 符号')
    expect(serialized).toContain('<!-- /fork-context -->')
    expect(extractForkContext(serialized)).toBe(preview)
  })
})

describe('buildForkContextPreview', () => {
  it('展示划线内容上下各三句话与前一条消息的最后三句', () => {
    const context: Message[] = [
      { role: 'user', content: '甲。乙。丙。丁。戊。' },
      { role: 'assistant', content: '句一。句二。句三。句四。句五。句六。句七。句八。句九。' },
    ]
    const preview = buildForkContextPreview(context, 1, '句五')
    // 划线内容上下各三句：句二～句八（句五为第 5 句，0 基索引 4），划线文本用 <mark> 标出
    expect(preview).toContain('（划线内容 · 知枝）')
    expect(preview).toContain('<mark class="fork-highlight">句五</mark>')
    expect(preview).toContain('句二。')
    expect(preview).toContain('句八。')
    expect(preview).not.toContain('句一。')
    expect(preview).not.toContain('句九。')
    // 前一条消息只保留最后三句
    expect(preview).toContain('（前一条 · 用户）')
    expect(preview).toContain('丙。')
    expect(preview).toContain('戊。')
    expect(preview).not.toContain('甲。')
  })

  it('markdown 多行消息按行切分，以划线行为中心上下各三句', () => {
    const context: Message[] = [
      { role: 'assistant', content: '行一\n行二\n行三\n行四\n行五\n行六\n行七\n行八\n行九' },
    ]
    const preview = buildForkContextPreview(context, 0, '行五')
    expect(preview).toContain('行二')
    expect(preview).toContain('行八')
    expect(preview).not.toContain('行一')
    expect(preview).not.toContain('行九')
  })

  it('划线文本跨加粗标记时仍能定位划线所在句（以划线为中心）', () => {
    const context: Message[] = [
      { role: 'assistant', content: '句一。句二。句三。句四。这是 **加粗标记** 的句子。句五。句六。句七。句八。' },
    ]
    // 视觉上划选「标记 的句子」：源文本中是「标记** 的句子」（被加粗闭合符打断）
    const preview = buildForkContextPreview(context, 0, '标记 的句子')
    expect(preview).toContain('句二。')
    expect(preview).toContain('句四。')
    expect(preview).toContain('句五。')
    expect(preview).not.toContain('句一。')
  })

  it('划线文本定位不到时不加高亮标记', () => {
    const context: Message[] = [
      { role: 'assistant', content: '句一。句二。句三。句四。句五。句六。句七。句八。句九。' },
    ]
    const preview = buildForkContextPreview(context, 0, '不存在的划线文本')
    expect(preview).toContain('句一。')
    expect(preview).toContain('句七。')
    expect(preview).not.toContain('句九。')
    expect(preview).not.toContain('<mark')
  })

  it('不传划线文本时不加高亮标记', () => {
    const preview = buildForkContextPreview(messages, 1)
    expect(preview).toContain('（划线内容 · 知枝）')
    expect(preview).not.toContain('<mark')
  })

  it('划线整张表格时按连续行块定位，上下文围绕表格且不注入破坏表格的 mark', () => {
    const table = '| 名称 | 说明 |\n| --- | --- |\n| 皮皮虾 | 口虾蛄 |\n| 富贵虾 | 龙虾的俗称 |'
    const longIntro = Array.from({ length: 10 }, (_, i) => `介绍段落第 ${i + 1} 句。`).join('\n')
    const context: Message[] = [
      { role: 'assistant', content: `${longIntro}\n${table}\n收尾总结。` },
    ]
    // 选区落在表格内时划线文本为整张表格 Markdown 源码（多行）
    const preview = buildForkContextPreview(context, 0, table)
    // 上下文围绕表格（而非退化为消息开头）：表格位于句子索引 10~13，
    // 上下各 3 句 → 索引 7 起，表格前第 7 句（索引 6）不在范围内
    expect(preview).toContain('皮皮虾')
    expect(preview).toContain('富贵虾')
    expect(preview).toContain('介绍段落第 8 句。')
    expect(preview).not.toContain('介绍段落第 7 句。')
    expect(preview).not.toContain('介绍段落第 1 句。')
    // 多行划线不在源文本插 mark（marked 无法识别 <mark>| 行的表格语法，破坏渲染）；
    // 高亮由前端渲染后 DOM 整表包裹完成（wrapTableInDOM）
    expect(preview).not.toContain('<mark')
  })

  it('划线整张表格时前一条消息的最后三句仍保留', () => {
    const table = '| 名称 | 说明 |\n| --- | --- |\n| 皮皮虾 | 口虾蛄 |'
    const context: Message[] = [
      { role: 'user', content: '甲。乙。丙。丁。戊。' },
      { role: 'assistant', content: `先介绍虾类。\n${table}\n以上就是全部内容。` },
    ]
    const preview = buildForkContextPreview(context, 1, table)
    expect(preview).toContain('（前一条 · 用户）')
    expect(preview).toContain('丙。')
    expect(preview).toContain('皮皮虾')
    expect(preview).not.toContain('<mark')
  })

  it('划线消息为第一条时无前一条前缀', () => {
    const preview = buildForkContextPreview(messages, 0)
    expect(preview).not.toContain('前一条')
    expect(preview).toContain('（划线内容 · 用户）')
    expect(preview).toContain('问题1')
  })

  it('forkIndex 超出时回退到最后一条消息', () => {
    const preview = buildForkContextPreview(messages, 99)
    expect(preview).toContain('（划线内容 · 用户）')
    expect(preview).toContain('问题2')
  })

  it('前一条消息过长时截断为附近文本', () => {
    const longPrev = '长'.repeat(300)
    const preview = buildForkContextPreview([{ role: 'user', content: longPrev }, { role: 'assistant', content: '划线回答。' }], 1, '划线回答')
    expect(preview).toContain('长'.repeat(120) + '…')
  })

  it('空上下文返回空串', () => {
    expect(buildForkContextPreview([], 0)).toBe('')
  })
})

describe('stripInheritedContext', () => {
  const inherited: Message[] = [
    { role: 'user', content: '主问题' },
    { role: 'assistant', content: '主回答' },
  ]

  it('saved 开头与继承上下文一致时剥离前缀', () => {
    const saved: Message[] = [
      ...inherited,
      { role: 'user', content: '分支提问' },
      { role: 'assistant', content: '分支回答' },
    ]
    expect(stripInheritedContext(saved, inherited)).toEqual([
      { role: 'user', content: '分支提问' },
      { role: 'assistant', content: '分支回答' },
    ])
  })

  it('saved 不含继承前缀时原样返回（新版本分支文件）', () => {
    const saved: Message[] = [{ role: 'user', content: '分支提问' }]
    expect(stripInheritedContext(saved, inherited)).toBe(saved)
  })

  it('saved 长度不足时原样返回', () => {
    expect(stripInheritedContext([{ role: 'user', content: 'x' }], inherited)).toHaveLength(1)
  })

  it('继承上下文为空时原样返回', () => {
    const saved: Message[] = [{ role: 'user', content: 'x' }]
    expect(stripInheritedContext(saved, [])).toBe(saved)
  })
})
