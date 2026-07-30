/**
 * 会话树数据结构与操作
 *
 * 管理会话的分支树结构，支持创建分支、添加节点、序列化/反序列化。
 * 存储在 vault 的 .study-thread/session-tree.json 中。
 */

/**
 * 会话树节点
 */
export interface SessionTreeNode {
  /** 唯一标识 */
  id: string
  /** 节点类型 */
  type: 'message' | 'branch'
  /** 标题 */
  title: string
  /** 关联的 Markdown 文件路径 */
  file: string
  /** 创建时间 */
  created: string
  /** 分叉来源节点 ID */
  fork_from: string | null
  /** 子节点 */
  children: SessionTreeNode[]
}

/**
 * 创建分支节点
 */
export function createBranchNode(
  id: string,
  title: string,
  file: string,
  forkFrom: string,
): SessionTreeNode {
  return {
    id,
    type: 'branch',
    title,
    file,
    created: new Date().toISOString(),
    fork_from: forkFrom,
    children: [],
  }
}

/**
 * 创建根节点（主会话）
 */
export function createRootNode(
  id: string,
  title: string,
  file: string,
): SessionTreeNode {
  return {
    id,
    type: 'message',
    title,
    file,
    created: new Date().toISOString(),
    fork_from: null,
    children: [],
  }
}

/**
 * 向树中添加分支节点
 *
 * @param tree - 当前树
 * @param parentId - 父节点 ID
 * @param branch - 要添加的分支节点
 * @returns 更新后的树（不可变更新）
 */
export function addBranchToTree(
  tree: SessionTreeNode,
  parentId: string,
  branch: SessionTreeNode,
): SessionTreeNode {
  if (tree.id === parentId) {
    return {
      ...tree,
      children: [...tree.children, branch],
    }
  }

  return {
    ...tree,
    children: tree.children.map((child) => addBranchToTree(child, parentId, branch)),
  }
}

/**
 * 在树中查找节点
 */
export function findNode(
  tree: SessionTreeNode,
  id: string,
): SessionTreeNode | null {
  if (tree.id === id) return tree
  for (const child of tree.children) {
    const found = findNode(child, id)
    if (found) return found
  }
  return null
}

/**
 * 获取节点到根节点的路径
 */
export function getNodePath(
  tree: SessionTreeNode,
  id: string,
): SessionTreeNode[] {
  if (tree.id === id) return [tree]
  for (const child of tree.children) {
    const path = getNodePath(child, id)
    if (path.length > 0) return [tree, ...path]
  }
  return []
}

/**
 * 序列化树为 JSON
 */
export function serializeTree(tree: SessionTreeNode): string {
  return JSON.stringify(tree, null, 2)
}

/**
 * 从 JSON 反序列化树
 */
export function deserializeTree(json: string): SessionTreeNode | null {
  try {
    const obj = JSON.parse(json)
    if (obj && typeof obj.id === 'string' && Array.isArray(obj.children)) {
      return obj as SessionTreeNode
    }
    return null
  } catch {
    return null
  }
}

/**
 * 计算树中所有节点的数量
 */
export function countNodes(tree: SessionTreeNode): number {
  let count = 1
  for (const child of tree.children) {
    count += countNodes(child)
  }
  return count
}

/**
 * 获取树的所有叶子节点
 */
export function getLeafNodes(tree: SessionTreeNode): SessionTreeNode[] {
  if (tree.children.length === 0) return [tree]
  return tree.children.flatMap(getLeafNodes)
}