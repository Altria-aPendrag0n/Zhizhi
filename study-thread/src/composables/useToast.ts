import { ref } from 'vue'

interface Toast {
  id: string
  type: 'success' | 'error' | 'info'
  message: string
}

const toasts = ref<Toast[]>([])
let _idCounter = 0

function addToast(type: Toast['type'], message: string, duration = 4000) {
  const id = `toast-${++_idCounter}`
  toasts.value.push({ id, type, message })
  if (duration > 0) {
    setTimeout(() => removeToast(id), duration)
  }
}

function removeToast(id: string) {
  const idx = toasts.value.findIndex((t) => t.id === id)
  if (idx >= 0) {
    toasts.value.splice(idx, 1)
  }
}

/** 全局 Toast 工具 */
export function useToast() {
  return {
    toasts,
    success: (msg: string) => addToast('success', msg),
    error: (msg: string) => addToast('error', msg, 6000),
    info: (msg: string) => addToast('info', msg),
    removeToast,
  }
}