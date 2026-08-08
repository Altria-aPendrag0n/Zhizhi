/**
 * 学习者画像读写工具（P3 画像驱动复习）
 *
 * 画像持久化于 `<vault>/.study-thread/learner.md`（YAML frontmatter），
 * 由 update-learner skill 生成的 diff 经用户确认后应用（applyProfileDiff）。
 */

import * as yaml from 'js-yaml'
import { readFile, writeFile, createDir } from './vault-fs'
import { parseFrontmatter } from '../parser/frontmatter'
import type { ProfileDiff } from '../api/skills/update-learner'

export interface KnownConcept {
  name: string
  confidence: string
  last_session?: string
}

export interface LearnerProfile {
  known_concepts: KnownConcept[]
  active_topics: string[]
  total_sessions: number
  total_notes: number
  preferred_depth?: string
  preferred_style?: string
}

/** 画像文件路径：<vault>/.study-thread/learner.md */
export function learnerProfilePath(vaultPath: string): string {
  return `${vaultPath}/.study-thread/learner.md`
}

export function emptyLearnerProfile(): LearnerProfile {
  return { known_concepts: [], active_topics: [], total_sessions: 0, total_notes: 0 }
}

function toKnownConcepts(value: unknown): KnownConcept[] {
  if (!Array.isArray(value)) return []
  const concepts: KnownConcept[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object' || typeof (item as Record<string, unknown>).name !== 'string') continue
    const c = item as Record<string, unknown>
    concepts.push({
      name: c.name as string,
      confidence: typeof c.confidence === 'string' ? c.confidence : 'medium',
      last_session: typeof c.last_session === 'string' ? c.last_session : undefined,
    })
  }
  return concepts
}

/** 加载画像；文件缺失或损坏时返回空画像 */
export async function loadLearnerProfile(vaultPath: string): Promise<LearnerProfile> {
  try {
    const raw = await readFile(learnerProfilePath(vaultPath))
    const { meta } = parseFrontmatter(raw)
    return {
      known_concepts: toKnownConcepts(meta.known_concepts),
      active_topics: Array.isArray(meta.active_topics)
        ? meta.active_topics.filter((topic): topic is string => typeof topic === 'string')
        : [],
      total_sessions: typeof meta.total_sessions === 'number' ? meta.total_sessions : 0,
      total_notes: typeof meta.total_notes === 'number' ? meta.total_notes : 0,
      preferred_depth: typeof meta.preferred_depth === 'string' ? meta.preferred_depth : undefined,
      preferred_style: typeof meta.preferred_style === 'string' ? meta.preferred_style : undefined,
    }
  } catch {
    return emptyLearnerProfile()
  }
}

/** 将画像序列化为 Markdown（YAML frontmatter + 空 body），Obsidian 可读 */
export function serializeLearnerProfile(profile: LearnerProfile): string {
  const frontmatter: Record<string, unknown> = {
    known_concepts: profile.known_concepts,
    active_topics: profile.active_topics,
    total_sessions: profile.total_sessions,
    total_notes: profile.total_notes,
  }
  if (profile.preferred_depth) frontmatter.preferred_depth = profile.preferred_depth
  if (profile.preferred_style) frontmatter.preferred_style = profile.preferred_style
  return `---\n${yaml.dump(frontmatter).trimEnd()}\n---\n`
}

/** 保存画像到 vault */
export async function saveLearnerProfile(vaultPath: string, profile: LearnerProfile): Promise<void> {
  await createDir(`${vaultPath}/.study-thread`)
  await writeFile(learnerProfilePath(vaultPath), serializeLearnerProfile(profile))
}

/**
 * 应用画像更新 diff（用户确认后调用）
 *
 * - added_concepts → 新增 known_concepts（confidence + last_session=今日）
 * - updated_concepts → 更新已有概念置信度，不存在则新增
 * - removed_concepts → 移除概念
 * - suggested_topics → 并入 active_topics（去重）
 * - total_sessions 自增；total_notes 由调用方传入（当前笔记总数）
 */
export function applyProfileDiff(profile: LearnerProfile, diff: ProfileDiff, totalNotes: number): LearnerProfile {
  const today = new Date().toISOString().slice(0, 10)
  const concepts = [...profile.known_concepts]

  for (const added of diff.added_concepts) {
    concepts.push({ name: added.name, confidence: added.confidence ?? 'medium', last_session: today })
  }
  for (const updated of diff.updated_concepts) {
    const target = concepts.find((c) => c.name === updated.name)
    if (target) {
      target.confidence = updated.new_confidence ?? target.confidence
      target.last_session = today
    } else {
      concepts.push({ name: updated.name, confidence: updated.new_confidence ?? 'medium', last_session: today })
    }
  }
  for (const removed of diff.removed_concepts) {
    const index = concepts.findIndex((c) => c.name === removed.name)
    if (index >= 0) concepts.splice(index, 1)
  }

  const topics = [...profile.active_topics]
  for (const suggested of diff.suggested_topics) {
    if (!topics.includes(suggested.topic)) topics.push(suggested.topic)
  }

  return {
    ...profile,
    known_concepts: concepts,
    active_topics: topics,
    total_sessions: profile.total_sessions + 1,
    total_notes: totalNotes,
  }
}
