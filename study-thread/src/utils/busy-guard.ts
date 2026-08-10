/**
 * 全局 AI 忙碌遮罩的轻量桥接（零依赖，无 Vue/Pinia）
 *
 * 用途：让 api/provider 层无需依赖 Pinia 即可开关全局忙碌遮罩。
 * - stores/busy.ts 在 useBusyStore 首次实例化时调用 attachBusyController 注册自身；
 * - api/provider-factory 包装 chat 时通过 busyStart/busyStop 自动开关注册的控制器；
 * - 控制器未注册（如单元测试、App 尚未挂载）时 busyStart/busyStop 为安全 no-op，
 *   不影响既有测试与调用链。
 */
export interface BusyController {
  start(message?: string): void
  stop(): void
}

let controller: BusyController | null = null

/** 注册全局忙碌控制器（由 useBusyStore 实例化时调用，重复注册以最后一次为准） */
export function attachBusyController(next: BusyController): void {
  controller = next
}

/** 打开全局忙碌遮罩（控制器未注册时静默忽略） */
export function busyStart(message?: string): void {
  controller?.start(message)
}

/** 关闭全局忙碌遮罩（仅当并发计数归零） */
export function busyStop(): void {
  controller?.stop()
}
