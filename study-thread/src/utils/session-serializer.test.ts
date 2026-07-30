import { describe, it, expect } from 'vitest'
import {
  generateSessionTitle,
  sanitizeFileName,
  serializeSession,
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
})