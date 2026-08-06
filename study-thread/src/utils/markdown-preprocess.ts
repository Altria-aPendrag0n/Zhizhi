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
 */

/** 可出现在 `**` 内侧的起始标点（开引号/括号） */
const OPEN_PUNCT = `"'“‘「『【（(`
/** 可出现在 `**` 内侧的结束标点（闭引号/括号） */
const CLOSE_PUNCT = `"'”’」』】）)`

/** `**"X"**` → `"**X**"`：标点移到加粗标记外侧 */
const QUOTE_BOLD_RE = new RegExp(`\\*\\*([${OPEN_PUNCT}])([^*\\n]+?)([${CLOSE_PUNCT}])\\*\\*`, 'g')

/**
 * 渲染前预处理 Markdown，修复标点紧贴 `**` 导致的加粗解析失败。
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
  // 还原代码占位符
  return out.replace(/\u0000(\d+)\u0000/g, (_m, index) => tokens[Number(index)] ?? '')
}
