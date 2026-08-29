# 19 · 图片转笔记模块

> 本模块覆盖：图片（照片/截图，可能含表格）通过多模态 LLM 识别为结构化 Markdown 的完整链路——多模态消息、图片压缩、识别 Skill、三入口弹窗、参考资料识别产物。
> 相关代码：`study-thread/src/api/skills/image-to-note.ts`、`study-thread/src/skills/image-to-note/`、`study-thread/src/utils/image-compress.ts`、`study-thread/src/components/notes/ImageToMarkdownDialog.vue`。

---

## 1. 模块职责

- 把一张图片（手机拍照、截图、文档照片）转换为**结构化 Markdown**（含 GFM 表格还原），并可附笔记元信息（标题/描述/标签）。
- 三个功能入口，共用同一个 `ImageToMarkdownDialog` 弹窗（三模式）：
  1. **note**：笔记 tab「新建笔记 → 从图片导入」，识别后保存为新笔记。
  2. **insert**：笔记编辑器工具栏「图片导入」，识别后插入光标处。
  3. **reference**：参考资料 PNG 上传后弹确认框（或卡片「转为 Markdown」按钮），识别产物 `{id}.extracted.md` 写入原参考文件夹，一次识别长期复用。
- 图片发送前经 **Canvas 压缩**（最长边 1568px、JPEG 0.85），控制 token 与请求体积。
- 识别走**独立的「图片转笔记专用模型」配置**（OpenAI 兼容格式，默认智谱 GLM-4V-Flash），与对话模型解耦。

## 2. 多模态消息支持（LLM 层扩展）

`Message`（`src/api/llm-provider.ts`）新增可选字段 `images?: Array<{ mimeType: string; base64: string }>`（`content` 保持字符串，最小侵入）。两个适配器各自转换：

| 适配器 | 转换 |
|---|---|
| `openai-compat.ts` `toApiMessages` | content 转为数组 `[{type:'text', text}, ...{type:'image_url', image_url:{url: 'data:{mimeType};base64,{base64}'}}]` |
| `anthropic.ts` `toAnthropicMessages` | content 转为数组 `[{type:'text', text}, ...{type:'image', source:{type:'base64', media_type, data}}]`（防御性支持） |

无 images 时保持原有字符串行为，对既有调用零影响。

## 3. 图片压缩（`utils/image-compress.ts`）

| 函数 | 说明 |
|---|---|
| `computeScaledDimensions(width, height, maxEdge)` | 等比缩放计算（最长边对齐 maxEdge，未超限不缩放） |
| `fileToBase64(file)` | File → base64（不含 data: 前缀）+ mimeType |
| `compressImageFile(file, maxEdge=1568, quality=0.85)` | createImageBitmap 读图 → 白底 + 等比缩放 → `canvas.toDataURL('image/jpeg')`；**任一环节失败降级返回原图 base64**，保证功能可用 |

## 4. 识别 Skill（`api/skills/image-to-note.ts`）

- SKILL.md（`src/skills/image-to-note/SKILL.md`）：图片笔记整理助手，要求完整识别全部文字、**GFM 表格还原**（合并单元格语义保留）、结构化 Markdown 输出；`markdown` 正文不重复写入一级标题（保存时系统自动添加）。
- `imageToMarkdown(image, provider, intent = 'note')`：组装多模态消息（`images` 附带图片块）→ `provider.chat`（temperature 0.3、maxTokens 4096、**`disableThinking: true`** 防思考挤空正文、`busyMessage` 忙碌遮罩）→ `extractJSON` → `validateImageNoteResult` → 返回 `{ title, description, tags, markdown }`。
- `intent`：`'note'`（转笔记）/ `'reference'`（识别为参考资料），注入不同的 SKILL 提示词。

## 5. 笔记保存扩展

- `serializeNote(note, sourceSession, highlightSource, body?)`（`utils/note-serializer.ts`）：新增可选 `body` 正文参数；缺省用划线原文，图片笔记场景传识别出的 Markdown（正文不再写划线原文，frontmatter 的 `source.highlight` 仍保留溯源）。
- `noteStore.saveNote(vaultPath, note, sourceSession, highlightSource, body?)`：透传 body；json sidecar 的 wikilink 关联也从 body 提取。图片笔记的来源会话传 `''`（`sessionIdFromReference('')` 兼容；创建分支走虚拟根会话）。

## 6. 三入口弹窗（`components/notes/ImageToMarkdownDialog.vue`）

