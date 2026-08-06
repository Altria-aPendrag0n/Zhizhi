import { describe, expect, it } from 'vitest'
import { insertHighlightAt, insertHighlightAtEnd } from './note-insert'

const HIGHLIGHT = '费曼学习法的核心不是把知识讲得简单'

describe('insertHighlightAt', () => {
  it('插入到有正文的小节末尾（下一个同级标题之前）', () => {
    const md = `# 学习方法

## 费曼技巧
这是已有的内容

## 间隔重复
另一个小节`
    const result = insertHighlightAt(md, 2, HIGHLIGHT)
    expect(result).toBe(`# 学习方法

## 费曼技巧
这是已有的内容

${HIGHLIGHT}

## 间隔重复
另一个小节`)
  })

  it('插入到空小节（标题紧邻下一标题）时在标题后插入', () => {
    const md = `## A
## B`
    const result = insertHighlightAt(md, 0, HIGHLIGHT)
    expect(result).toBe(`## A

${HIGHLIGHT}

## B`)
  })

  it('插入到最后一个标题小节，后无内容时不追加多余空行', () => {
    const md = `# 标题
内容`
    const result = insertHighlightAt(md, 0, HIGHLIGHT)
    expect(result).toBe(`# 标题
内容

${HIGHLIGHT}`)
  })

  it('多行划线原样插入，不加引用标记', () => {
    const md = `## A
内容`
    const result = insertHighlightAt(md, 0, '第一行\n第二行')
    expect(result).toBe(`## A
内容

第一行
第二行`)
  })

  it('目标标题不存在时抛出错误', () => {
    expect(() => insertHighlightAt('# 标题\n内容', 99, HIGHLIGHT)).toThrow('找不到所选标题')
  })
})

describe('insertHighlightAtEnd', () => {
  it('插入到文件末尾并保持前导空行分隔', () => {
    const md = `# 标题
内容`
    const result = insertHighlightAtEnd(md, HIGHLIGHT)
    expect(result).toBe(`# 标题
内容

${HIGHLIGHT}`)
  })

  it('空正文直接写入划线内容', () => {
    expect(insertHighlightAtEnd('', HIGHLIGHT)).toBe(HIGHLIGHT)
  })
})
