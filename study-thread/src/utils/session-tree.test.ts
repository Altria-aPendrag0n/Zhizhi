import { describe, it, expect } from 'vitest'
import {
  createBranchNode,
  createRootNode,
  addBranchToTree,
  findNode,
  getNodePath,
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