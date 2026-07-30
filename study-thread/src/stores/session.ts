import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Session, Message } from '../types'

export const useSessionStore = defineStore('session', () => {
  const sessions = ref<Session[]>([])
  const currentSessionId = ref<string | null>(null)
  const messages = ref<Message[]>([])
  const isStreaming = ref(false)

  const currentSession = computed(() =>
    sessions.value.find(s => s.id === currentSessionId.value) || null
  )

  function createSession(title: string = '新会话'): string {
    const id = `sess_${Date.now()}`
    const session: Session = {
      id,
      title,
      created: new Date().toISOString(),
      parent_session: null,
      fork_point: null,
      tags: [],
      messages: [],
    }
    sessions.value.push(session)
    currentSessionId.value = id
    messages.value = []
    return id
  }

  function switchSession(id: string) {
    const session = sessions.value.find(s => s.id === id)
    if (session) {
      currentSessionId.value = id
      messages.value = [...session.messages]
    }
  }

  function addMessage(message: Message) {
    messages.value.push(message)
    const session = sessions.value.find(s => s.id === currentSessionId.value)
    if (session) {
      session.messages = [...messages.value]
    }
  }

  function createBranch(parentId: string, forkMessageId: string, title: string): string {
    const branchId = `branch_${Date.now()}`
    const branch: Session = {
      id: branchId,
      title,
      created: new Date().toISOString(),
      parent_session: parentId,
      fork_point: forkMessageId,
      tags: [],
      messages: [],
    }
    sessions.value.push(branch)
    return branchId
  }

  function loadBranchContext(sessionId: string): Message[] {
    const session = sessions.value.find(s => s.id === sessionId)
    return session ? [...session.messages] : []
  }

  return {
    sessions,
    currentSessionId,
    messages,
    isStreaming,
    currentSession,
    createSession,
    switchSession,
    addMessage,
    createBranch,
    loadBranchContext,
  }
})