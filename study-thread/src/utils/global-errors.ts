/**
 * 全局错误收集
 *
 * 捕获 window 'error' 与 'unhandledrejection' 两类未处理异常，写入应用日志系统
 * （utils/logger.ts，localStorage 环形缓冲），供设置页「调试日志」与反馈导出使用。
 *
 * 目的（v0.1 发布准备）：真实用户侧发生运行时错误时，能随反馈日志一并上报，
 * 便于开发者定位问题；同时避免错误发生时界面无提示、错误被静默吞掉。
 *
 * 设计约束：
 * - 捕获逻辑不抛出异常、不影响主流程
 * - 错误对象统一序列化为字符串（兼容非 Error 的 rejection 原因与循环引用）
 */

import { logError } from './logger'

/** 将任意异常值序列化为可读字符串（Error 取 name/message/stack，其余兜底 JSON/字符串化） */
export function serializeUnknown(value: unknown): string {
  if (value instanceof Error) {
    return `${value.name}: ${value.message}${value.stack ? `\n${value.stack}` : ''}`
  }
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    // 循环引用等无法 JSON 序列化的值，退化为 String
    return String(value)
  }
}

/**
 * 安装全局错误捕获（在应用挂载前调用一次）。
 * 返回卸载函数，便于测试与热更新时清理监听。
 */
export function installGlobalErrorCapture(): () => void {
  const onError = (event: ErrorEvent) => {
    const detail = {
      filename: event.filename || '',
      lineno: event.lineno || 0,
      colno: event.colno || 0,
      error: serializeUnknown(event.error),
    }
    logError('global', event.message || '未捕获的脚本错误', detail)
  }

  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    logError('global', '未处理的 Promise 拒绝', { reason: serializeUnknown(event.reason) })
  }

  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onUnhandledRejection)

  return () => {
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onUnhandledRejection)
  }
}
