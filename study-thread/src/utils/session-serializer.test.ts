import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  generateSessionTitle,
  sanitizeFileName,
  slugifyTitle,
  buildSessionFileName,
  sessionIdFromFileName,
  sessionIdFromReference,
  resolveSessionFile,
  serializeSession,
  parseSessionMeta,
  parseSessionMessages,
  parseSessionFile,
} from './session-serializer'
import type { Session } from '../types'

const { listDirMock } = vi.hoisted(() => ({ listDirMock: vi.fn() }))
vi.mock('./vault-fs', () => ({ listDir: listDirMock }))

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

  it('序列化出现序号〔N〕（重复文本精确定位），第 1 处不写', () => {
    const session: Session = {
      id: 'sess-occ',
      title: '重复文本',
      created: '2024-01-01',
      parent_session: null,
      fork_point: null,
      tags: [],
      messages: [{ role: 'assistant', content: '回答内容' }],
    }
    const withOcc = serializeSession(session, [
      { path: 'notes/a.md', title: '笔记A', messageIndex: 0, kind: 'note', highlight: 'E = mc²', occurrence: 2 },
    ])
    expect(withOcc).toContain('> 已生成笔记: [[notes/a.md|笔记A]] 划线「E = mc²」〔2〕')
    const firstOcc = serializeSession(session, [
      { path: 'notes/a.md', title: '笔记A', messageIndex: 0, kind: 'note', highlight: 'E = mc²', occurrence: 1 },
    ])
    expect(firstOcc).toContain('> 已生成笔记: [[notes/a.md|笔记A]] 划线「E = mc²」')
    expect(firstOcc).not.toContain('〔')
  })

  it('序列化 AI 思考过程到消息正文的标记区块', () => {
    const session: Session = {
      id: 'sess-think',
      title: '思考测试',
      created: '2024-01-01',
      parent_session: null,
      fork_point: null,
      tags: [],
      messages: [
        { role: 'user', content: '问题' },
        { role: 'assistant', content: '回答', thinking: '我先想想\n再回答' },
      ],
    }
    const result = serializeSession(session)
    expect(result).toContain('<!-- thinking -->')
    expect(result).toContain('我先想想\n再回答')
    expect(result).toContain('<!-- /thinking -->')
    // thinking 区块位于消息正文（回答内容）之前
    const thinkIndex = result.indexOf('<!-- thinking -->')
    const contentIndex = result.indexOf('回答')
    expect(thinkIndex).toBeGreaterThan(-1)
    expect(thinkIndex).toBeLessThan(contentIndex)
  })

  it('无 thinking 的助手消息不写入标记区块', () => {
    const session: Session = {
      id: 'sess-no-think',
      title: '无思考',
      created: '2024-01-01',
      parent_session: null,
      fork_point: null,
      tags: [],
      messages: [{ role: 'assistant', content: '直接回答' }],
    }
    expect(serializeSession(session)).not.toContain('<!-- thinking -->')
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

  it('解析 AI 思考过程区块并还原转义（不混入消息正文）', () => {
    const body = [
      '## 用户 · 2026-01-02T03:04:05.000Z',
      '',
      '问题',
      '',
      '## 知枝 · 2026-01-02T03:04:10.000Z',
      '',
      '<!-- thinking -->',
      '思考步骤一',
      '包含 --> 的转义内容',
      '<!-- /thinking -->',
      '',
      '最终回答',
    ].join('\n')

    const messages = parseSessionMessages(body)
    expect(messages).toHaveLength(2)
    expect(messages[1].thinking).toBe('思考步骤一\n包含 --> 的转义内容')
    expect(messages[1].content).toBe('最终回答')
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

  it('序列化→解析往返保持消息内容、时间戳与思考过程一致', () => {
    const session: Session = {
      id: 'sess-7',
      title: '往返测试',
      created: '2024-01-01T00:00:00Z',
      parent_session: null,
      fork_point: null,
      tags: [],
      messages: [
        { role: 'user', content: '你好', timestamp: '2024-01-01T00:00:00Z' },
        { role: 'assistant', content: '你好！', timestamp: '2024-01-01T00:00:01Z', thinking: '思考：--> 内容' },
      ],
    }
    const parsed = parseSessionFile(serializeSession(session))
    expect(parsed.messages).toEqual(session.messages)
  })
})

describe('slugifyTitle 标题转文件名 slug', () => {
  it('中文标题原样保留', () => {
    expect(slugifyTitle('费曼学习法')).toBe('费曼学习法')
  })

  it('空白压缩为连字符', () => {
    expect(slugifyTitle('Hello World 测试')).toBe('Hello-World-测试')
  })

  it('移除链接敏感字符', () => {
    expect(slugifyTitle('a#b[c](d){e}')).toBe('abcde')
  })

  it('连续/首尾连字符归一化并修剪', () => {
    expect(slugifyTitle('-标题-')).toBe('标题')
    expect(slugifyTitle('多----连字符')).toBe('多-连字符')
  })

  it('超过 40 字截断', () => {
    expect(slugifyTitle('一'.repeat(50))).toHaveLength(40)
  })

  it('空标题或被过滤成 untitled 时返回空串', () => {
    expect(slugifyTitle('')).toBe('')
    expect(slugifyTitle('   ')).toBe('')
    expect(slugifyTitle('###')).toBe('')
  })
})

describe('buildSessionFileName 会话文件名生成', () => {
  it('带标题时生成 id-slug 命名', () => {
    expect(buildSessionFileName('sess_123', '费曼学习法')).toBe('sess_123-费曼学习法.md')
  })

  it('无标题时退化为纯 id 命名', () => {
    expect(buildSessionFileName('sess_123')).toBe('sess_123.md')
    expect(buildSessionFileName('sess_123', '   ')).toBe('sess_123.md')
  })

  it('分支/复习 id 不再加双前缀', () => {
    expect(buildSessionFileName('branch_1', '分支追问')).toBe('branch_1-分支追问.md')
    expect(buildSessionFileName('review_1', '复习')).toBe('review_1-复习.md')
  })
})

describe('sessionIdFromFileName 从文件名解析 id', () => {
  it('纯 id 命名原样返回', () => {
    expect(sessionIdFromFileName('/vault/sessions/sess_1.md')).toBe('sess_1')
  })

  it('新命名剥离 slug 后缀', () => {
    expect(sessionIdFromFileName('/vault/sessions/sess_1-费曼学习法.md')).toBe('sess_1')
    expect(sessionIdFromFileName('/vault/sessions/branch_123_0-分支追问.md')).toBe('branch_123_0')
  })

  it('兼容旧 branch-/review- 前缀', () => {
    expect(sessionIdFromFileName('/vault/sessions/branch-branch_1.md')).toBe('branch_1')
    expect(sessionIdFromFileName('/vault/sessions/review-review_1.md')).toBe('review_1')
  })
})

describe('sessionIdFromReference 引用规范化', () => {
  it('纯 id 直接返回', () => {
    expect(sessionIdFromReference('sess_1')).toBe('sess_1')
  })

  it('路径提取文件名 id（新旧命名均兼容）', () => {
    expect(sessionIdFromReference('/vault/sessions/sess_1-费曼学习法.md')).toBe('sess_1')
    expect(sessionIdFromReference('/vault/sessions/branch-branch_1.md')).toBe('branch_1')
  })

  it('空引用返回空串', () => {
    expect(sessionIdFromReference('')).toBe('')
  })
})

describe('resolveSessionFile 按 id 定位会话文件', () => {
  beforeEach(() => {
    listDirMock.mockReset()
  })

  it('精确匹配纯 id 命名', async () => {
    listDirMock.mockResolvedValue([
      { name: 'sess_1.md', path: '/vault/sessions/sess_1.md', is_dir: false },
    ])
    await expect(resolveSessionFile('/vault', 'sess_1')).resolves.toBe('/vault/sessions/sess_1.md')
  })

  it('按 id- 前缀匹配 slug 命名', async () => {
    listDirMock.mockResolvedValue([
      { name: 'sess_1-费曼学习法.md', path: '/vault/sessions/sess_1-费曼学习法.md', is_dir: false },
    ])
    await expect(resolveSessionFile('/vault', 'sess_1')).resolves.toBe('/vault/sessions/sess_1-费曼学习法.md')
  })

  it('兼容旧 branch-/review- 前缀', async () => {
    listDirMock.mockResolvedValue([
      { name: 'branch-branch_1.md', path: '/vault/sessions/branch-branch_1.md', is_dir: false },
      { name: 'review-review_1.md', path: '/vault/sessions/review-review_1.md', is_dir: false },
    ])
    await expect(resolveSessionFile('/vault', 'branch_1')).resolves.toBe('/vault/sessions/branch-branch_1.md')
    await expect(resolveSessionFile('/vault', 'review_1')).resolves.toBe('/vault/sessions/review-review_1.md')
  })

  it('忽略目录与非 md 文件', async () => {
    listDirMock.mockResolvedValue([
      { name: 'sess_1', path: '/vault/sessions/sess_1', is_dir: true },
      { name: 'sess_1.txt', path: '/vault/sessions/sess_1.txt', is_dir: false },
      { name: 'sess_1.md', path: '/vault/sessions/sess_1.md', is_dir: false },
    ])
    await expect(resolveSessionFile('/vault', 'sess_1')).resolves.toBe('/vault/sessions/sess_1.md')
  })

  it('找不到或目录不可读时返回 null', async () => {
    listDirMock.mockResolvedValue([])
    await expect(resolveSessionFile('/vault', 'missing_1')).resolves.toBeNull()

    listDirMock.mockRejectedValue(new Error('目录不存在'))
    await expect(resolveSessionFile('/vault', 'sess_1')).resolves.toBeNull()
  })
})

describe('会话 kind（计划会话）序列化与解析', () => {
  it('kind: plan 序列化写入 frontmatter 并可解析还原', () => {
    const session: Session = {
      id: 'plan_1',
      title: '制定 Rust 学习计划',
      created: '2026-09-03T00:00:00.000Z',
      parent_session: null,
      fork_point: null,
      tags: [],
      messages: [{ role: 'user', content: '我想 30 天入门 Rust', timestamp: '2026-09-03T00:00:01.000Z' }],
      kind: 'plan',
    }
    const raw = serializeSession(session)
    expect(raw).toContain('kind: plan')
    const parsed = parseSessionFile(raw)
    expect(parsed.kind).toBe('plan')
    expect(parsed.messages).toEqual(session.messages)
  })

  it('旧文件无 kind 字段时解析为 undefined（学习会话），review 会话不受影响', () => {
    const legacy = [
      '---',
      'session_id: sess_1',
      'title: 旧会话',
      'created: 2026-01-01T00:00:00.000Z',
      '---',
      '',
      '## 用户',
      '',
      '你好',
    ].join('\n')
    expect(parseSessionFile(legacy).kind).toBeUndefined()
    expect(parseSessionMeta(legacy, '/vault/sessions/sess_1.md').kind).toBeUndefined()

    const review = [
      '---',
      'session_id: review_1',
      'title: 复习',
      'created: 2026-01-01T00:00:00.000Z',
      'kind: review',
      '---',
      '',
    ].join('\n')
    expect(parseSessionFile(review).kind).toBe('review')
    expect(parseSessionMeta(review, '/vault/sessions/review_1.md').kind).toBe('review')
  })

  it('parseSessionMeta 提取 kind: plan（侧边栏分组用）', () => {
    const content = [
      '---',
      'session_id: plan_1',
      'title: 计划会话',
      'created: 2026-09-03T00:00:00.000Z',
      'kind: plan',
      '---',
      '',
    ].join('\n')
    expect(parseSessionMeta(content, '/vault/sessions/plan_1.md').kind).toBe('plan')
  })

  it('kind 值非法时视为学习会话（undefined）', () => {
    const content = [
      '---',
      'session_id: sess_2',
      'title: x',
      'created: 2026-09-03T00:00:00.000Z',
      'kind: weird',
      '---',
      '',
    ].join('\n')
    expect(parseSessionFile(content).kind).toBeUndefined()
    expect(parseSessionMeta(content, '/vault/sessions/sess_2.md').kind).toBeUndefined()
  })
})