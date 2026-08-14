import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ReviewChatPage from './ReviewChatPage.vue'
import type { Session, Note, ReviewQuestion } from '../types'

const mocks = vi.hoisted(() => ({
  route: { params: { sessionId: 'review_1' } },
  routerPush: vi.fn(),
  getProviderConfig: vi.fn(() => ({ apiKey: 'test-key', model: 'test-model' })),
  vaultPath: '/vault',
  loadNote: vi.fn(),
  applyReview: vi.fn().mockResolvedValue({}),
  loadReviewSession: vi.fn(),
  saveSessionToVault: vi.fn().mockResolvedValue('/vault/sessions/review-review_1.md'),
  readFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
  extractNoteRefsFromSession: vi.fn(() => []),
  reviewFollowupStream: vi.fn(),
  reviewDebateStream: vi.fn(),
  reviewFreeformStream: vi.fn(),
  extractNote: vi.fn(),
  parseMentionedNotes: vi.fn(),
  deleteFile: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('vue-router', () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ push: mocks.routerPush, replace: mocks.routerPush }),
}))

vi.mock('../stores/settings', () => ({
  useSettingsStore: () => ({ getProviderConfig: mocks.getProviderConfig, autoGenerateNoteTitle: true, autoGenerateNoteTags: true }),
}))

vi.mock('../stores/vault', () => ({
  useVaultStore: () => ({ vaultPath: mocks.vaultPath }),
}))

vi.mock('../stores/notes', () => ({
  useNoteStore: () => ({
    loadNote: mocks.loadNote,
    notes: [],
    loadAllNotes: vi.fn(),
    saveNote: vi.fn().mockResolvedValue('/vault/notes/新笔记.md'),
    updateNote: vi.fn(),
  }),
}))

vi.mock('../stores/review', () => ({
  useReviewStore: () => ({ applyReview: mocks.applyReview }),
}))

vi.mock('../utils/review-session', () => ({
  loadReviewSession: mocks.loadReviewSession,
  getReviewSessionFilePath: (vaultPath: string, sessionId: string) => `${vaultPath}/sessions/review-${sessionId}.md`,
}))

vi.mock('../utils/session-serializer', () => ({
  saveSessionToVault: mocks.saveSessionToVault,
}))

vi.mock('../utils/vault-fs', () => ({ readFile: mocks.readFile, deleteFile: mocks.deleteFile }))
vi.mock('../utils/session-linker', () => ({
  extractNoteRefsFromSession: mocks.extractNoteRefsFromSession,
}))
vi.mock('../api/skills/review-quiz', () => ({
  reviewFollowupStream: mocks.reviewFollowupStream,
  reviewDebateStream: mocks.reviewDebateStream,
  reviewFreeformStream: mocks.reviewFreeformStream,
}))
vi.mock('../api/skills/extract-note', () => ({ extractNote: mocks.extractNote }))
vi.mock('../utils/review-gap', () => ({ parseMentionedNotes: mocks.parseMentionedNotes }))
vi.mock('../api/provider-factory', () => ({ createProvider: () => ({}) }))
vi.mock('../composables/useToast', () => ({ useToast: () => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }) }))

const note: Note = {
  path: 'notes/费曼学习法.md',
  title: '费曼学习法',
  type: 'concept',
  tags: [],
  created: '2026-08-01T00:00:00.000Z',
  updated: '2026-08-01T00:00:00.000Z',
  confidence: 0.5,
  review: { next: null, interval: 0, mastery: 0 },
  content: '费曼学习法通过向他人解释来暴露知识缺口。',
}

const clusterNote: Note = {
  path: 'notes/主动回忆.md',
  title: '主动回忆',
  type: 'concept',
  tags: [],
  created: '2026-08-01T00:00:00.000Z',
  updated: '2026-08-01T00:00:00.000Z',
  confidence: 0.5,
  review: { next: null, interval: 0, mastery: 0 },
  content: '主动回忆是一种检索练习，能显著提升记忆保持。',
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'review_1',
    title: '复习：费曼学习法',
    created: '2026-08-10T08:00:00.000Z',
    parent_session: null,
    fork_point: null,
    tags: ['复习'],
    messages: [
      {
        role: 'assistant',
        content: '## 复习目标\n费曼学习法\n\n## 问题\n1. 什么是费曼学习法？\n2. 为什么费曼法能暴露知识缺口？',
      },
    ],
    kind: 'review',
    reviewed_note: 'notes/费曼学习法.md',
    review_questions: [
      { level: 'recognize', type: 'short_answer', question: '什么是费曼学习法？' },
      { level: 'explain', type: 'short_answer', question: '为什么费曼法能暴露知识缺口？' },
    ],
    ...overrides,
  }
}

