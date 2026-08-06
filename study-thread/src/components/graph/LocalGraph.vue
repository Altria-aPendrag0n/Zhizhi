<template>
  <div class="local-graph">
    <div class="local-graph__toolbar">
      <span class="local-graph__title">关系图</span>
      <div class="local-graph__controls">
        <button
          class="local-graph__btn"
          :class="{ 'is-active': depth === 1 }"
          @click="setDepth(1)"
        >
          1 度
        </button>
        <button
          class="local-graph__btn"
          :class="{ 'is-active': depth === 2 }"
          @click="setDepth(2)"
        >
          2 度
        </button>
        <button
          class="local-graph__btn"
          :class="{ 'is-active': !Number.isFinite(depth) }"
          @click="setDepth(Infinity)"
        >
          全部
        </button>
        <button class="local-graph__btn" @click="resetZoom" title="重置视图">
          重置
        </button>
      </div>
    </div>
    <div class="local-graph__canvas" ref="canvasRef">
      <div v-if="nodes.length === 0" class="local-graph__empty">
        暂无关联笔记
      </div>
    </div>
    <!-- Tooltip -->
    <div
      class="local-graph__tooltip"
      v-if="tooltip.visible"
      :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }"
    >
      <div class="local-graph__tooltip-title">{{ tooltip.title }}</div>
      <div class="local-graph__tooltip-type">{{ tooltip.type }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import * as d3 from 'd3'
import { useNoteStore } from '../../stores/notes'
import { parseWikiLinks } from '../../parser/wikilink'
import type { Note } from '../../types'

const props = withDefaults(
  defineProps<{
    noteId: string
    depth?: number
  }>(),
  {
    depth: 1,
  },
)

const router = useRouter()
const noteStore = useNoteStore()

const canvasRef = ref<HTMLElement | null>(null)

const depth = ref(props.depth)

interface GraphNode extends d3.SimulationNodeDatum {
  id: string
  title: string
  type: string
  isCenter: boolean
  degree: number
  depth: number
}

interface GraphLink {
  source: string | GraphNode
  target: string | GraphNode
}

const nodes = ref<GraphNode[]>([])
const links = ref<GraphLink[]>([])

const tooltip = ref({
  visible: false,
  x: 0,
  y: 0,
  title: '',
  type: '',
})

let simulation: d3.Simulation<GraphNode, d3.SimulationLinkDatum<GraphNode>> | null = null
let svg: d3.Selection<SVGSVGElement, unknown, null, undefined> | null = null
let zoomBehavior: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null

// 颜色映射
const typeColors: Record<string, string> = {
  concept: '#6366f1',
  method: '#f59e0b',
  fact: '#22c55e',
  question: '#ef4444',
}

function getNodeColor(node: GraphNode): string {
  if (node.isCenter) return 'var(--brand, #6366f1)'
  return typeColors[node.type] || '#94a3b8'
}

/**
 * 构建图数据
 *
 * @param maxDepth - 局部模式的最大深度；传非有限值（如 Infinity）时为全量模式，
 *   展示所有笔记节点与全部 wikilink 联系（不限制深度）。
 */
function buildGraph(noteId: string, maxDepth: number) {
  // 使用 noteIndex 获取完整笔记数据（含 content），回退到 notes 元数据列表
  const noteIndex = noteStore.noteIndex
  const allNoteMetas = noteStore.notes

  if (allNoteMetas.length === 0 && noteIndex.size === 0) {
    nodes.value = []
    links.value = []
    return
  }

  // 优先使用 noteIndex 中的完整 Note 数据
  const noteMap = new Map<string, Note>()
  for (const [path, note] of noteIndex) {
    noteMap.set(path, note)
  }

  // 如果 noteIndex 为空，用 NoteMeta 构建简化版 Note
  if (noteMap.size === 0) {
    for (const meta of allNoteMetas) {
      noteMap.set(meta.path, {
        path: meta.path,
        title: meta.title,
        type: meta.type as 'concept' | 'method' | 'fact' | 'question',
        tags: meta.tags,
        created: meta.created,
        updated: meta.updated,
        confidence: 0,
        review: { next: null, interval: 0, mastery: 0 },
        content: '',
      })
    }
  }

  // 解析 wikilink 获取邻居
  const linkMap = new Map<string, Set<string>>()
  for (const [path, note] of noteMap) {
    const wikiLinks = parseWikiLinks(note.content)
    const targets = new Set<string>()
    for (const link of wikiLinks) {
      // 尝试匹配笔记
      for (const [notePath, noteObj] of noteMap) {
        if (noteObj.title === link.target || notePath.endsWith(link.target + '.md') || notePath === link.target) {
          targets.add(notePath)
          break
        }
      }
    }
    linkMap.set(path, targets)
  }

  const graphNodes: GraphNode[] = []
  const graphLinks: GraphLink[] = []

  // 全量模式：所有笔记均为节点（含孤立笔记），全部 wikilink 均为边
  if (!Number.isFinite(maxDepth)) {
    const seenEdges = new Set<string>()
    for (const [path, note] of noteMap) {
      const neighbors = linkMap.get(path) || new Set()
      graphNodes.push({
        id: note.path,
        title: note.title,
        type: note.type,
        isCenter: path === noteId,
        degree: neighbors.size,
        depth: 0,
      })
      for (const neighbor of neighbors) {
        // 无向边去重：A→B 与 B→A 只保留一条
        const edgeKey = path < neighbor ? `${path}|${neighbor}` : `${neighbor}|${path}`
        if (seenEdges.has(edgeKey)) continue
        seenEdges.add(edgeKey)
        graphLinks.push({ source: path, target: neighbor })
      }
    }
  } else {
    // 局部模式：从当前笔记 BFS，限制深度
    const visited = new Set<string>()
    const queue: { path: string; depth: number }[] = []

    // 起始节点
    queue.push({ path: noteId, depth: 0 })
    visited.add(noteId)

    while (queue.length > 0) {
      const current = queue.shift()!
      const note = noteMap.get(current.path)
      if (!note) continue

      const neighbors = linkMap.get(current.path) || new Set()
      const degree = neighbors.size

      graphNodes.push({
        id: note.path,
        title: note.title,
        type: note.type,
        isCenter: current.depth === 0,
        degree,
        depth: current.depth,
      })

      if (current.depth < maxDepth) {
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor)
            queue.push({ path: neighbor, depth: current.depth + 1 })
          }
          graphLinks.push({
            source: note.path,
            target: neighbor,
          })
        }
      }
    }
  }

  nodes.value = graphNodes
  links.value = graphLinks
}

