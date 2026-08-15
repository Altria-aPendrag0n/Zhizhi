import { describe, it, expect } from 'vitest'
import {
  createBranchNode,
  createRootNode,
  addBranchToTree,
  findNode,
  getNodePath,
  getNodeDepth,
  collectSubtreeIds,
  removeNodeFromTree,
  updateNodeTitle,
  serializeTree,
  deserializeTree,
  countNodes,
  getLeafNodes,
} from './session-tree'


describe('createRootNode', () => {
  it('创建根节点', () => {
    const node = createRootNode('root-1', '主会话', 'sessions/main.md')
    expect(node.id).toBe('root-1')
    expect(node.title).toBe('主会话')
    expect(node.type).toBe('message')
    expect(node.fork_from).toBeNull()
    expect(node.children).toEqual([])
    expect(node.created).toBeTruthy()
  })
})

describe('createBranchNode', () => {
  it('创建分支节点', () => {
    const node = createBranchNode('branch-1', '追问', 'sessions/branch.md', 'root-1')
    expect(node.id).toBe('branch-1')
    expect(node.type).toBe('branch')
    expect(node.fork_from).toBe('root-1')
    expect(node.children).toEqual([])
  })
})

describe('addBranchToTree', () => {
  it('向根节点添加分支', () => {
    const root = createRootNode('root', '主会话', 'main.md')
    const branch = createBranchNode('b1', '分支1', 'b1.md', 'root')
    const updated = addBranchToTree(root, 'root', branch)
    expect(updated.children).toHaveLength(1)
    expect(updated.children[0].id).toBe('b1')
  })

  it('向子节点添加分支（嵌套）', () => {
    const root = createRootNode('root', '主会话', 'main.md')
    const b1 = createBranchNode('b1', '分支1', 'b1.md', 'root')
    const tree = addBranchToTree(root, 'root', b1)
    const b2 = createBranchNode('b2', '分支2', 'b2.md', 'b1')
    const updated = addBranchToTree(tree, 'b1', b2)
    expect(updated.children[0].children).toHaveLength(1)
    expect(updated.children[0].children[0].id).toBe('b2')
  })

  it('不修改原始树（不可变更新）', () => {
    const root = createRootNode('root', '主会话', 'main.md')
    const branch = createBranchNode('b1', '分支1', 'b1.md', 'root')
    const updated = addBranchToTree(root, 'root', branch)
    expect(root.children).toHaveLength(0)
    expect(updated.children).toHaveLength(1)
  })
})

describe('findNode', () => {
  it('查找根节点', () => {
    const root = createRootNode('root', '主会话', 'main.md')
    const found = findNode(root, 'root')
    expect(found).not.toBeNull()
    expect(found!.id).toBe('root')
  })

  it('查找子节点', () => {
    const root = createRootNode('root', '主会话', 'main.md')
    const branch = createBranchNode('b1', '分支1', 'b1.md', 'root')
    const tree = addBranchToTree(root, 'root', branch)
    const found = findNode(tree, 'b1')
    expect(found).not.toBeNull()
    expect(found!.id).toBe('b1')
  })

  it('查找不存在的节点返回 null', () => {
    const root = createRootNode('root', '主会话', 'main.md')
    const found = findNode(root, 'nonexistent')
    expect(found).toBeNull()
  })
})

describe('getNodePath', () => {
  it('获取根节点路径', () => {
    const root = createRootNode('root', '主会话', 'main.md')
    const path = getNodePath(root, 'root')
    expect(path).toHaveLength(1)
    expect(path[0].id).toBe('root')
  })

  it('获取嵌套节点路径', () => {
    const root = createRootNode('root', '主会话', 'main.md')
    const b1 = createBranchNode('b1', '分支1', 'b1.md', 'root')
    let tree = addBranchToTree(root, 'root', b1)
    const b2 = createBranchNode('b2', '分支2', 'b2.md', 'b1')
    tree = addBranchToTree(tree, 'b1', b2)
    const path = getNodePath(tree, 'b2')
    expect(path).toHaveLength(3)
    expect(path[0].id).toBe('root')
    expect(path[1].id).toBe('b1')
    expect(path[2].id).toBe('b2')
  })

  it('不存在的节点返回空数组', () => {
    const root = createRootNode('root', '主会话', 'main.md')
    const path = getNodePath(root, 'nonexistent')
    expect(path).toEqual([])
  })
})

describe('getNodeDepth', () => {
  it('根节点深度为 0', () => {
    const root = createRootNode('root', '主会话', 'main.md')
    expect(getNodeDepth(root, 'root')).toBe(0)
  })

  it('嵌套分支深度逐层递增', () => {
    const root = createRootNode('root', '主会话', 'main.md')
    const b1 = createBranchNode('b1', '分支1', 'b1.md', 'root')
    let tree = addBranchToTree(root, 'root', b1)
    const b2 = createBranchNode('b2', '分支2', 'b2.md', 'b1')
    tree = addBranchToTree(tree, 'b1', b2)
    const b3 = createBranchNode('b3', '分支3', 'b3.md', 'b2')
    tree = addBranchToTree(tree, 'b2', b3)

    expect(getNodeDepth(tree, 'root')).toBe(0)
    expect(getNodeDepth(tree, 'b1')).toBe(1)
    expect(getNodeDepth(tree, 'b2')).toBe(2)
    expect(getNodeDepth(tree, 'b3')).toBe(3)
  })

  it('不存在的节点返回 0', () => {
    const root = createRootNode('root', '主会话', 'main.md')
    expect(getNodeDepth(root, 'nonexistent')).toBe(0)
  })
})

