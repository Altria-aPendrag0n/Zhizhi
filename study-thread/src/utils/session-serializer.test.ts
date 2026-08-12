import { describe, it, expect } from 'vitest'
import {
  generateSessionTitle,
  sanitizeFileName,
  serializeSession,
  parseSessionMeta,
  parseSessionMessages,
  parseSessionFile,
} from './session-serializer'
import type { Session } from '../types'

describe('generateSessionTitle', () => {
  it('从首条用户消息提取标题（<=30字）', () => {
    const messages = [
      { role: 'user' as const, content: '请解释什么是费曼学习法' },
    ]
    expect(generateSessionTitle(messages)).toBe('请解释什么是费曼学习法')
  })

  it('长消息截取前30字', () => {
    const messages = [
      { role: 'user' as const, content: '这是一段非常长的消息内容，超过了三十个字的限制，需要被截断处理' },
    ]
    const title = generateSessionTitle(messages)
    expect(title.length).toBeLessThanOrEqual(33) // 30 + '...'
    expect(title.endsWith('...')).toBe(true)
  })

  it('没有用户消息时返回默认标题', () => {
    const messages = [
      { role: 'assistant' as const, content: '你好' },
    ]
    expect(generateSessionTitle(messages)).toBe('新会话')
  })

  it('处理多行消息', () => {
    const messages = [
      { role: 'user' as const, content: '第一行\n第二行\n第三行' },
    ]
    const title = generateSessionTitle(messages)
    expect(title).not.toContain('\n')
  })
})

describe('sanitizeFileName', () => {
  it('移除 Windows 不允许的字符', () => {
    expect(sanitizeFileName('test:file')).toBe('testfile')
    expect(sanitizeFileName('a*b?c"d<e>f|g')).toBe('abcdefg')
    expect(sanitizeFileName('path\\file/name')).toBe('pathfilename')
  })

  it('纯空白返回 untitled', () => {
    expect(sanitizeFileName('   ')).toBe('untitled')
  })

  it('保留正常字符', () => {
    expect(sanitizeFileName('费曼学习法')).toBe('费曼学习法')
    expect(sanitizeFileName('test-file_123')).toBe('test-file_123')
  })
})