- Props：`visible`、`mode: 'note' | 'insert' | 'reference'`、`reference?`（reference 模式用）。
- Emits：`close`、`saved(path)`（note/reference）、`insert(markdown)`（insert）。
- 流程状态机：`pick`（选图）→ `ready`（压缩完成，缩略图）→ `recognizing`（识别中）→ `preview`（可编辑标题/标签 + Markdown 预览）→ 确认落盘。
- reference 模式在弹窗打开时自动 `readFileBytes` 读取参考资料图片字节。
- 边界处理：未配置转笔记模型 → 提示去设置；未打开 Vault（note/reference）→ 提示并禁用；图片过大（base64 > 27MB）→ 提示。
- **异步加载**：NotesPage / NoteDetailPage 用 `defineAsyncComponent` 按需加载，避免增加路由首屏模块权重。

### 入口接线

| 入口 | 触发 → 处理 |
|---|---|
| 新建笔记 | `NoteList`「新建笔记 → 从图片导入」emit `create-from-image` → `NotesPage.openImageDialog('note')` → 保存后 toast + 跳转 `/notes/{path}` |
| 编辑器导入 | `MarkdownEditor` 工具栏「图片导入」emit `image-import` → `NoteDetail` 透传 → `NoteDetailPage` 打开 insert 模式 → `insert(markdown)` 回调 → `noteDetailRef.insertMarkdownAtCursor(markdown)`（编辑器 `defineExpose` 暴露，触发既有防抖保存） |
| 参考资料识别 | 上传 png 后 `NotesPage` 自动弹 reference 模式确认框；卡片「转为 Markdown」按钮 emit `recognize` → 同样打开弹窗 |

## 7. 参考资料 PNG 识别（`stores/references.ts`）

- **产物**：`{vault}/references/{id}/{id}.extracted.md`（复用 pdf 的 `parseStatus/extractedPath/extractedChars/extractedAt` 字段，无需改类型）。
- `recognizePngReference(meta, vaultPath, result?)`：
  - 传入 `result`（弹窗预览确认后）→ **仅落盘**：写 extracted.md + 回填元数据 + `refreshIndex`（不重复调用 LLM）。
  - 缺省（卡片自动/重试路径）→ 完整流程：置 `parsing` → `readFileBytes` → 压缩 → `imageToMarkdown(..., 'reference')` → 落盘；失败回填 `failed` + `parseError`。
- `retryRecognizePng(path)`：对失败 PNG 重新识别（UI「重试」）。
- 索引：`refreshIndex` 对已识别 png 按提取产物索引——大产物按 `chunkMdByChapters` 分块多向量，小产物单块；`buildIndexText` 拼入提取产物全文。
- **注意**：上传后不自动识别（避免静默消耗 token），由调用方弹确认框决定。

### 组件与工具联动

- `ReferenceCard.vue`：png 显示识别状态徽标（识别中/已识别/识别失败）；未识别时显示「转为 Markdown」按钮（emit `recognize`）；已识别显示「已识别 · N 字」。
- `ReferenceList.vue`：透传 `recognize` 事件。
- `read_reference` 工具（`api/tools/read-reference.ts`）：png 且 `extractedPath` 存在时**按行读取识别产物**（与 md 共用 `readMarkdownReference`）；未识别返回引导提示「请先执行『转为 Markdown』」。

## 8. 相关测试

- `src/api/skills/image-to-note.test.ts`（消息组装/JSON 解析/空响应/意图注入）
- `src/utils/image-compress.test.ts`（缩放计算/压缩成功/降级路径）
- `src/api/openai-compat.test.ts`、`src/api/anthropic.test.ts`（images → content 数组）
- `src/stores/settings.test.ts`（vision 四字段 + getVisionProviderConfig）
- `src/utils/note-serializer.test.ts`、`src/stores/notes.test.ts`（body 参数）
- `src/components/notes/ImageToMarkdownDialog.test.ts`（三模式）
- `src/stores/references.test.ts`（recognizePngReference 全流程/仅落盘/失败/重试/索引）
- `src/components/references/ReferenceCard.test.ts`（png 徽标与按钮）
- `src/views/NotesPage.test.ts`（上传 png 弹框/卡片识别/新建笔记入口）
- `src/components/editor/MarkdownEditor.test.ts`、`src/components/notes/NoteDetail.test.ts`（image-import 事件链与光标插入）
- `src/api/tools/read-reference.test.ts`（png 提取产物按行读取）

---

> 上一模块 → [18 调试日志系统](./18-debug-logging.md)
