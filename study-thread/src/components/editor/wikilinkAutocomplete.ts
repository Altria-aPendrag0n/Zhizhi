/**
 * [[ 笔记标题自动补全
 *
 * 当光标位于未闭合的 [[ 之后时，按笔记标题过滤（忽略大小写）返回建议列表，
 * 选中后插入 [[标题]]，光标停在标题与 ]] 之间（Obsidian 风格）。
 */
import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import type { EditorView } from '@codemirror/view'
import type { NoteMeta } from '../../types'

/** 补全面板最多展示的条目数 */
const MAX_OPTIONS = 20
/** 向光标前/后扫描的最大文本长度 */
const SCAN_WINDOW = 80

export function createWikiLinkCompletionSource(
  notes: NoteMeta[],
  currentNotePath?: string,
) {
  return (context: CompletionContext): CompletionResult | null => {
    const state = context.state
    const pos = context.pos

    // 光标前最近一段文本中是否出现未闭合的 [[
    const before = state.sliceDoc(Math.max(0, pos - SCAN_WINDOW), pos)
    const match = /\[\[([^\[\]]*)$/.exec(before)
    if (!match) return null

    const query = match[1]
    const linkStart = pos - query.length

    const normalizedQuery = query.toLocaleLowerCase()
    const options = notes
      .filter((note) => !currentNotePath || note.path !== currentNotePath)
      .filter((note) => note.title.toLocaleLowerCase().includes(normalizedQuery))
      .slice(0, MAX_OPTIONS)
      .map((note) => ({
        label: note.title,
        detail: '笔记',
        apply: (view: EditorView, _completion: unknown, from: number, to: number) => {
          // 若光标后已有闭合 ]]，仅替换 query 并保留原有 ]]，避免重复
          const afterText = view.state.sliceDoc(to, Math.min(view.state.doc.length, to + SCAN_WINDOW))
          const closeMatch = /^\s*\]\]/.exec(afterText)
          const insert = closeMatch ? note.title : `${note.title}]]`
          view.dispatch({
            changes: { from, to, insert },
            selection: { anchor: from + note.title.length, head: from + note.title.length },
          })
        },
      }))

    return {
      from: linkStart, // [[ 之后
      to: pos, // 光标处
      options,
    }
  }
}