function createWrapper() {
  return mount(ReviewChatPage, {
    global: {
      stubs: {
        ChatView: { name: 'ChatView', props: ['messages', 'isStreaming', 'streamingText', 'streamingThinking', 'error', 'noteRefs'], template: '<div><div v-for="m in messages" :key="m.content + m.role">{{ m.content }}</div></div>' },
        Composer: { name: 'Composer', props: ['isStreaming', 'disabled', 'placeholder'], template: '<div />' },
        AddToNoteDialog: { name: 'AddToNoteDialog', template: '<div />' },
      },
    },
  })
}

describe('ReviewChatPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.routerPush.mockReset()
    mocks.loadReviewSession.mockResolvedValue(makeSession())
    mocks.loadNote.mockResolvedValue(note)
    mocks.parseMentionedNotes.mockReturnValue([])
    mocks.vaultPath = '/vault'
  })

  it('加载复习会话并展示被复习笔记标题与进度', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    expect(mocks.loadReviewSession).toHaveBeenCalledWith('/vault', 'review_1')
    expect(wrapper.text()).toContain('费曼学习法')
    expect(wrapper.text()).toContain('0 / 2')
    expect(wrapper.findComponent({ name: 'Composer' }).exists()).toBe(true)
  })

  it('无出题结果（原文模式）时显示兜底提示', async () => {
    mocks.loadReviewSession.mockResolvedValue(makeSession({ review_questions: [] }))
    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.text()).toContain('原文复习模式')
  })

  it('会话不存在时提示并返回学习地图', async () => {
    mocks.loadReviewSession.mockResolvedValue(null)
    createWrapper()
    await flushPromises()

    expect(mocks.routerPush).toHaveBeenCalledWith('/hub')
  })

  it('点击结束复习显示自评面板', async () => {
    const wrapper = createWrapper()
    await flushPromises()

    await wrapper.find('.review-chat-page__end').trigger('click')
    expect(wrapper.text()).toContain('这次复习，你记得怎么样？')
    expect(wrapper.findComponent({ name: 'Composer' }).exists()).toBe(false)
  })

  it('评级调用 applyReview 并提示已更新', async () => {
    const wrapper = createWrapper()
    await flushPromises()
    await wrapper.find('.review-chat-page__end').trigger('click')

    await wrapper.find('.review-chat-page__rate--good').trigger('click')
    await flushPromises()

    expect(mocks.applyReview).toHaveBeenCalledWith('notes/费曼学习法.md', 'good')
    expect(wrapper.text()).toContain('已评级')
  })

  it('发送回答时流式反馈并推进问题进度', async () => {
    mocks.reviewFollowupStream.mockReturnValue((async function* () {
      yield { type: 'text', content: '你的回答基本正确' }
    })())

    const wrapper = createWrapper()
    await flushPromises()

    await wrapper.findComponent({ name: 'Composer' }).vm.$emit('send', '通过教别人来检验理解')
    await flushPromises()

    expect(mocks.reviewFollowupStream).toHaveBeenCalledWith(
      { level: 'recognize', type: 'short_answer', question: '什么是费曼学习法？' },
      '通过教别人来检验理解',
      expect.anything(),
      expect.anything(),
      undefined,
    )
    expect(mocks.saveSessionToVault).toHaveBeenCalled()
    expect(wrapper.text()).toContain('1 / 2')
  })

  it('反馈首行带判定时转换为消息流内联徽章（位于该题下、下一道题前）（P5-6）', async () => {
    mocks.reviewFollowupStream.mockReturnValue((async function* () {
      yield { type: 'text', content: '判定：正确\n你的理解很准确。' }
    })())

    const wrapper = createWrapper()
    await flushPromises()

    await wrapper.findComponent({ name: 'Composer' }).vm.$emit('send', '通过教别人来检验理解')
    await flushPromises()

    // 判定转换为内联徽章 HTML 注入反馈消息（消息流中该题下、下一道题前），不再有底部独立徽章
    expect(wrapper.text()).toContain('回答正确')
    expect(wrapper.text()).toContain('由 AI 依据标准答案/笔记原文判断')
    expect(wrapper.find('.review-chat-page__judgment').exists()).toBe(false)
    // 判定行已从正文移除，避免与徽章重复
    expect(wrapper.text()).not.toContain('判定：正确')
  })

  it('反馈无判定行时不显示正误徽章（兼容历史消息）', async () => {
    mocks.reviewFollowupStream.mockReturnValue((async function* () {
      yield { type: 'text', content: '你的回答基本正确。' }
    })())

    const wrapper = createWrapper()
    await flushPromises()

    await wrapper.findComponent({ name: 'Composer' }).vm.$emit('send', '通过教别人来检验理解')
    await flushPromises()

    expect(wrapper.text()).not.toContain('回答正确')
    expect(wrapper.text()).not.toContain('回答错误')
  })

  it('辩论题：多轮对答，未达轮次不推进题号，末轮总结后推进（P5-5）', async () => {
    const debateQ: ReviewQuestion = {
      level: 'explain',
      type: 'debate',
      question: '辩题：死记硬背毫无价值',
      position: '反对该观点',
      maxRounds: 3,
    }
    mocks.loadReviewSession.mockResolvedValue(makeSession({ review_questions: [debateQ] }))
    mocks.reviewDebateStream.mockReturnValue((async function* () {
      yield { type: 'text', content: '反驳你的论点。' }
    })())

    const wrapper = createWrapper()
    await flushPromises()

    // 活跃题为辩论：渲染轮次指示 1/3 与 AI 持方
    expect(wrapper.text()).toContain('1 / 3')
    expect(wrapper.text()).toContain('AI 持方：反对该观点')

    // 轮 1：调用 reviewDebateStream（round=1, maxRounds=3），未达轮次不推进
    await wrapper.findComponent({ name: 'Composer' }).vm.$emit('send', '我的立场一')
    await flushPromises()
    expect(mocks.reviewDebateStream).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'debate' }),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      undefined,
      1,
      3,
    )
    expect(wrapper.text()).toContain('2 / 3')

    // 轮 2：仍不推进
    await wrapper.findComponent({ name: 'Composer' }).vm.$emit('send', '我的立场二')
    await flushPromises()
    expect(mocks.reviewDebateStream).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'debate' }),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      undefined,
      2,
      3,
    )
    expect(wrapper.text()).toContain('3 / 3')

    // 轮 3：末轮 → 总结并推进，无更多问题
    await wrapper.findComponent({ name: 'Composer' }).vm.$emit('send', '我的立场三')
    await flushPromises()
    expect(mocks.reviewDebateStream).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'debate' }),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      undefined,
      3,
      3,
    )
    // 末轮总结后推进题号（questions 只有 1 题 → 进度 1/1），辩论指示消失
    expect(wrapper.text()).toContain('1 / 1')
    // 全部题目答完后，输入框替换为「结束复习 / 继续提问」两按钮
    expect(wrapper.findComponent({ name: 'Composer' }).exists()).toBe(false)
    expect(wrapper.find('.review-chat-page__done').exists()).toBe(true)
    expect(wrapper.text()).toContain('结束复习')
    expect(wrapper.text()).toContain('继续提问')
  })

  it('簇模式：加载 review_cluster 展示簇面板并高亮当前笔记', async () => {
    mocks.loadReviewSession.mockResolvedValue(
      makeSession({ review_cluster: ['notes/费曼学习法.md', 'notes/主动回忆.md'] }),
    )
    mocks.loadNote.mockImplementation((path: string) =>
      Promise.resolve(path === 'notes/主动回忆.md' ? clusterNote : note),
    )
    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.text()).toContain('复习簇 · 2 条关联笔记')
    expect(wrapper.text()).toContain('主动回忆')
    expect(wrapper.find('.review-chat-page__cluster-item--current').text()).toContain('费曼学习法')
  })

  it('簇模式：结束面板逐条评级，每条笔记独立 applyReview', async () => {
    mocks.loadReviewSession.mockResolvedValue(
      makeSession({ review_cluster: ['notes/费曼学习法.md', 'notes/主动回忆.md'] }),
    )
    mocks.loadNote.mockImplementation((path: string) =>
      Promise.resolve(path === 'notes/主动回忆.md' ? clusterNote : note),
    )
    const wrapper = createWrapper()
    await flushPromises()
    await wrapper.find('.review-chat-page__end').trigger('click')

    expect(wrapper.text()).toContain('逐条评级簇内笔记')
    const items = wrapper.findAll('.review-chat-page__rating-item')
    expect(items).toHaveLength(2)

    await items[0].find('.review-chat-page__rate--good').trigger('click')
    await flushPromises()
    expect(mocks.applyReview).toHaveBeenCalledWith('notes/费曼学习法.md', 'good')

    await items[1].find('.review-chat-page__rate--easy').trigger('click')
    await flushPromises()
    expect(mocks.applyReview).toHaveBeenCalledWith('notes/主动回忆.md', 'easy')

    // 簇模式评级后不自动跳转，需点击「完成复习」
    expect(mocks.routerPush).not.toHaveBeenCalledWith('/hub')
    await wrapper.find('.review-chat-page__finish').trigger('click')
    await flushPromises()
    expect(mocks.routerPush).toHaveBeenCalledWith('/hub')
  })

  it('簇模式：AI 反馈后解析缺口笔记，评级面板标记 AI 缺口', async () => {
    mocks.loadReviewSession.mockResolvedValue(
      makeSession({ review_cluster: ['notes/费曼学习法.md', 'notes/主动回忆.md'] }),
    )
    mocks.loadNote.mockImplementation((path: string) =>
      Promise.resolve(path === 'notes/主动回忆.md' ? clusterNote : note),
    )
    mocks.reviewFollowupStream.mockReturnValue((async function* () {
      yield { type: 'text', content: '回答主要涉及 主动回忆，应补充 费曼学习法 的细节。' }
    })())
    mocks.parseMentionedNotes.mockReturnValue(['notes/主动回忆.md'])

    const wrapper = createWrapper()
    await flushPromises()
    await wrapper.findComponent({ name: 'Composer' }).vm.$emit('send', '通过教别人来检验理解')
    await flushPromises()

    expect(mocks.parseMentionedNotes).toHaveBeenCalledWith(
      '回答主要涉及 主动回忆，应补充 费曼学习法 的细节。',
      [note, clusterNote],
    )
    await wrapper.find('.review-chat-page__end').trigger('click')
    const badges = wrapper.findAll('.review-chat-page__gap-badge')
    expect(badges).toHaveLength(1)
    expect(badges[0].text()).toContain('AI 缺口')
  })

  it('单条模式评级完成后标记会话完成并持久化，不删除会话文件（资源库保留供回看）', async () => {
    const wrapper = createWrapper()
    await flushPromises()
    await wrapper.find('.review-chat-page__end').trigger('click')

    await wrapper.find('.review-chat-page__rate--good').trigger('click')
    await flushPromises()

    // 不再删除临时会话文件，而是标记 review_completed 并重新持久化
    expect(mocks.deleteFile).not.toHaveBeenCalled()
    const lastCall = mocks.saveSessionToVault.mock.calls[mocks.saveSessionToVault.mock.calls.length - 1]
    expect(lastCall[1]).toMatchObject({ id: 'review_1', review_completed: true })
  })

  it('簇模式完成复习后标记会话完成并持久化，不删除会话文件', async () => {
    mocks.loadReviewSession.mockResolvedValue(
      makeSession({ review_cluster: ['notes/费曼学习法.md', 'notes/主动回忆.md'] }),
    )
    mocks.loadNote.mockImplementation((path: string) =>
      Promise.resolve(path === 'notes/主动回忆.md' ? clusterNote : note),
    )
    const wrapper = createWrapper()
    await flushPromises()
    await wrapper.find('.review-chat-page__end').trigger('click')

    const items = wrapper.findAll('.review-chat-page__rating-item')
    await items[0].find('.review-chat-page__rate--good').trigger('click')
    await items[1].find('.review-chat-page__rate--easy').trigger('click')
    await flushPromises()

    // 评级完成前不标记完成、不删除
    expect(mocks.deleteFile).not.toHaveBeenCalled()
    await wrapper.find('.review-chat-page__finish').trigger('click')
    await flushPromises()
    // 完成后标记 review_completed 持久化，文件保留
    expect(mocks.deleteFile).not.toHaveBeenCalled()
    const lastCall = mocks.saveSessionToVault.mock.calls[mocks.saveSessionToVault.mock.calls.length - 1]
    expect(lastCall[1]).toMatchObject({ id: 'review_1', review_completed: true })
  })

  it('重新打开会话时按已作答消息数恢复答题进度（复用题目不重复出题）', async () => {
    mocks.loadReviewSession.mockResolvedValue(
      makeSession({
        messages: [
          { role: 'assistant', content: '## 复习目标\n费曼学习法\n\n## 问题\n1. ...\n2. ...' },
          { role: 'user', content: '通过教别人来检验理解' },
          { role: 'assistant', content: '判定：正确\n你的理解很准确。' },
        ],
      }),
    )
    const wrapper = createWrapper()
    await flushPromises()

    // 已作答 1 题 → 进度恢复为 1 / 2，而非从头开始
    expect(wrapper.text()).toContain('1 / 2')
  })

  it('题目直接展示在会话流：题号 + 题型标签 + 题干，答题区保留', async () => {
    mocks.loadReviewSession.mockResolvedValue(
      makeSession({
        review_questions: [
          {
            level: 'recognize',
            type: 'choice',
            question: '费曼法的核心是什么？',
            options: ['向他人解释', '死记硬背'],
            answer: '向他人解释',
          },
          { level: 'explain', type: 'short_answer', question: '为什么费曼法能暴露知识缺口？' },
        ],
      }),
    )
    mocks.reviewFollowupStream.mockReturnValue((async function* () {
      yield { type: 'text', content: '判定：正确\n你的理解很准确。' }
    })())
    const wrapper = createWrapper()
    await flushPromises()

    // 当前第 1 题：明确标注题号与题型，用户知道选项对应哪道题
    expect(wrapper.text()).toContain('第 1 题 / 共 2 题')
    expect(wrapper.text()).toContain('选择题')
    expect(wrapper.text()).toContain('费曼法的核心是什么？')

    // 选择题作答后推进到第 2 题（简答题），题目卡片同步更新
    await wrapper.findComponent({ name: 'ChoiceAnswer' }).vm.$emit('submit', { index: 0, text: '向他人解释' })
    await flushPromises()
    expect(wrapper.text()).toContain('第 2 题 / 共 2 题')
    expect(wrapper.text()).toContain('为什么费曼法能暴露知识缺口？')
  })

  it('所有复习题答完后点击「继续提问」恢复输入框并调用 reviewFreeformStream', async () => {
    mocks.reviewFreeformStream.mockReturnValue((async function* () {
      yield { type: 'text', content: '补充说明' }
    })())
    mocks.loadReviewSession.mockResolvedValue(
      makeSession({
        review_questions: [{ level: 'recognize', type: 'short_answer', question: '什么是费曼学习法？' }],
        messages: [
          { role: 'assistant', content: '## 复习目标' },
          { role: 'user', content: '通过教别人来检验理解' },
          { role: 'assistant', content: '判定：正确' },
        ],
      }),
    )
    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.find('.review-chat-page__done').exists()).toBe(true)
    await wrapper.find('.review-chat-page__done-continue').trigger('click')
    expect(wrapper.findComponent({ name: 'Composer' }).exists()).toBe(true)
    expect(wrapper.find('.review-chat-page__done').exists()).toBe(false)

    await wrapper.findComponent({ name: 'Composer' }).vm.$emit('send', '能再举个例子吗？')
    await flushPromises()

    expect(mocks.reviewFreeformStream).toHaveBeenCalledWith(
      '能再举个例子吗？',
      expect.anything(),
      note,
      expect.anything(),
      undefined,
    )
    expect(mocks.saveSessionToVault).toHaveBeenCalled()
  })

  it('重新打开已归档（review_completed）会话时保留输入框用于继续提问', async () => {
    mocks.loadReviewSession.mockResolvedValue(
      makeSession({
        review_completed: true,
        review_questions: [{ level: 'recognize', type: 'short_answer', question: '什么是费曼学习法？' }],
        messages: [
          { role: 'assistant', content: '## 复习目标' },
          { role: 'user', content: '通过教别人来检验理解' },
          { role: 'assistant', content: '判定：正确' },
        ],
      }),
    )
    const wrapper = createWrapper()
    await flushPromises()

    expect(wrapper.findComponent({ name: 'Composer' }).exists()).toBe(true)
    expect(wrapper.find('.review-chat-page__done').exists()).toBe(false)
  })

  it('所有复习题答完后退出页面时自动归档到已复习会话', async () => {
    mocks.loadReviewSession.mockResolvedValue(
      makeSession({
        review_questions: [{ level: 'recognize', type: 'short_answer', question: '什么是费曼学习法？' }],
        messages: [
          { role: 'assistant', content: '## 复习目标' },
          { role: 'user', content: '通过教别人来检验理解' },
          { role: 'assistant', content: '判定：正确' },
        ],
      }),
    )
    const wrapper = createWrapper()
    await flushPromises()
    expect(wrapper.find('.review-chat-page__done').exists()).toBe(true)

    wrapper.unmount()
    await flushPromises()

    const lastCall = mocks.saveSessionToVault.mock.calls[mocks.saveSessionToVault.mock.calls.length - 1]
    expect(lastCall[1]).toMatchObject({ id: 'review_1', review_completed: true })
  })
})
