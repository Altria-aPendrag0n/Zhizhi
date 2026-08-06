# 06 · 知识图谱模块

> 本模块覆盖：笔记关系图（全量图 + 局部 1/2 度邻居力导向图）。
> 相关代码：`study-thread/src/components/graph/LocalGraph.vue`。

---

## 1. 模块职责

- 通过 `[[wikilink]]` 双向链接构建笔记关系图：**全量模式**展示所有笔记节点与全部联系（不限制深度，孤立笔记也展示）；局部模式以当前笔记为中心 BFS 展开 1/2 度邻居。
- 用 D3.js force simulation 渲染力导向图：支持缩放、拖拽、点击跳转、tooltip。
- 节点按笔记类型着色（concept/method/fact/question），中心节点突出显示。

> 设计文档中"认知地图画布 / 诊断热力图"为 V2 范围，本模块仅实现 V1 的关系图。

## 2. 组件契约

| props | 说明 |
|-------|------|
| `noteId: string` | 中心笔记 id（路由参数，全量模式仅用于高亮中心节点） |
| `depth?: number` | 局部模式展开深度，默认 1；传非有限值（`Infinity`）时为**全量模式**（笔记详情页传 `Infinity`） |

工具栏提供「1 度 / 2 度 / 全部」切换；无 emits：点击节点直接 `router.push` 跳转笔记详情。

## 3. 关键逻辑

### 3.1 `buildGraph()`

1. 取笔记数据：优先 `noteStore.noteIndex`（完整 `Note` 含 content），否则用 notes 元数据构造简化 Note。
2. 解析每篇笔记正文的 wikilink（`parseWikiLinks`）建立 `linkMap`。
3. 两种模式：
   - **全量模式**（`maxDepth` 非有限值）：遍历全部笔记生成节点（含孤立笔记），全部 wikilink 生成边，无向边（A→B / B→A）去重只保留一条。
   - **局部模式**：从中心节点 BFS 到 `maxDepth`，生成 `nodes` / `links`。

### 3.2 `renderGraph()`

| D3 能力 | 用法 |
|---------|------|
| `forceSimulation` | link / charge / center / collision 组合布局 |
| 节点半径 | 随 degree（连接数）变化 |
| 着色 | 中心节点品牌色；其余按 type：concept/method/fact/question |
| `d3.drag` | 拖拽固定 `fx/fy` |
| `zoomBehavior` | 0.3–3 倍缩放 + 重置 |
| tooltip | 跟随鼠标显示标题与类型 |
| 点击 | 非中心节点跳转笔记详情 |

### 3.3 生命周期

- watch `noteId` / `depth` → 重建图。
- resize 事件 → 重渲染。
- 卸载时 `simulation.stop()` 释放资源。

## 4. 依赖

- `d3`（完整命名空间 `import * as d3 from 'd3'`）。
- `useNoteStore`：笔记数据源。
- `../../parser/wikilink`：wikilink 解析（[11 解析器与序列化工具](./11-parsers-serializers.md)）。

## 5. 相关测试

- `src/components/graph/LocalGraph.test.ts`：全量模式（所有节点含孤立 + 边去重 + 中心高亮）、局部模式（depth=1 仅中心与一层邻居）。

---

> 上一模块 → [05 Markdown 编辑器](./05-editor-module.md)  
> 下一模块 → [07 Vault 模块](./07-vault-module.md)
