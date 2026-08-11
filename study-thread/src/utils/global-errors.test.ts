import { beforeEach, describe, expect, it } from 'vitest'
import { installGlobalErrorCapture, serializeUnknown } from './global-errors'
import { clearLogs, getLogs } from './logger'

describe('global-errors 全局错误收集', () => {
  beforeEach(() => {
    clearLogs()
  })

  it('捕获 window error 事件并写入日志（模块 global）', () => {
    const uninstall = installGlobalErrorCapture()
    try {
      const event = new Event('error') as unknown as ErrorEvent
      Object.defineProperties(event, {
        message: { value: '炸了' },
        filename: { value: 'https://app/page.js' },
        lineno: { value: 10 },
        colno: { value: 5 },
        error: { value: new Error('boom') },
      })
      window.dispatchEvent(event)

      const logs = getLogs()
      expect(logs).toHaveLength(1)
      expect(logs[0].level).toBe('error')
      expect(logs[0].module).toBe('global')
      expect(logs[0].message).toBe('炸了')
      const meta = JSON.parse(logs[0].meta ?? '{}') as Record<string, string>
      expect(meta.filename).toBe('https://app/page.js')
      expect(meta.lineno).toBe(10)
      expect(meta.error).toContain('Error: boom')
    } finally {
      uninstall()
    }
  })

  it('捕获 unhandledrejection 并序列化拒绝原因', () => {
    const uninstall = installGlobalErrorCapture()
    try {
      const event = new Event('unhandledrejection') as unknown as PromiseRejectionEvent
      Object.defineProperty(event, 'reason', { value: new Error('promise 炸了') })
      window.dispatchEvent(event)

      const logs = getLogs()
      expect(logs).toHaveLength(1)
      expect(logs[0].module).toBe('global')
      expect(logs[0].message).toBe('未处理的 Promise 拒绝')
      const meta = JSON.parse(logs[0].meta ?? '{}') as Record<string, string>
      expect(meta.reason).toContain('Error: promise 炸了')
    } finally {
      uninstall()
    }
  })

  it('rejection 原因为字符串或循环引用对象时仍能记录', () => {
    const uninstall = installGlobalErrorCapture()
    try {
      const strEvent = new Event('unhandledrejection') as unknown as PromiseRejectionEvent
      Object.defineProperty(strEvent, 'reason', { value: 'plain string reason' })
      window.dispatchEvent(strEvent)

      const circular: Record<string, unknown> = { self: null }
      circular.self = circular
      const objEvent = new Event('unhandledrejection') as unknown as PromiseRejectionEvent
      Object.defineProperty(objEvent, 'reason', { value: circular })
      window.dispatchEvent(objEvent)

      const logs = getLogs()
      expect(logs).toHaveLength(2)
      const meta0 = JSON.parse(logs[0].meta ?? '{}') as Record<string, string>
      const meta1 = JSON.parse(logs[1].meta ?? '{}') as Record<string, string>
      expect(meta0.reason).toBe('plain string reason')
      // 循环引用无法 JSON 序列化，退化为 String 表示
      expect(meta1.reason).toContain('[object Object]')
    } finally {
      uninstall()
    }
  })

  it('serializeUnknown 对 Error / 字符串 / null / undefined 的序列化', () => {
    expect(serializeUnknown(new Error('e'))).toContain('Error: e')
    expect(serializeUnknown('str')).toBe('str')
    expect(serializeUnknown(null)).toBe('null')
    expect(serializeUnknown(undefined)).toBe('undefined')
  })
})
