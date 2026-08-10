import { describe, it, expect, vi } from 'vitest'
import { attachBusyController, busyStart, busyStop } from './busy-guard'

describe('busy-guard（全局忙碌遮罩桥接）', () => {
  it('未注册控制器时 busyStart/busyStop 为安全 no-op，不抛错', () => {
    expect(() => busyStart('AI 测试中…')).not.toThrow()
    expect(() => busyStop()).not.toThrow()
  })

  it('注册控制器后 busyStart/busyStop 转发到控制器', () => {
    const start = vi.fn()
    const stop = vi.fn()
    attachBusyController({ start, stop })

    busyStart('AI 测试中…')
    expect(start).toHaveBeenCalledWith('AI 测试中…')
    expect(stop).not.toHaveBeenCalled()

    busyStop()
    expect(stop).toHaveBeenCalledTimes(1)
  })

  it('重复注册时以最后一次控制器为准', () => {
    const first = vi.fn()
    const second = vi.fn()
    attachBusyController({ start: first, stop: vi.fn() })
    attachBusyController({ start: second, stop: vi.fn() })

    busyStart()
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })
})