/**
 * 渲染 D3 力导向图
 */
function renderGraph() {
  if (!canvasRef.value || nodes.value.length === 0) return

  const container = canvasRef.value
  const width = container.clientWidth
  const height = container.clientHeight || 400

  // 清除旧的 SVG
  d3.select(container).selectAll('svg').remove()

  // 创建 SVG
  svg = d3
    .select(container)
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', `0 0 ${width} ${height}`)

  const g = svg.append('g')

  // 缩放行为
  zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.3, 3])
    .on('zoom', (event) => {
      g.attr('transform', event.transform.toString())
    })

  svg.call(zoomBehavior)

  // 准备数据
  const simNodes: GraphNode[] = nodes.value.map((n) => ({ ...n }))
  const simLinks: d3.SimulationLinkDatum<GraphNode>[] = links.value.map((l) => ({
    source: l.source,
    target: l.target,
  }))

  // 力模拟
  simulation = d3
    .forceSimulation<GraphNode>(simNodes)
    .force(
      'link',
      d3
        .forceLink<GraphNode, d3.SimulationLinkDatum<GraphNode>>(simLinks)
        .id((d) => d.id)
        .distance(80),
    )
    .force('charge', d3.forceManyBody<GraphNode>().strength(-200))
    .force('center', d3.forceCenter<GraphNode>(width / 2, height / 2))
    .force('collision', d3.forceCollide<GraphNode>(30))

  // 绘制边
  const link = g
    .append('g')
    .selectAll('line')
    .data(simLinks)
    .join('line')
    .attr('stroke', 'var(--line, #e2e8f0)')
    .attr('stroke-width', 1.5)
    .attr('stroke-opacity', 0.6)

  // 绘制节点
  const node = g
    .append('g')
    .selectAll<SVGCircleElement, GraphNode>('circle')
    .data(simNodes)
    .join('circle')
    .attr('r', (d) => {
      if (d.isCenter) return 16
      return 6 + d.degree * 2
    })
    .attr('fill', (d) => getNodeColor(d))
    .attr('stroke', (d) => {
      if (d.isCenter) return 'var(--brand, #6366f1)'
      return 'transparent'
    })
    .attr('stroke-width', (d) => (d.isCenter ? 2 : 0))
    .attr('cursor', 'pointer')
    .on('mouseenter', (event, d) => {
      tooltip.value = {
        visible: true,
        x: event.offsetX + 10,
        y: event.offsetY - 10,
        title: d.title,
        type: d.type,
      }
    })
    .on('mouseleave', () => {
      tooltip.value.visible = false
    })
    .on('click', (_event, d) => {
      if (!d.isCenter) {
        router.push(`/notes/${encodeURIComponent(d.id)}`)
      }
    })
    .call(
      d3
        .drag<SVGCircleElement, GraphNode>()
        .on('start', (event, d) => {
          if (!event.active) simulation?.alphaTarget(0.3).restart()
          d.fx = d.x
          d.fy = d.y
        })
        .on('drag', (event, d) => {
          d.fx = event.x
          d.fy = event.y
        })
        .on('end', (event, d) => {
          if (!event.active) simulation?.alphaTarget(0)
          d.fx = null as unknown as number | undefined
          d.fy = null as unknown as number | undefined
        }) as any,
    )

  // 绘制标签
  const label = g
    .append('g')
    .selectAll('text')
    .data(simNodes)
    .join('text')
    .text((d) => (d.title.length > 10 ? d.title.slice(0, 10) + '…' : d.title))
    .attr('font-size', (d) => (d.isCenter ? 12 : 10))
    .attr('font-weight', (d) => (d.isCenter ? 600 : 400))
    .attr('fill', 'var(--ink, #1e293b)')
    .attr('text-anchor', 'middle')
    .attr('dy', (d) => (d.isCenter ? -22 : -14))
    .attr('pointer-events', 'none')

  // 模拟更新
  simulation.on('tick', () => {
    link
      .attr('x1', (d: any) => d.source.x)
      .attr('y1', (d: any) => d.source.y)
      .attr('x2', (d: any) => d.target.x)
      .attr('y2', (d: any) => d.target.y)

    node.attr('cx', (d: any) => d.x).attr('cy', (d: any) => d.y)

    label.attr('x', (d: any) => d.x).attr('y', (d: any) => d.y)
  })
}

