# 08 · LLM API 适配层

> 本模块覆盖：LLM Provider 接口与工厂、Anthropic / OpenAI 兼容双协议适配器、流式工具封装、Agentic 工具调用循环、客户端工具（read_reference）。
> 相关代码：`study-thread/src/api/`（不含 `skills/`，Skills 见 [09-skills-system.md](./09-skills-system.md)）。

---

## 1. 模块职责

- 定义统一的 `LLMProvider` 接口，将**协议差异（Anthropic Messages / OpenAI Chat Completions）封装在适配器内**，上层页面只消费统一流式 `StreamChunk`。
- 工厂化创建 Provider（含 DeepSeek 官方 API 的特殊路由）。
- 提供带工具调用的 Agentic 聊天循环（`chatWithTools`）：模型可发起 `read_reference` 等客户端工具调用，客户端执行后将结果回传，多轮迭代直到给出最终回答。
- 处理流式 SSE 解析（文本 / 思考 / 工具调用分片累积 / 停止 / 错误）。

## 2. 接口定义（`llm-provider.ts`）

```ts
type MessageRole = 'system' | 'user' | 'assistant' | 'tool'

interface ImageContent { mimeType: string; base64: string }

interface Message {
  role: MessageRole
  content: string
  images?: ImageContent[]   // 多模态图片（图片转笔记场景），适配器各自转供应商格式
  toolCalls?: ToolCall[]   // assistant 附带：本轮发起的工具调用
  toolCallId?: string      // tool 附带：所响应的工具调用 id
}

interface ToolCall { id: string; name: string; arguments: Record<string, unknown> }
interface ToolDefinition { name: string; description: string; parameters: Record<string, unknown> } // JSON Schema

type StreamChunkType = 'text' | 'stop' | 'error' | 'thinking' | 'tool_call' | 'tool_result'
interface StreamChunk { type: StreamChunkType; content: string; toolCall?: ToolCall }

interface ChatOptions {
  model?; maxTokens?; temperature?; systemPrompt?; signal?  // AbortSignal
  enableWebSearch?: boolean  // 请求体附带 web_search 工具
  tools?: ToolDefinition[]   // 客户端工具列表
}

interface LLMProvider {
  chat(messages: Message[], options?: ChatOptions): AsyncIterable<StreamChunk>
}
```

> 注意：`types/index.ts` 中另有 `Message`/`StreamChunk`/`ChatOptions`（不含 tool 字段），是**旧版/UI 层使用**的类型；`api/llm-provider.ts` 是 LLM 层使用的扩展版。

## 3. 适配器

### 3.1 `AnthropicProvider`（`anthropic.ts`）

- 端点：`{baseUrl}/v1/messages`；headers：`x-api-key`、`anthropic-version: 2023-06-01`。
- 默认模型 `claude-sonnet-4-6`，默认 `max_tokens: 4096`。
- 消息转换 `toAnthropicMessages`：
  - 连续 `tool` 消息合并为一条 `user` 消息（`tool_result` blocks，Anthropic 规范）。
  - assistant 消息带 `toolCalls` → `tool_use` content blocks。
  - 消息带 `images` → content 转为 `[{type:'text', text}, ...{type:'image', source:{type:'base64', media_type, data}}]`（多模态，防御性支持）。
- 工具：客户端工具 → `{name, description, input_schema}`；`enableWebSearch` → `{type: 'web_search_20250305', name: 'web_search', max_uses: 3}`。
- SSE 事件处理：
  - `content_block_start`：`tool_use` 块初始化累积。
  - `content_block_delta`：`text_delta` → `text`；`thinking_delta` → `thinking`；`input_json_delta` → 累积工具参数。
  - `message_stop`：无工具调用时发 `stop`。
- 流结束后若有累积工具调用：`finishToolUses` 解析 JSON 参数 → 逐条发 `tool_call`，再发 `stop`。
- 中止（`AbortError`）→ 发 `stop`；网络/HTTP 错误 → 发 `error`（含状态码与响应体）。

### 3.2 `OpenAICompatProvider`（`openai-compat.ts`）

- 端点：`{baseUrl}/v1/chat/completions`；headers：`Authorization: Bearer {apiKey}`。
- 服务商预设 `PROVIDER_PRESETS`：

