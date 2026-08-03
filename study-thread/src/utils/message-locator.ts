import type { Message } from '../types'

/**
 * 解析划线文本所在的消息索引。
 *
 * 优先使用划线时从 DOM 定位到的消息索引（`data-message-index`）：
 * 消息用 marked 渲染后，视觉文本（加粗、HTML 实体、列表标记、换行折叠等）与
 * markdown 源文本常不一致，直接文本匹配会失败。DOM 索引来自用户真实划选的位置，
 * 最可靠。
 *
 * 当 DOM 索引缺失或非法时，回退到文本匹配（从后往前找最后一条包含划线文本的消息，
 * 可指定 role 过滤）。全部失败返回 -1，调用方据此提示"未找到划线内容所在的消息"。
 */
export function resolveMessageIndex(
  highlightedText: string,
  messages: Message[],
  domIndex: number | null,
  role?: Message['role'],
): number {
  if (
    domIndex !== null
    && Number.isInteger(domIndex)
    && domIndex >= 0
    && domIndex < messages.length
  ) {
    return domIndex
  }
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if ((!role || message.role === role) && message.content.includes(highlightedText)) {
      return index
    }
  }
  return -1
}
