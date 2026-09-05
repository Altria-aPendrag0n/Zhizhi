/**
 * LLM 适配器接口定义
 * 所有 LLM 提供商（Anthropic、OpenAI 兼容等）都应实现此接口
 */

// 消息角色
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool'

// 模型发起的工具调用
export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

// 图片内容块（多模态：图片转笔记等场景使用）
export interface ImageContent {
  mimeType: string
  /** base64 编码的图片数据（不含 data: 前缀） */
  base64: string
}

// 单条消息
export interface Message {
  role: MessageRole
  content: string
  /** 附带图片（多模态输入）。适配器分别转换为 OpenAI image_url / Anthropic image content block */
  images?: ImageContent[]
  /** assistant 消息附带：本轮发起的工具调用（用于多轮工具循环） */
  toolCalls?: ToolCall[]
  /** tool 角色消息附带：所响应的工具调用 id */
  toolCallId?: string
}

// 流式响应块类型
export type StreamChunkType = 'text' | 'stop' | 'error' | 'thinking' | 'tool_call' | 'tool_result'

// 流式响应块
export interface StreamChunk {
  type: StreamChunkType
  content: string
  /** type=tool_call 时携带完整工具调用 */
  toolCall?: ToolCall
}

// 客户端可执行工具定义（OpenAI function calling / Anthropic tool 格式）
export interface ToolDefinition {
  name: string
  description: string
  /** JSON Schema（OpenAI 用 function.parameters；Anthropic 用 input_schema） */
  parameters: Record<string, unknown>
}

// 聊天选项
export interface ChatOptions {
  model?: string
  maxTokens?: number
  temperature?: number
  systemPrompt?: string
  signal?: AbortSignal
  /** 请求体附带 web_search 工具，由模型/服务端决定是否联网搜索 */
  enableWebSearch?: boolean
  /** 客户端执行的工具列表：随请求体发送，模型可发起调用 */
  tools?: ToolDefinition[]
  /**
   * 额外请求头（如官方网关的 X-Zhizhi-Purpose 用途路由头）：
   * 仅附加到本次请求，不影响 Provider 的默认头
   */
  extraHeaders?: Record<string, string>
  /**
   * 显式禁用模型思考模式（thinking/reasoning）：
   * 用于出题、摘录等需要稳定 JSON 输出的场景——思考模式（如 DeepSeek V4-Flash 默认开启）
   * 会与正文共用 maxTokens 预算，思考过长时正文被截断为空，导致结构化输出解析失败。
   * 缺省不传，保持服务商默认行为。
   */
  disableThinking?: boolean
  /**
   * 非学习会话的 AI 调用标记（复习出题 / 笔记摘录 / 画像更新 / 连接测试等）：
   * 传入后，等待完整输出的期间会自动显示全局 AI 忙碌遮罩并禁止操作。
   * 学习会话的流式聊天不要传此选项。
   */
  busyMessage?: string
}

// LLM 提供商接口
export interface LLMProvider {
  /** 发送消息并返回流式响应 */
  chat(messages: Message[], options?: ChatOptions): AsyncIterable<StreamChunk>
}
