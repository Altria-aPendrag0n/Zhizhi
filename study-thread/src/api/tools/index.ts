/**
 * 客户端工具注册表
 *
 * 集中注册可供 LLM 调用的客户端工具（工具定义随请求体发送，
 * 模型发起调用后由本模块在本地执行）。
 *
 * 注意：web_search（联网搜索子代理）不进入 CLIENT_TOOLS 常驻列表——
 * 仅当用户开启联网搜索子代理时，由调用方（MainChatPage / BranchChatPage）
 * 动态追加到请求的工具列表；执行统一走 executeClientTool。
 */

import type { ToolDefinition } from '../llm-provider'
import {
  readReferenceTool,
  executeReadReference,
  type ToolContext,
} from './read-reference'
import { webSearchTool as _webSearchTool, executeWebSearch } from './web-search'
export type { ToolContext } from './read-reference'
/** 联网搜索子代理工具定义（不进 CLIENT_TOOLS 常驻列表，调用方按需追加） */
export const webSearchTool = _webSearchTool
export { executeWebSearch, SEARCH_AGENT_SYSTEM_PROMPT } from './web-search'

/** 常驻工具定义（随请求体发送给模型） */
export const CLIENT_TOOLS: ToolDefinition[] = [readReferenceTool]

/** 单次会话内工具调用轮次上限，防止死循环 */
export const MAX_TOOL_ROUNDS = 8

/**
 * 执行客户端工具
 *
 * @param name - 工具名
 * @param args - 模型传入的参数
 * @param context - 执行上下文（vault 路径等）
 * @returns 工具执行结果文本
 */
export async function executeClientTool(
  name: string,
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<string> {
  switch (name) {
    case 'read_reference':
      return executeReadReference(args, context)
    case 'web_search':
      return executeWebSearch(args)
    default:
      return `错误：未知的工具 ${name}。`
  }
}