describe('serializeSession', () => {
  it('序列化基本会话', () => {
    const session: Session = {
      id: 'sess-1',
      title: '测试会话',
      created: '2024-01-01T00:00:00Z',
      parent_session: null,
      fork_point: null,
      tags: [],
      messages: [
        { role: 'user', content: '你好' },
        { role: 'assistant', content: '你好！有什么可以帮你的？' },
      ],
    }

    const result = serializeSession(session)
    expect(result).toContain('session_id: sess-1')
    expect(result).toContain('title: 测试会话')
    expect(result).toContain('created: 2024-01-01T00:00:00Z')
    expect(result).toContain('## 用户')
    expect(result).toContain('## 知枝')
    expect(result).toContain('你好')
  })

  it('序列化带标签的会话', () => {
    const session: Session = {
      id: 'sess-2',
      title: '标签测试',
      created: '2024-01-01',
      parent_session: null,
      fork_point: null,
      tags: ['学习', '方法'],
      messages: [],
    }
    const result = serializeSession(session)
    expect(result).toContain('tags: [学习, 方法]')
  })

  it('序列化分支会话', () => {
    const session: Session = {
      id: 'branch-1',
      title: '分支会话',
      created: '2024-01-01',
      parent_session: 'sess-1',
      fork_point: 'msg-3',
      tags: [],
      messages: [],
    }
    const result = serializeSession(session)
    expect(result).toContain('parent_session: sess-1')
    expect(result).toContain('fork_point: msg-3')
  })

  it('包含系统消息', () => {
    const session: Session = {
      id: 'sess-3',
      title: '系统消息',
      created: '2024-01-01',
      parent_session: null,
      fork_point: null,
      tags: [],
      messages: [
        { role: 'system', content: '你是一个助手' },
      ],
    }
    const result = serializeSession(session)
    expect(result).toContain('## 系统')
  })

  it('分支会话的 fork_context 持久化到正文开头的区块', () => {
    const session: Session = {
      id: 'branch-2',
      title: '分支会话',
      created: '2024-01-01',
      parent_session: 'sess-1',
      fork_point: '3',
      tags: [],
      messages: [{ role: 'user', content: '分支提问' }],
      fork_context: '（划线内容 · 知枝）\n划线文本',
    }
    const result = serializeSession(session)
    expect(result).toContain('<!-- fork-context -->')
    expect(result).toContain('<!-- /fork-context -->')
    expect(result).toContain('（划线内容 · 知枝）')
    // 区块位于正文开头（frontmatter 之后、消息之前）
    const blockIndex = result.indexOf('<!-- fork-context -->')
    const messageIndex = result.indexOf('## 用户')
    expect(blockIndex).toBeGreaterThan(-1)
    expect(blockIndex).toBeLessThan(messageIndex)
  })

  it('无 fork_context 时不写入区块', () => {
    const session: Session = {
      id: 'sess-4',
      title: '普通会话',
      created: '2024-01-01',
      parent_session: null,
      fork_point: null,
      tags: [],
      messages: [{ role: 'user', content: '你好' }],
    }
    const result = serializeSession(session)
    expect(result).not.toContain('<!-- fork-context -->')
  })

  it('序列化分支引用与划线文本', () => {
    const session: Session = {
      id: 'sess-5',
      title: '引用测试',
      created: '2024-01-01',
      parent_session: null,
      fork_point: null,
      tags: [],
      messages: [{ role: 'assistant', content: '回答内容' }],
    }
    const result = serializeSession(session, [
      { path: 'branch_1', title: '分支追问', messageIndex: 0, kind: 'branch', highlight: '划线内容' },
      { path: 'notes/a.md', title: '笔记A', messageIndex: 0, kind: 'note', highlight: '笔记划线' },
    ])
    expect(result).toContain('> 已生成分支: [[branch_1|分支追问]] 划线「划线内容」')
    expect(result).toContain('> 已生成笔记: [[notes/a.md|笔记A]] 划线「笔记划线」')
  })

  it('旧引用（无划线文本）仍按笔记引用写入', () => {
    const session: Session = {
      id: 'sess-6',
      title: '旧引用',
      created: '2024-01-01',
      parent_session: null,
      fork_point: null,
      tags: [],
      messages: [{ role: 'assistant', content: '回答' }],
    }
    const result = serializeSession(session, [{ path: 'notes/a.md', title: 'A', messageIndex: 0 }])
    expect(result).toContain('> 已生成笔记: [[notes/a.md|A]]')
  })
})

describe('parseSessionMeta 仓库会话列表元数据', () => {
  it('解析 frontmatter 的 id/标题/创建时间', () => {
    const content = '---\nsession_id: sess_1\ntitle: 测试会话\ncreated: 2026-01-02T03:04:05.000Z\n---\n'
    expect(parseSessionMeta(content, '/vault/sessions/sess_1.md')).toEqual({
      id: 'sess_1',
      title: '测试会话',
      created: '2026-01-02T03:04:05.000Z',
      filePath: '/vault/sessions/sess_1.md',
    })
  })

  it('frontmatter 缺失时按文件名兜底 id 与标题', () => {
    const meta = parseSessionMeta('# 无 frontmatter\n正文', '/vault/sessions/sess_9.md')
    expect(meta.id).toBe('sess_9')
    expect(meta.title).toBe('sess_9')
    expect(meta.created).toBe('1970-01-01T00:00:00.000Z')
  })
})

