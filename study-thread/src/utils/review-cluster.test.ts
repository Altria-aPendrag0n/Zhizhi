import { describe, expect, it } from 'vitest'
import type { Note } from '../types'
import { buildReviewCluster, collectOneHopNeighbors, linkStrength, MAX_CLUSTER_SIZE } from './review-cluster'

function note(path: string, title: string, content = '', updated = '2026-08-01T00:00:00.000Z', tags: string[] = []): Note {
  return {
    path,
    title,
    type: 'concept',
    tags,
    created: '2026-08-01T00:00:00.000Z',
    updated,
    confidence: 0.5,
    review: { next: null, interval: 0, mastery: 0 },
    content,
  }
}

const center = note('/vault/notes/费曼学习法.md', '费曼学习法', '核心是[[知识缺口]]，与[[主动回忆]]相关，配合[[间隔复习]]。')
const outNeighbor = note('/vault/notes/知识缺口.md', '知识缺口', '', '2026-08-02T00:00:00.000Z')
const outNeighbor2 = note('/vault/notes/主动回忆.md', '主动回忆', '', '2026-08-03T00:00:00.000Z')
// 反链：引用中心笔记
const inNeighbor = note('/vault/notes/学习策略.md', '学习策略', '推荐使用[[费曼学习法]]进行自测。')
// 双向：同时引用中心、又被中心引用
const bothNeighbor = note('/vault/notes/间隔复习.md', '间隔复习', '配合[[费曼学习法]]使用。')
// 无关笔记
const unrelated = note('/vault/notes/咖啡.md', '咖啡')

describe('collectOneHopNeighbors（1 度邻居解析）', () => {
  it('正向链接：中心正文 wikilink 目标被纳入', () => {
    const neighbors = collectOneHopNeighbors(center, [outNeighbor, unrelated])
    expect(neighbors.map((n) => n.title)).toEqual(['知识缺口'])
  })

  it('反向链接：引用中心的笔记被纳入', () => {
    const neighbors = collectOneHopNeighbors(center, [inNeighbor, unrelated])
    expect(neighbors.map((n) => n.title)).toEqual(['学习策略'])
  })

  it('双向链接优先于单向，同强度按更新时间较新优先', () => {
    const neighbors = collectOneHopNeighbors(center, [bothNeighbor, inNeighbor, outNeighbor, outNeighbor2, unrelated])
    expect(neighbors.map((n) => n.title)).toEqual(['间隔复习', '主动回忆', '知识缺口', '学习策略'])
  })

  it('无关笔记不纳入', () => {
    const neighbors = collectOneHopNeighbors(center, [unrelated])
    expect(neighbors).toEqual([])
  })

  it('链接强度：双向 2 / 单向 1 / 无关 0', () => {
    const outgoing = new Set(['/vault/notes/知识缺口.md'])
    const incoming = new Set(['/vault/notes/学习策略.md'])
    expect(linkStrength(bothNeighbor, outgoing, incoming)).toBe(0)
    expect(linkStrength(outNeighbor, outgoing, incoming)).toBe(1)
    expect(linkStrength(inNeighbor, outgoing, incoming)).toBe(1)
  })
})

describe('buildReviewCluster（簇构成）', () => {
  const all = [center, bothNeighbor, inNeighbor, outNeighbor, outNeighbor2, unrelated]

  it('返回中心笔记 + 邻居，中心始终在首位', () => {
    const cluster = buildReviewCluster(center.path, all)
    expect(cluster[0].path).toBe(center.path)
    expect(cluster.length).toBeGreaterThan(1)
  })

  it('按上限截断（默认 MAX_CLUSTER_SIZE）', () => {
    const cluster = buildReviewCluster(center.path, all)
    expect(cluster.length).toBeLessThanOrEqual(MAX_CLUSTER_SIZE)
    // 双向 + 反链 + 2 个正向邻居 + 中心 = 5 条正好
    expect(cluster.map((n) => n.title)).toEqual(['费曼学习法', '间隔复习', '主动回忆', '知识缺口', '学习策略'])
  })

  it('自定义上限：maxSize 小时只保留强度最高的邻居', () => {
    const cluster = buildReviewCluster(center.path, all, 3)
    expect(cluster.map((n) => n.title)).toEqual(['费曼学习法', '间隔复习', '主动回忆'])
  })

  it('无邻居时退化为单条复习（仅中心）', () => {
    const cluster = buildReviewCluster(center.path, [center, unrelated])
    expect(cluster.map((n) => n.title)).toEqual(['费曼学习法'])
  })

  it('maxSize ≤ 1 时仅返回中心', () => {
    const cluster = buildReviewCluster(center.path, all, 1)
    expect(cluster.map((n) => n.title)).toEqual(['费曼学习法'])
  })

  it('中心笔记不存在时返回空数组', () => {
    expect(buildReviewCluster('/vault/notes/不存在.md', all)).toEqual([])
  })
})
