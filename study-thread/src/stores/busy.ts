import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * 全局 AI 忙碌状态（P5-6）：
 * 除知枝学习会话的流式聊天外，所有"提交给 AI 后等待输出"的操作
 * （复习出题、笔记摘录、连接测试等）都通过 start/stop 打开全屏遮罩，
 * 期间用户无法进行任何操作，避免反复创建或提交。
 *
 * 支持并发计数：嵌套的 start/stop 只有全部配对后才关闭遮罩。
 */
export const useBusyStore = defineStore('busy', () => {
  const active = ref(false)
  const message = ref('AI 正在思考…')
  let counter = 0

  function start(msg?: string) {
    counter++
    if (msg) message.value = msg
    active.value = true
  }

  function stop() {
    counter = Math.max(0, counter - 1)
    if (counter === 0) active.value = false
  }

  return { active, message, start, stop }
})
