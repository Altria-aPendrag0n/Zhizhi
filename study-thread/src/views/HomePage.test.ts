import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import HomePage from './HomePage.vue'
import { toDateKey, type LearningStats } from '../utils/learning-stats'

const state = vi.hoisted(() => ({
  routerPush: vi.fn(),
  collectLearningStats: vi.fn(),
  createNewThread: vi.fn(),
  syncQueueWithNotes: vi.fn().mockResolvedValue(undefined),
}))

interface HomePageGlobals {
  __homeVaultPath?: { value: string | null }
  __homeNotes?: { value: unknown[] }
}

vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/home' }),
  useRouter: () => ({ push: state.routerPush }),
}))

vi.mock('../stores/vault', () => {
  const path = ref<string | null>(null)
  ;(globalThis as unknown as HomePageGlobals).__homeVaultPath = path
  return { useVaultStore: () => ({ get vaultPath() { return path.value } }) }
})

vi.mock('../stores/notes', () => {
  const notes = ref<unknown[]>([])
  ;(globalThis as unknown as HomePageGlobals).__homeNotes = notes
  return {
    useNoteStore: () => ({
      get notes() { return notes.value },
      loadAllNotes: vi.fn().mockResolvedValue(undefined),
    }),
  }
})

vi.mock('../stores/review', () => ({
  useReviewStore: () => ({
    dueCount: 2,
    syncQueueWithNotes: state.syncQueueWithNotes,
  }),
}))

vi.mock('../utils/learning-stats', async () => {
  const actual = await vi.importActual<typeof import('../utils/learning-stats')>('../utils/learning-stats')
  return { ...actual, collectLearningStats: state.collectLearningStats }
})

const SAMPLE_STATS: LearningStats = {
  // 用运行当天作为日期键，供「今日学习进度」读取
  daily: new Map([[toDateKey(new Date()), { qa: 3, review: 1, note: 2 }]]),
  totalQa: 3,
  totalReview: 1,
  totalNote: 2,
  totalDays: 1,
  streakDays: 1,
}

function mountHome() {
  return mount(HomePage, {
    global: {
      provide: { createNewThread: state.createNewThread },
    },
  })
}

describe('HomePage 主界面', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.collectLearningStats.mockResolvedValue(SAMPLE_STATS)
    const g = globalThis as unknown as HomePageGlobals
    if (g.__homeVaultPath) g.__homeVaultPath.value = null
    if (g.__homeNotes) g.__homeNotes.value = []
  })

  it('未打开 vault 时显示引导而非统计', () => {
    const wrapper = mountHome()
    expect(wrapper.find('.home-page__empty').exists()).toBe(true)
    expect(wrapper.find('.home-stats').exists()).toBe(false)
    expect(state.collectLearningStats).not.toHaveBeenCalled()
  })

  it('打开 vault 后加载并渲染统计卡与格子图', async () => {
    const g = globalThis as unknown as HomePageGlobals
    g.__homeVaultPath!.value = '/vault'

    const wrapper = mountHome()
    await flushPromises()

    expect(state.collectLearningStats).toHaveBeenCalledWith('/vault', expect.any(Array))
    const values = wrapper.findAll('.stat-card__value').map((el) => el.text())
    expect(values).toContain('3') // 累计问答
    expect(values).toContain('1') // 累计复习
    expect(values).toContain('2') // 累计笔记
    // 格子图渲染 53 周 × 7 天
    expect(wrapper.findAll('.cg__cell')).toHaveLength(371)
  })

  it('点击「开始新会话」调用 App 注入的新建会话回调', async () => {
    const g = globalThis as unknown as HomePageGlobals
    g.__homeVaultPath!.value = '/vault'

    const wrapper = mountHome()
    await flushPromises()

    await wrapper.findAll('.quick-btn')[0].trigger('click')
    expect(state.createNewThread).toHaveBeenCalledWith('1')
  })

  it('渲染今日学习进度：今日问答/今日笔记/已复习/待复习', async () => {
    const g = globalThis as unknown as HomePageGlobals
    g.__homeVaultPath!.value = '/vault'

    const wrapper = mountHome()
    await flushPromises()

    // 复习队列加载被触发（供「待复习」计数）
    expect(state.syncQueueWithNotes).toHaveBeenCalledWith('/vault')

    const items = wrapper.findAll('.home-today__item')
    expect(items).toHaveLength(4)
    expect(items[0].text()).toContain('今日问答')
    expect(items[0].text()).toContain('3')
    expect(items[1].text()).toContain('今日笔记')
    expect(items[1].text()).toContain('2')
    expect(items[2].text()).toContain('已复习')
    expect(items[2].text()).toContain('1')
    expect(items[3].text()).toContain('待复习')
    expect(items[3].text()).toContain('2')
  })

  it('统计加载失败时静默显示空态，不阻断页面', async () => {
    const g = globalThis as unknown as HomePageGlobals
    g.__homeVaultPath!.value = '/vault'
    state.collectLearningStats.mockRejectedValue(new Error('vault 读取失败'))

    const wrapper = mountHome()
    await flushPromises()

    expect(wrapper.find('.home-stats').exists()).toBe(true)
    expect(wrapper.text()).toContain('暂无学习记录')
  })
})
