/**
 * Markdown 渲染前预处理
 *
 * 修复 GFM flanking 规则下中文标点紧邻加粗定界符导致加粗解析失败的问题。
 *
 * 实测（marked v18，GFM）：`**"X"**是` / `俗称**"X"**，` 等写法中，引号等标点
 * 紧贴 `**` 且外侧又是非标点时，开/闭定界符不满足 left/right-flanking，`**` 变成
 * 字面文本，加粗不生效（如 AI 回答里的 `**"濑尿虾"**是皮皮虾`）。
 *
 * 处理方式：把 `**"X"**` 这类"引号/括号包裹在加粗标记内侧"的写法，变换为
 * `"**X**"`（标点移到 `**` 外侧，文本内容不变，仅标点不再随加粗渲染）。
 * 变换后 `**` 两侧均为非标点字符，flanking 规则满足，加粗正常。
 *
 * 此外，AI 常以框线字符画（`┌─┐` / `│` / `└─┘` / `▼` / `→` 等拼出的流程图）
 * 输出流程图。这类内容落在普通段落时，HTML 会把连续空格折叠为单个空格、且默认
 * 非等宽字体，导致框线错位、流程图"看着不对"。因此检测由框线字符构成的段落，
 * 包裹为 `text` 围栏代码块，交给 `<pre><code>` 以等宽字体 + 保留空白渲染。
 */

/** 可出现在 `**` 内侧的起始标点（开引号/括号） */
const OPEN_PUNCT = `"'“‘「『【（(`
/** 可出现在 `**` 内侧的结束标点（闭引号/括号） */
const CLOSE_PUNCT = `"'”’」』】）)`

/** `**"X"**` → `"**X**"`：标点移到加粗标记外侧 */
const QUOTE_BOLD_RE = new RegExp(`\\*\\*([${OPEN_PUNCT}])([^*\\n]+?)([${CLOSE_PUNCT}])\\*\\*`, 'g')

/** 框线字符（制表符）：流程图盒子的边、角、连接线 */
const BOX_DRAWING_CHARS = new Set('─│┌┐└┘├┤┬┴┼═║╔╗╚╝╠╣╦╩╬╭╮╰╯'.split(''))
/** 箭头与几何形状字符：流程图中的方向与节点标记 */
const ARROW_SHAPE_CHARS = new Set('→←↑↓↔↕⇒⇐⇑⇓➜➤▼▲►◄▶◀'.split(''))

function countCharsIn(str: string, set: ReadonlySet<string>): number {
  let count = 0
  for (const ch of str) {
    if (set.has(ch)) count++
  }
  return count
}

/**
 * 判断一个由连续非空行组成的段落是否为框线字符画（流程图）。
 * 规则：至少两处框线字符，或至少一处框线字符配至少一处箭头/形状字符。
 * 单独一个 `→` 之类出现在普通句子里不会被误判。
 */
function isDiagramParagraph(lines: string[]): boolean {
  let boxCount = 0
  let arrowCount = 0
  for (const line of lines) {
    boxCount += countCharsIn(line, BOX_DRAWING_CHARS)
    arrowCount += countCharsIn(line, ARROW_SHAPE_CHARS)
  }
  return boxCount >= 2 || (boxCount >= 1 && arrowCount >= 1)
}

/**
 * 将框线字符画段落包裹为 `text` 围栏代码块，保留空白并以等宽字体渲染。
 * 按空行分段（流程图通常为一个无空行的段落），非流程图段落原样保留。
 */
export function wrapDiagramBlocks(md: string): string {
  const lines = md.split('\n')
  const out: string[] = []
  let i = 0
  while (i < lines.length) {
    if (lines[i].trim() === '') {
      out.push(lines[i])
      i++
      continue
    }
    const start = i
    while (i < lines.length && lines[i].trim() !== '') i++
    const paragraph = lines.slice(start, i)
    if (isDiagramParagraph(paragraph)) {
      out.push('```text')
      out.push(...paragraph)
      out.push('```')
    } else {
      out.push(...paragraph)
    }
  }
  return out.join('\n')
}

/**
 * 渲染前预处理 Markdown，修复标点紧贴 `**` 导致的加粗解析失败，
 * 并将框线字符画流程图包裹为代码块避免错位。
 * 代码块与行内代码先以占位符保护，避免其中的 `**"…"**` 被改写。
 */
export function preprocessMarkdownForRendering(md: string): string {
  const tokens: string[] = []
  let out = md
  // 保护围栏代码块（```…```）
  out = out.replace(/```[\s\S]*?```/g, (m) => {
    tokens.push(m)
    return `\u0000${tokens.length - 1}\u0000`
  })
  // 保护行内代码（`…`）
  out = out.replace(/`[^`\n]*`/g, (m) => {
    tokens.push(m)
    return `\u0000${tokens.length - 1}\u0000`
  })
  // 标点移到加粗标记外侧
  out = out.replace(QUOTE_BOLD_RE, '$1**$2**$3')
  // 框线字符画流程图包成代码块（此时围栏/行内代码已是占位符，不会被二次包裹）
  out = wrapDiagramBlocks(out)
  // 还原代码占位符
  return out.replace(/\u0000(\d+)\u0000/g, (_m, index) => tokens[Number(index)] ?? '')
}