describe('parseSessionMessages 消息解析', () => {
  it('解析带时间戳的消息并保留 timestamp', () => {
    const body = [
      '## 用户 · 2026-01-02T03:04:05.000Z',
      '',
      '第一条问题',
      '',
      '## 知枝 · 2026-01-02T03:04:10.000Z',
      '',
      '这是回答',
    ].join('\n')

    expect(parseSessionMessages(body)).toEqual([
      { role: 'user', content: '第一条问题', timestamp: '2026-01-02T03:04:05.000Z' },
      { role: 'assistant', content: '这是回答', timestamp: '2026-01-02T03:04:10.000Z' },
    ])
  })

  it('存量消息无时间戳时为 undefined，不误匹配正文中的 ## 标题', () => {
    const body = [
      '## 用户',
      '',
      '问题中的 ## 用户 不应作为消息头',
      '',
      '## 知枝',
      '',
      '回答',
    ].join('\n')

    const messages = parseSessionMessages(body)
    expect(messages).toHaveLength(2)
    expect(messages[0].timestamp).toBeUndefined()
    expect(messages[0].content).toBe('问题中的 ## 用户 不应作为消息头')
    expect(messages[1].content).toBe('回答')
  })

  it('跳过已生成笔记/分支引用标记行，不混入消息内容', () => {
    const body = [
      '## 知枝 · 2026-01-02T03:04:10.000Z',
      '',
      '回答内容',
      '> 已生成笔记: [[notes/a.md|笔记A]] 划线「重点」',
      '> 已生成分支: [[branch_1|分支追问]] 划线「追问」',
    ].join('\n')

    const messages = parseSessionMessages(body)
    expect(messages).toHaveLength(1)
    expect(messages[0].content).toBe('回答内容')
  })

  it('分叉点上下文区块不参与消息解析', () => {
    const body = [
      '<!-- fork-context -->',
      '（划线内容 · 知枝）',
      '划线文本',
      '<!-- /fork-context -->',
      '',
      '## 用户 · 2026-01-02T03:04:05.000Z',
      '',
      '问题',
    ].join('\n')

    const messages = parseSessionMessages(body)
    expect(messages).toHaveLength(1)
    expect(messages[0].content).toBe('问题')
  })
})

describe('parseSessionFile 完整会话解析', () => {
  it('解析 frontmatter + 消息为 Session', () => {
    const content = [
      '---',
      'session_id: sess_1',
      'title: 测试会话',
      'created: 2026-01-02T03:04:05.000Z',
      'tags: [学习, 方法]',
      '---',
      '',
      '## 用户 · 2026-01-02T03:04:05.000Z',
      '',
      '问题',
      '',
      '## 知枝 · 2026-01-02T03:04:10.000Z',
      '',
      '回答',
    ].join('\n')

    const session = parseSessionFile(content, '/vault/sessions/sess_1.md')
    expect(session.id).toBe('sess_1')
    expect(session.title).toBe('测试会话')
    expect(session.created).toBe('2026-01-02T03:04:05.000Z')
    expect(session.tags).toEqual(['学习', '方法'])
    expect(session.messages).toHaveLength(2)
    expect(session.messages[0].timestamp).toBe('2026-01-02T03:04:05.000Z')
  })

  it('分支会话保留 parent_session / fork_point / fork_context', () => {
    const content = [
      '---',
      'session_id: branch_1',
      'title: 分支追问',
      'created: 2026-01-02T03:04:05.000Z',
      'parent_session: sess_1',
      'fork_point: 3',
      '---',
      '',
      '<!-- fork-context -->',
      '（划线内容 · 知枝）',
      '划线文本',
      '<!-- /fork-context -->',
      '',
      '## 用户 · 2026-01-02T03:04:05.000Z',
      '',
      '分支问题',
    ].join('\n')

    const session = parseSessionFile(content, '/vault/sessions/branch-branch_1.md')
    expect(session.parent_session).toBe('sess_1')
    expect(session.fork_point).toBe('3')
    expect(session.fork_context).toBe('（划线内容 · 知枝）\n划线文本')
    expect(session.messages).toHaveLength(1)
  })

  it('序列化→解析往返保持消息内容一致', () => {
    const session: Session = {
      id: 'sess-7',
      title: '往返测试',
      created: '2024-01-01T00:00:00Z',
      parent_session: null,
      fork_point: null,
      tags: [],
      messages: [
        { role: 'user', content: '你好', timestamp: '2024-01-01T00:00:00Z' },
        { role: 'assistant', content: '你好！', timestamp: '2024-01-01T00:00:01Z' },
      ],
    }
    const parsed = parseSessionFile(serializeSession(session))
    expect(parsed.messages).toEqual(session.messages)
  })
})