describe('collectSubtreeIds', () => {
  it('收集节点自身及其所有后代 id', () => {
    const root = createRootNode('root', '主会话', 'main.md')
    const b1 = createBranchNode('b1', '分支1', 'b1.md', 'root')
    let tree = addBranchToTree(root, 'root', b1)
    const b2 = createBranchNode('b2', '分支2', 'b2.md', 'b1')
    tree = addBranchToTree(tree, 'b1', b2)

    expect(collectSubtreeIds(tree, 'root')).toEqual(['root', 'b1', 'b2'])
    expect(collectSubtreeIds(tree, 'b1')).toEqual(['b1', 'b2'])
    expect(collectSubtreeIds(tree, 'b2')).toEqual(['b2'])
  })

  it('不存在的节点返回空数组', () => {
    const root = createRootNode('root', '主会话', 'main.md')
    expect(collectSubtreeIds(root, 'nonexistent')).toEqual([])
  })
})

describe('removeNodeFromTree', () => {
  it('移除分支节点不影响同级与上级', () => {
    const root = createRootNode('root', '主会话', 'main.md')
    const b1 = createBranchNode('b1', '分支1', 'b1.md', 'root')
    let tree = addBranchToTree(root, 'root', b1)
    const b2 = createBranchNode('b2', '分支2', 'b2.md', 'root')
    tree = addBranchToTree(tree, 'root', b2)
    const b1c = createBranchNode('b1c', '分支1子', 'b1c.md', 'b1')
    tree = addBranchToTree(tree, 'b1', b1c)

    const removed = removeNodeFromTree(tree, 'b1')
    expect(removed).not.toBeNull()
    expect(findNode(removed!, 'b1')).toBeNull()
    expect(findNode(removed!, 'b1c')).toBeNull() // 子分支一并移除
    expect(findNode(removed!, 'b2')).not.toBeNull() // 同级保留
    expect(removed!.id).toBe('root') // 上级保留
  })

  it('移除根节点返回 null（整棵树清空）', () => {
    const root = createRootNode('root', '主会话', 'main.md')
    expect(removeNodeFromTree(root, 'root')).toBeNull()
  })

  it('不存在的节点返回原树', () => {
    const root = createRootNode('root', '主会话', 'main.md')
    const removed = removeNodeFromTree(root, 'nonexistent')
    expect(removed).not.toBeNull()
    expect(removed!.id).toBe('root')
    expect(removed!.children).toEqual([])
  })
})

describe('updateNodeTitle', () => {
  it('更新嵌套节点的标题并保持不可变', () => {
    const root = createRootNode('root', '主会话', 'main.md')
    const b1 = createBranchNode('b1', '分支1', 'b1.md', 'root')
    const b2 = createBranchNode('b2', '分支2', 'b2.md', 'b1')
    let tree = addBranchToTree(root, 'root', b1)
    tree = addBranchToTree(tree, 'b1', b2)

    const updated = updateNodeTitle(tree, 'b2', '新标题')
    expect(findNode(updated, 'b2')!.title).toBe('新标题')
    expect(findNode(updated, 'b1')!.title).toBe('分支1')
    expect(findNode(tree, 'b2')!.title).toBe('分支2') // 原树不受影响
  })

  it('节点不存在时返回原树引用', () => {
    const root = createRootNode('root', '主会话', 'main.md')
    expect(updateNodeTitle(root, 'nonexistent', '新标题')).toBe(root)
  })
})

describe('serializeTree / deserializeTree', () => {
  it('序列化和反序列化往返', () => {
    const root = createRootNode('root', '主会话', 'main.md')
    const json = serializeTree(root)
    const parsed = deserializeTree(json)
    expect(parsed).not.toBeNull()
    expect(parsed!.id).toBe('root')
    expect(parsed!.title).toBe('主会话')
  })

  it('反序列化无效 JSON 返回 null', () => {
    const result = deserializeTree('not valid json')
    expect(result).toBeNull()
  })

  it('反序列化缺少必要字段返回 null', () => {
    const result = deserializeTree('{"name": "test"}')
    expect(result).toBeNull()
  })
})

describe('countNodes', () => {
  it('单节点树计数为 1', () => {
    const root = createRootNode('root', '主会话', 'main.md')
    expect(countNodes(root)).toBe(1)
  })

  it('多层树正确计数', () => {
    const root = createRootNode('root', '主会话', 'main.md')
    const b1 = createBranchNode('b1', '分支1', 'b1.md', 'root')
    const b2 = createBranchNode('b2', '分支2', 'b2.md', 'root')
    let tree = addBranchToTree(root, 'root', b1)
    tree = addBranchToTree(tree, 'root', b2)
    expect(countNodes(tree)).toBe(3)
  })
})

describe('getLeafNodes', () => {
  it('单节点树返回自身', () => {
    const root = createRootNode('root', '主会话', 'main.md')
    const leaves = getLeafNodes(root)
    expect(leaves).toHaveLength(1)
    expect(leaves[0].id).toBe('root')
  })

  it('多分支树返回所有叶子', () => {
    const root = createRootNode('root', '主会话', 'main.md')
    const b1 = createBranchNode('b1', '分支1', 'b1.md', 'root')
    const b2 = createBranchNode('b2', '分支2', 'b2.md', 'root')
    let tree = addBranchToTree(root, 'root', b1)
    tree = addBranchToTree(tree, 'root', b2)
    const leaves = getLeafNodes(tree)
    expect(leaves).toHaveLength(2)
    const ids = leaves.map(l => l.id).sort()
    expect(ids).toEqual(['b1', 'b2'])
  })
})