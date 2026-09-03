import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { PlanDoc, PlanStatus } from '../types'
import { listDir, readFile, writeFile, createDir } from '../utils/vault-fs'
import { parsePlanFile, serializePlanFile, computeTodayTasks } from '../utils/plan-parser'
import { sanitizeFileName } from '../utils/session-serializer'

/**
 * 学习计划 store（学习计划 Agent，见 docs/todo/学习计划Agent开发方案.md）
 *
 * 仓库即真相：plans/*.md 的 frontmatter 是权威数据，本 store 扫描目录加载、
 * 变更后写回文件，内存状态随写盘结果回滚，保证与 vault 一致。
 * 多计划完全并行、互不感知：今日任务按计划分组纯展示，不做容量调度。
 */
export const usePlanStore = defineStore('plan', () => {
  const plans = ref<PlanDoc[]>([])
  const currentVaultPath = ref<string | null>(null)

  /** 活跃计划的今日任务分组（无待办计划的分组不出现） */
  const todayGroups = computed(() =>
    plans.value
      .filter((plan) => plan.status === 'active')
      .map((plan) => ({ plan, tasks: computeTodayTasks(plan) }))
      .filter((group) => group.tasks.length > 0),
  )

  /** 今日待办总数（学习地图 / 首页徽标） */
  const todayCount = computed(() => todayGroups.value.reduce((sum, group) => sum + group.tasks.length, 0))

  function findPlan(planId: string): PlanDoc | null {
    return plans.value.find((plan) => plan.plan === planId) ?? null
  }

  /**
   * 对单个计划做变更并写盘；失败时按写盘前快照回滚内存，返回 false。
   * snapshot 以序列化文本保存（而非对象引用），避免 mutate 直接改动快照。
   */
  async function mutatePlan(planId: string, mutate: (doc: PlanDoc) => void): Promise<boolean> {
    const plan = findPlan(planId)
    if (!plan) return false
    const snapshot = serializePlanFile(plan)
    mutate(plan)
    try {
      await writeFile(plan.path, serializePlanFile(plan))
      return true
    } catch (error) {
      console.error('计划写盘失败:', error)
      Object.assign(plan, parsePlanFile(snapshot, plan.path))
      return false
    }
  }

  /**
   * 将 AI 生成并确认的计划落盘到 `plans/<plan-id>.md`（同名覆盖，用于整体重生成），
   * 并插入内存列表（按 created 倒序）。
   * @returns 计划文件路径
   */
  async function createPlan(vaultPath: string, doc: PlanDoc): Promise<string> {
    await createDir(`${vaultPath}/plans`)
    const filePath = `${vaultPath}/plans/${sanitizeFileName(doc.plan)}.md`
    const saved: PlanDoc = { ...doc, path: filePath }
    await writeFile(filePath, serializePlanFile(saved))
    currentVaultPath.value = vaultPath
    plans.value = [saved, ...plans.value.filter((plan) => plan.path !== filePath)].sort((a, b) =>
      b.created.localeCompare(a.created),
    )
    return filePath
  }

  /** 扫描 plans/ 目录加载全部计划；目录缺失置空，单文件损坏跳过 */
  async function loadPlans(vaultPath: string): Promise<void> {
    currentVaultPath.value = vaultPath
    try {
      const entries = await listDir(`${vaultPath}/plans`)
      const loaded: PlanDoc[] = []
      for (const entry of entries) {
        if (entry.is_dir || !entry.name.toLowerCase().endsWith('.md')) continue
        try {
          loaded.push(parsePlanFile(await readFile(entry.path), entry.path))
        } catch {
          // 单个计划文件损坏跳过，不影响其余计划
        }
      }
      loaded.sort((a, b) => b.created.localeCompare(a.created))
      plans.value = loaded
    } catch {
      plans.value = []
    }
  }

  /** 勾选/取消任务完成（done_at 随勾选写当前时间） */
  async function completeTask(planId: string, taskId: string, done = true): Promise<boolean> {
    if (!findPlan(planId)?.tasks.some((item) => item.id === taskId)) return false
    return mutatePlan(planId, (doc) => {
      const task = doc.tasks.find((item) => item.id === taskId)!
      task.done = done
      task.done_at = done ? new Date().toISOString() : null
    })
  }

  /** 「开始学习」后回填任务关联的学习会话路径（去重，重复关联视为成功） */
  async function associateSession(planId: string, taskId: string, sessionPath: string): Promise<boolean> {
    const plan = findPlan(planId)
    const task = plan?.tasks.find((item) => item.id === taskId)
    if (!plan || !task) return false
    if (task.sessions.includes(sessionPath)) return true
    return mutatePlan(planId, (doc) => {
      const target = doc.tasks.find((item) => item.id === taskId)!
      target.sessions = [...target.sessions, sessionPath]
    })
  }

  /** 计划状态切换（暂停/归档/恢复）；已是目标状态时直接视为成功 */
  async function setPlanStatus(planId: string, status: PlanStatus): Promise<boolean> {
    const plan = findPlan(planId)
    if (!plan) return false
    if (plan.status === status) return true
    return mutatePlan(planId, (doc) => {
      doc.status = status
    })
  }

  return {
    plans,
    currentVaultPath,
    todayGroups,
    todayCount,
    createPlan,
    loadPlans,
    completeTask,
    associateSession,
    setPlanStatus,
  }
})