| key | baseUrl | 默认模型 |
|-----|---------|----------|
| openai | `https://api.openai.com` | `gpt-4o` |
| deepseek | `https://api.deepseek.com` | `deepseek-v4-flash` |
| qwen | `https://dashscope.aliyuncs.com/compatible-mode` | `qwen-plus` |
| zhipu | `https://open.bigmodel.cn/api/paas` | `glm-4-flash` |
| ollama | `http://localhost:11434` | `llama3` |

- 请求降级策略 `buildAttempts(enableWebSearch, tools)`：优先"web_search + 客户端工具" → 仅客户端工具 → 无工具；带工具请求遇 **400/404**（服务端不支持）自动降级重试更简单请求。
- 消息转换 `toApiMessages`：`tool` → `{role:'tool', tool_call_id, content}`；assistant 带 toolCalls → `tool_calls`（function 格式）；消息带 `images` → content 转为 `[{type:'text', text}, ...{type:'image_url', image_url:{url:'data:{mimeType};base64,{base64}'}}]`（多模态）。
- SSE 解析：`delta.content` → `text`；`delta.reasoning_content`（DeepSeek 等国产模型）→ `thinking`；`delta.tool_calls` 按 `index` 分片累积。
- 流结束：有工具调用则逐条发 `tool_call` + `stop`，否则直接 `stop`。

### 3.3 `createProvider` 工厂（`provider-factory.ts`）

```ts
switch (config.type) {
  case 'anthropic':            → new AnthropicProvider(apiKey, baseUrl)
  case 'openai-compat':
    if (baseUrl 含 api.deepseek.com)   // DeepSeek 官方：联网搜索仅 Anthropic 兼容端点支持
      → new AnthropicProvider(apiKey, baseUrl.replace(/\/+$/, '') + '/anthropic', model)
    else
      → new OpenAICompatProvider(apiKey, baseUrl, model)
}
```

- `createVisionProvider(config)`：图片转笔记专用模型 Provider（[19 图片转笔记](./19-image-to-note.md)）。统一走 OpenAI Chat Completions（不套 DeepSeek 特判），并包装 `withBusyOverlay` 支持 `busyMessage` 忙碌遮罩。

## 4. 流式工具封装（`stream.ts`）

| 导出 | 说明 |
|------|------|
| `streamChat(provider, messages, options?)` | 包装 `provider.chat`，异常统一转成 `{type:'error'}` chunk |
| `createAbortController()` | 快捷创建 `AbortController` |

## 5. Agentic 工具调用循环（`chat-loop.ts`）

```ts
chatWithTools({ provider, messages, systemPrompt, tools, toolContext, model, signal,
                enableWebSearch, temperature, maxTokens, maxRounds = MAX_TOOL_ROUNDS })
```

流程（最多 `maxRounds` 轮，默认 8）：
1. `provider.chat(history)` 流式消费；`tool_call` chunk 被拦截累积（不透传），其余 chunk（text/thinking/tool_result/error）透传。
2. 本轮以 `stop` 结束且存在工具调用 → 该 `stop` 由循环内部处理（不透传），`assistant` 消息（含 toolCalls）入 history。
3. 依次 `executeClientTool(name, args, toolContext)` 执行 → 结果以 `tool_result` chunk 透传（供 UI 展示），并作为 `tool` 消息入 history → 进入下一轮。
4. 无工具调用 → 循环结束，最终回答已透传。
5. 超过轮次上限 → 发 `{type:'error'}` 提示。

## 6. 客户端工具（`tools/`）

### 6.1 `tools/index.ts` — 注册表

```ts
export const CLIENT_TOOLS: ToolDefinition[] = [readReferenceTool]
export const MAX_TOOL_ROUNDS = 8
export async function executeClientTool(name, args, context): Promise<string>
```

### 6.2 `tools/read-reference.ts` — 分页读取参考资料

- 工具定义：`read_reference(reference_id, offset, limit)`；`limit` 默认 1000 行，单次最多 8000 字符。
- 执行 `executeReadReference`：
  1. `reference_id` 可以是 id 或完整 `.json` 元数据路径（`getReferenceMetaPath`）。
  2. 读元数据 JSON（`parseReferenceMeta`），非 md 类型返回说明文本（不抛错）。
  3. 按 `offset/limit` 切行，字符超限截断并标记。
  4. `formatRangeResult` 输出：`Showing lines X-Y of Z total lines (约 N 字).` + 内容 + 截断提示。
