/**
 * 画像概念与笔记映射（P3-2）
 *
 * 将学习者画像中的 known_concepts 关联到对应原子笔记，
 * 供 P3-3 复习队列提权与 P3-4 复习难度个性化使用。
 *
 * 匹配策略（宁缺毋滥）：
 * 1. 精确匹配：概念名 == 笔记标题，或概念名命中笔记 tags（忽略大小写）
 * 2. 语义匹配：对概念名用 embedding 检索已索引笔记，相似度 ≥ 阈值才关联
 *
 * 语义检索依赖本地 embedding 引擎；引擎未就绪或无索引时静默降级为仅精确匹配。
 */

import { getEmbeddingEngine } from '../embedding/engine'
import { getNoteIndexer } from '../embedding/indexer'
import { cosineSimilarity } from '../embedding/linker'
import type { LearnerProfile } from './learner-profile'

/** 语义匹配相似度阈值（宁缺毋滥：低于该值不关联） */
export const SEMANTIC_THRESHOLD = 0.5

/** 语义匹配每个概念最多关联的笔记数 */
export const SEMANTIC_TOP_K = 3

/** 映射入参所需的最小笔记结构（Note / NoteMeta 均满足） */
export interface LinkableNote {
  path: string
  title: string
  tags: string[]
}

/** 概念 → 笔记路径列表映射 */
export type ConceptNoteMap = Map<string, string[]>

/**
 * 精确匹配（同步）：概念名 == 笔记标题 或 命中笔记 tags（忽略大小写、去除首尾空白）
 */
export function matchConceptExact(conceptName: string, notes: LinkableNote[]): string[] {
  const name = conceptName.trim()
  if (!name) return []
  const lower = name.toLowerCase()
  return notes
    .filter(
      (note) =>
        note.title.trim().toLowerCase() === lower ||
        note.tags.some((tag) => tag.trim().toLowerCase() === lower),
    )
    .map((note) => note.path)
}

/**
 * 语义匹配（异步）：对概念名嵌入，与已索引笔记向量算余弦相似度，
 * 取 Top-K 且相似度 ≥ threshold 的笔记路径。
 * 引擎未就绪 / 无索引 / 出错时返回 []（纯增量能力，不阻塞）。
 */
export async function matchConceptSemantic(
  conceptName: string,
  notes: LinkableNote[],
  topK = SEMANTIC_TOP_K,
  threshold = SEMANTIC_THRESHOLD,
): Promise<string[]> {
  try {
    const engine = getEmbeddingEngine()
    if (!engine.isReady()) return []
    const indexer = getNoteIndexer()
    const entries = indexer.getAllEntries()
    if (entries.length === 0) return []

    const conceptVector = await engine.embed(conceptName.trim())
    // 只考虑入参 notes 中存在的路径（索引可能包含已删除笔记等陈旧条目）
    const byPath = new Set(notes.map((note) => note.path))

    return entries
      .filter((entry) => byPath.has(entry.path))
      .map((entry) => ({ path: entry.path, similarity: cosineSimilarity(conceptVector, entry.vector) }))
      .filter((hit) => hit.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK)
      .map((hit) => hit.path)
  } catch {
    return []
  }
}

export interface LinkOptions {
  /** 是否启用语义匹配（默认 true） */
  semantic?: boolean
  topK?: number
  threshold?: number
}

/**
 * 画像概念 → 笔记路径映射（主入口）
 *
 * 对每个已知概念：精确匹配 + 语义匹配（合并去重），无命中则不写入映射。
 *
 * @param profile - 学习者画像
 * @param notes - 当前 vault 的全部笔记（标题/标签用于精确匹配，路径用于语义去重）
 */
export async function linkConceptsToNotes(
  profile: LearnerProfile,
  notes: LinkableNote[],
  options: LinkOptions = {},
): Promise<ConceptNoteMap> {
  const { semantic = true, topK = SEMANTIC_TOP_K, threshold = SEMANTIC_THRESHOLD } = options
  const map: ConceptNoteMap = new Map()

  for (const concept of profile.known_concepts) {
    const paths: string[] = [...matchConceptExact(concept.name, notes)]
    if (semantic) {
      for (const hit of await matchConceptSemantic(concept.name, notes, topK, threshold)) {
        if (!paths.includes(hit)) paths.push(hit)
      }
    }
    if (paths.length > 0) map.set(concept.name, paths)
  }

  return map
}

// ---------------------------------------------------------------------------
// 映射结果缓存：画像或笔记变更时调用 invalidateLearnerLinkCache 使缓存失效，
// 下次读取时重新计算（由 notes store 的变更动作触发失效）。
// ---------------------------------------------------------------------------

/**
 * 从画像与概念→笔记映射中提取"画像弱项"笔记路径（P3-3 复习提权信号）：
 * 仅保留关联到 low / medium 置信度概念的笔记（high 置信度概念不视为弱项）。
 */
export function collectWeakNotePaths(profile: LearnerProfile, map: ConceptNoteMap): Set<string> {
  const weak = new Set<string>()
  for (const concept of profile.known_concepts) {
    if (concept.confidence !== 'low' && concept.confidence !== 'medium') continue
    for (const path of map.get(concept.name) ?? []) weak.add(path)
  }
  return weak
}

/** 缓存：vaultPath → ConceptNoteMap */
const linkCache = new Map<string, ConceptNoteMap>()

/** 读取缓存；未命中返回 undefined */
export function getLearnerLinkCache(vaultPath: string): ConceptNoteMap | undefined {
  return linkCache.get(vaultPath)
}

/** 写入缓存 */
export function setLearnerLinkCache(vaultPath: string, map: ConceptNoteMap): void {
  linkCache.set(vaultPath, map)
}

/** 使某 vault 的映射缓存失效（画像或笔记变更后调用） */
export function invalidateLearnerLinkCache(vaultPath: string): void {
  linkCache.delete(vaultPath)
}

/** 清空全部缓存（vault 切换等场景） */
export function clearLearnerLinkCache(): void {
  linkCache.clear()
}
