import { describe, expect, it } from 'vitest'
import { parseHeadings } from './markdown-headings'

describe('parseHeadings', () => {
  it('按文档顺序解析各级标题及行号', () => {
    const md = `# 主标题
正文第一行

## 二级标题
内容

### 三级标题
细节`
    const headings = parseHeadings(md)
    expect(headings).toEqual([
      { level: 1, text: '主标题', line: 0, end: 2 },
      { level: 2, text: '二级标题', line: 3, end: 5 },
      { level: 3, text: '三级标题', line: 6, end: 7 },
    ])
  })

  it('标题 end 指向下一个同级或更高级标题的前一行', () => {
    const md = `## A
A 的内容

## B
B 的内容
### B1
B1 的内容
## C
C 的内容`
    const headings = parseHeadings(md)
    expect(headings[0]).toMatchObject({ text: 'A', line: 0, end: 2 })
    expect(headings[1]).toMatchObject({ text: 'B', line: 3, end: 4 })
    expect(headings[2]).toMatchObject({ text: 'B1', line: 5, end: 6 })
    expect(headings[3]).toMatchObject({ text: 'C', line: 7, end: 8 })
  })

  it('相邻标题（空小节）的 end 为标题行自身', () => {
    const md = `## A
## B`
    const headings = parseHeadings(md)
    expect(headings[0]).toMatchObject({ text: 'A', line: 0, end: 0 })
    expect(headings[1]).toMatchObject({ text: 'B', line: 1, end: 1 })
  })

  it('最后一个标题的 end 为文件最后一行', () => {
    const md = `# 标题\n内容`
    const headings = parseHeadings(md)
    expect(headings).toHaveLength(1)
    expect(headings[0]).toMatchObject({ text: '标题', line: 0, end: 1 })
  })

  it('跳过围栏代码块内的 # 行', () => {
    const md = `## 标题
\`\`\`
# 这不是标题
const x = 1
\`\`\`
正文`
    const headings = parseHeadings(md)
    expect(headings).toEqual([{ level: 2, text: '标题', line: 0, end: 5 }])
  })

  it('空正文返回空列表', () => {
    expect(parseHeadings('')).toEqual([])
    expect(parseHeadings('只有一段正文，没有标题')).toEqual([])
  })

  it('去除标题行尾的闭合井号', () => {
    const md = '## 标题 ##\n内容'
    const headings = parseHeadings(md)
    expect(headings[0].text).toBe('标题')
  })
})