- 借鉴 qwen-code 的 ReadFile 分页思路：模型需要更多内容时用 `offset` 继续读取。

### 6.3 来源引用编号注入（v0.3.1）

- `buildKnowledgeContext(hits)`（`utils/knowledge-retrieval.ts`）从返回 `string` 升级为 `KnowledgeContext { context, sources }`：来源条目按注入顺序编号（`### [1] [笔记] 标题`），`sources: CitationSource[]` 携带 `index/kind/path/title/snippet/sectionTitle/pageFrom/pageTo`。
- 注入文本头部追加「引用要求」段：引用来源内容时在句末标注 `[n]`，未列出的来源不得标注或编造编号；前端 `applyCitationMarkers`（[02 号文档 3.8](./02-chat-module.md)）只渲染编号合法的角标——提示词约定 + 前端校验双保险，最坏表现为「该标没标」，不会「错误指向」。
- 消费方：MainChatPage / BranchChatPage 取 `.context` 拼 systemPrompt、`.sources` 挂到 AI 消息 `citations`；`CitationSourceViewer` 用 `executeReadReference` 按页展示原文。

### 6.4 联网搜索子代理（v0.3.1）

主模型通过调用 **web_search 客户端工具**（`src/api/tools/web-search.ts`）把联网检索委托给独立子代理——主模型本身无需支持联网（GLM 等）：

- **三种模式**（settings `searchAgentMode`，CustomModelPage 配置）：
  - `direct`（默认）：不注册工具，维持服务端联网直连（`enableWebSearch` 走主通道，行为与旧版一致）；
  - `official`：子代理走官方通道，请求带 `X-Zhizhi-Purpose: web_search` 头，网关（服务端）优先路由到「用途=web_search」的上游渠道（该渠道上游需支持 web_search 服务端工具，如 DeepSeek）；
  - `custom`：自定义子代理 baseUrl/Key/model（留空回退主模型配置），经 `createProvider` 复用 DeepSeek Anthropic 端点特判。
- **接线**：子代理开启时 MainChatPage / BranchChatPage 的工具列表追加 `webSearchTool`（不进 `CLIENT_TOOLS` 常驻列表），且主通道 `enableWebSearch` 置 false（避免双重联网尝试）；`branchFollowupStream` 新增可选 `tools` 参数透传。
- **执行**：`executeWebSearch` 以 `SEARCH_AGENT_SYSTEM_PROMPT` 调子代理（`enableWebSearch: true`，maxTokens 2048），输出要点 + 来源作为工具结果回传主模型；error chunk / 空输出 / 未配置均有兜底文案。
- **服务端配套**：`channels.purpose` 值域扩展 `web_search`；网关读 `X-Zhizhi-Purpose` 头优先解析 web_search 渠道候选（无则回退子 Key 用途匹配）；`channelMatchesPurpose` 对 web_search 只匹配显式声明（'*' 通用渠道不参与）。

### 6.5 常见 API 错误友好化（v0.3.1）

openai-compat 对常见失败状态输出中文指引（状态码保留便于排查）：402 / `quota_exhausted` → 额度用完与充值路径；401 → Key 无效或重新登录；429 → 限流稍候重试；其余未知错误保留原始信息。

## 7. 协作链路

```
页面（MainChatPage / BranchChatPage / SettingsPage / Skill 执行器）
  ├─ settingsStore.getProviderConfig() → createProvider()
  ├─ chatWithTools({...CLIENT_TOOLS / +webSearchTool}) / provider.chat()
  ├─ executeClientTool → readReferenceTool / web_search 子代理（X-Zhizhi-Purpose 头 → 官方联网渠道）
  └─ knowledge-retrieval 检索结果中的 reference_id 由模型传给 read_reference [10]
```

## 8. 相关测试

- `src/api/anthropic.test.ts`、`src/api/openai-compat.test.ts`
- `src/api/provider-factory.test.ts`、`src/api/chat-loop.test.ts`
- `src/api/tools/read-reference.test.ts`

---

> 上一模块 → [07 Vault 模块](./07-vault-module.md)  
> 下一模块 → [09 Skill 系统](./09-skills-system.md)
