/**
 * 全局聊天运行器（后台回答）
 *
 * 把「正在进行的 AI 回答」从聊天页组件局部状态提升为全局 job（按会话 id 索引）。
 * 这样切换会话（组件因路由 key 卸载）时回答照常进行，切回时从 job 读取进行中/已完成的内容，
 * 回答完成后再落盘到会话文件（仓库即真相）。
 *
 * 主会话与分支会话共用：threadId 传会话/分支 id，调用方通过 run 回调提供各自的流来源
 * （chatWithTools / branchFollowupStream）。
 */

import { defineStore } from 'pinia'
import { reactive } from 'vue'
import type { Message } from '../types'
import type { StreamChunk } from '../api/llm-provider'
import type { NoteReference } from '../utils/session-linker'

/** 回答结束后回调信息（消息已最终化，供落盘/学习者画像/路由跳转等） */
export interface FinalizeInfo {
  threadId: string
  messages: Message[]
  noteRefs: NoteReference[]
  /** 是否被用户中止（已流式的内容仍保留） */
  aborted: boolean
  error: string | null
}

export interface StartChatInput {
  threadId: string
  /** 初始消息（含刚追加的 user 消息与末尾空 assistant 占位） */
  messages: Message[]
  noteRefs: NoteReference[]
  /** 回答完成/中止/出错后统一回调 */
  onFinalize: (info: FinalizeInfo) => Promise<void> | void
  /** 执行流式回答：调用方消费自己的流，通过 emit 把 chunk 交给 runner 更新状态 */
  run: (signal: AbortSignal, emit: (chunk: StreamChunk) => void) => Promise<void>
}

/** 组件可读的 job 状态（响应式） */
export interface ChatJob {
  threadId: string
  messages: Message[]
  noteRefs: NoteReference[]
  isStreaming: boolean
  streamingText: string
  streamingThinking: string
  toolStatus: string
  error: string | null
}

interface ChatJobInternal extends ChatJob {
  /** 末尾的空 assistant 占位（回答完成后填充内容） */
  aiMessage: Message | null
  controller: AbortController | null
}

export const useChatRunner = defineStore('chat-runner', () => {
  const jobs = reactive(new Map<string, ChatJobInternal>())

  /** 获取会话的活跃 job（进行中或已完成保留），无则 null */
  function getJob(threadId: string): ChatJob | null {
    return jobs.get(threadId) ?? null
  }

  function hasJob(threadId: string): boolean {
    return jobs.has(threadId)
  }

  /**
   * 找回最近的自动新建会话 job（id 以 new_ 开头，Map 迭代序 = 创建序）。
   *
   * 空白聊天页发起提问时 job 挂在 new_* 临时 id 下，切走页面组件卸载后
   * 「threadId → job」的桥接丢失；重新进入聊天页时用它恢复桥接，
   * 保证后台回答切走再切回仍可见（v0.3.1 后台化修复）。
   */
  function findLatestAutoJob(): ChatJob | null {
    let latest: ChatJobInternal | null = null
    for (const [key, job] of jobs) {
      if (key.startsWith('new_')) latest = job
    }
    return latest
  }

  /** 中止会话的回答（已流式的内容保留并落盘） */
  function abort(threadId: string): void {
    jobs.get(threadId)?.controller?.abort()
  }

  /** 清理已完成的 job（组件卸载时调用；进行中的 job 不受影响，保证后台回答继续） */
  function cleanupIdleJob(threadId: string): void {
    const job = jobs.get(threadId)
    if (job && !job.isStreaming) jobs.delete(threadId)
  }

  /**
   * 启动后台回答。同会话已有进行中 job 时先中止旧 job（避免并发覆盖）。
   * 回答完成/出错后 job 保留在 map（组件可继续读取内容与错误），由 cleanupIdleJob 在组件卸载时清理。
   */
  function startChat(input: StartChatInput): void {
    const existing = jobs.get(input.threadId)
    if (existing?.isStreaming) existing.controller?.abort()

    const job = reactive<ChatJobInternal>({
      threadId: input.threadId,
      messages: [...input.messages],
      noteRefs: [...input.noteRefs],
      aiMessage: input.messages[input.messages.length - 1] ?? null,
      isStreaming: true,
      streamingText: '',
      streamingThinking: '',
      toolStatus: '',
      error: null,
      controller: new AbortController(),
    })
    jobs.set(input.threadId, job)
    void runJob(job, input)
  }

  async function runJob(job: ChatJobInternal, input: StartChatInput): Promise<void> {
    const signal = job.controller!.signal
    let aborted = false
    try {
      await input.run(signal, (chunk) => applyChunk(job, chunk))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (signal.aborted || msg.includes('abort') || msg.includes('AbortError')) {
        aborted = true
      } else {
        job.error = `请求失败: ${msg}`
      }
    }
    await finalize(job, input, aborted)
  }

  function applyChunk(job: ChatJobInternal, chunk: StreamChunk): void {
    switch (chunk.type) {
      case 'text':
        job.streamingText += chunk.content
        break
      case 'thinking':
        job.streamingThinking += chunk.content
        break
      case 'tool_call':
        job.toolStatus = '正在查阅参考资料…'
        break
      case 'tool_result':
        job.toolStatus = '正在整理答案…'
        break
      case 'error':
        job.error = chunk.content
        break
    }
  }

  /** 最终化消息并回调调用方；job 保留在 map 中供组件读取 */
  async function finalize(job: ChatJobInternal, input: StartChatInput, aborted: boolean): Promise<void> {
    if (job.error) {
      // 出错：丢弃占位消息（保留错误信息供组件显示）
      if (job.aiMessage && job.messages[job.messages.length - 1] === job.aiMessage) {
        job.messages.pop()
      }
      job.streamingText = ''
      job.streamingThinking = ''
    } else if (job.streamingText) {
      // 正常/中止：把已流式内容写入占位消息（中止保留半截回答）
      if (job.aiMessage) {
        job.aiMessage.content = job.streamingText
        job.aiMessage.thinking = job.streamingThinking || undefined
      }
    } else if (job.aiMessage && job.messages[job.messages.length - 1] === job.aiMessage) {
      // 空响应：移除占位
      job.messages.pop()
    }

    job.isStreaming = false
    job.streamingText = ''
    job.streamingThinking = ''
    job.toolStatus = ''
    job.controller = null

    try {
      await input.onFinalize({
        threadId: job.threadId,
        messages: job.messages,
        noteRefs: job.noteRefs,
        aborted,
        error: job.error,
      })
    } catch {
      // 落盘等回调失败不阻断：job 已保留，组件可见错误状态
    }
  }

  return { jobs, getJob, hasJob, findLatestAutoJob, abort, cleanupIdleJob, startChat }
})