function setDepth(d: number) {
  depth.value = d
}

function resetZoom() {
  if (svg && zoomBehavior) {
    svg.transition().duration(300).call(zoomBehavior.transform, d3.zoomIdentity)
  }
}

function handleResize() {
  renderGraph()
}

// 监听 noteId 变化
watch(
  () => props.noteId,
  (newId) => {
    if (newId) {
      buildGraph(newId, depth.value)
      nextTick(() => renderGraph())
    }
  },
  { immediate: true },
)

// 监听深度变化
watch(depth, (newDepth) => {
  if (props.noteId) {
    buildGraph(props.noteId, newDepth)
    nextTick(() => renderGraph())
  }
})

onMounted(() => {
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  if (simulation) {
    simulation.stop()
  }
})
</script>

<style scoped>
.local-graph {
  border: 1px solid var(--line);
  border-radius: 12px;
  overflow: hidden;
  background: var(--surface);
  display: flex;
  flex-direction: column;
}

.local-graph__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--line);
}

.local-graph__title {
  font-size: 13px;
  font-weight: 650;
  color: var(--ink);
}

.local-graph__controls {
  display: flex;
  gap: 4px;
}

.local-graph__btn {
  padding: 4px 10px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--surface);
  color: var(--ink-2);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}

.local-graph__btn:hover {
  background: var(--surface-2);
}

.local-graph__btn.is-active {
  background: var(--brand);
  color: #fff;
  border-color: var(--brand);
}

.local-graph__canvas {
  flex: 1;
  min-height: 300px;
  position: relative;
  overflow: hidden;
}

.local-graph__canvas :deep(svg) {
  display: block;
}

.local-graph__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--ink-3);
  font-size: 13px;
}

.local-graph__tooltip {
  position: absolute;
  padding: 8px 12px;
  background: var(--ink);
  color: #fff;
  border-radius: 6px;
  font-size: 12px;
  pointer-events: none;
  z-index: 10;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.local-graph__tooltip-title {
  font-weight: 600;
  margin-bottom: 2px;
}

.local-graph__tooltip-type {
  font-size: 11px;
  opacity: 0.8;
}
</style>