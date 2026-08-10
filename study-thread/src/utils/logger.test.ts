import { beforeEach, describe, expect, it } from 'vitest'
import { logInfo, logWarn, logError, getLogs, clearLogs, MAX_LOGS } from './logger'

describe('logger（轻量日志系统）', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('记录 info/warn/error 日志，带时间戳与模块信息', () => {
    logInfo('module-a', '普通消息')
    logError('module-b', '错误消息', { code: 500 })

    const logs = getLogs()
    expect(logs).toHaveLength(2)
    expect(logs[0]).toMatchObject({ level: 'info', module: 'module-a', message: '普通消息' })
    expect(logs[1]).toMatchObject({
      level: 'error',
      module: 'module-b',
      message: '错误消息',
      meta: '{"code":500}',
    })
    // 时间戳为合法 ISO 日期
    expect(new Date(logs[0].at).getTime()).not.toBeNaN()
  })

  it('超过上限时环形截断，只保留最近 MAX_LOGS 条', () => {
    for (let i = 0; i < MAX_LOGS + 20; i++) {
      logInfo('module', `消息 ${i}`)
    }

    const logs = getLogs()
    expect(logs).toHaveLength(MAX_LOGS)
    expect(logs[0].message).toBe('消息 20')
    expect(logs[logs.length - 1].message).toBe(`消息 ${MAX_LOGS + 19}`)
  })

  it('clearLogs 清空全部日志', () => {
    logWarn('module', '待清空')
    clearLogs()
    expect(getLogs()).toEqual([])
  })

  it('日志存储损坏时返回空数组，不影响后续写入', () => {
    localStorage.setItem('study-thread-logs', 'not-valid-json')
    expect(getLogs()).toEqual([])
    logInfo('module', '恢复写入')
    expect(getLogs()).toHaveLength(1)
  })
})
