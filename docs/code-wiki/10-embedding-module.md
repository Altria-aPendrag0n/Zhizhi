# 10 · Embedding 向量引擎与知识检索

> 本模块覆盖：本地离线向量化引擎、向量索引器、相似检索（链接建议），以及会话 RAG 知识检索注入。
> 相关代码：`study-thread/src/embedding/`、`study-thread/src/utils/knowledge-retrieval.ts`。

---

## 1. 模块职责

- 基于 transformers.js 在**浏览器内**运行 embedding 模型，模型与 onnxruntime wasm 全部本地内置，**完全离线**（`allowRemoteModels = false`）。
- 构建/维护笔记与参考资料的向量索引，持久化到 `localStorage`。
- 两处消费方：
  1. **RAG 知识检索**（`knowledge-retrieval.ts`）：会话发送前检索相关笔记/参考资料，注入 system prompt。
  2. **语义链接建议**（`linker.ts`）：编辑器输入时推荐相关笔记（`LinkHint`，见 [05-editor-module.md](./05-editor-module.md)）。

## 2. 引擎 `embedding/engine.ts`

### 2.1 模型与离线配置

```ts
type EmbeddingModel = 'Xenova/all-MiniLM-L6-v2' | 'Xenova/text2vec-base-chinese'
const DEFAULT_MODEL = 'Xenova/all-MiniLM-L6-v2'   // 384 维

env.localModelPath = '/models/'            // Vite public 目录，构建复制到 dist
env.allowLocalModels = true
env.allowRemoteModels = false              // 绝不访问网络
env.backends.onnx.wasm.wasmPaths = '/models/ort/'
```

内置资源清单（`public/models/`，由 `model-assets.test.ts` 校验完整性）：
- `Xenova/all-MiniLM-L6-v2/`：config.json、tokenizer.json、tokenizer_config.json、special_tokens_map.json、vocab.txt、onnx/model_quantized.onnx（≥5MB）。
- `ort/`：`ort-wasm-simd-threaded.wasm`、`ort-wasm-simd.wasm`、`ort-wasm-threaded.wasm`、`ort-wasm.wasm`（各 ≥1MB）。

**资源获取与构建门禁**（v0.1 发布准备）：`public/models/` 被 `.gitignore` 忽略，换机器/CI 构建会静默缺失。`scripts/fetch-models.mjs` 负责补齐：
- `npm run fetch:models`：从 HuggingFace 下载模型文件 + 从 `node_modules/onnxruntime-web/dist` 复制 ort wasm（幂等，已存在跳过）；`--mirror` 走 hf-mirror 国内镜像，`--force` 强制覆盖。
- `npm run check:models`（`--check`）：校验必需文件存在且体积达标，缺失时非零退出并提示先运行 `fetch:models`。
- `package.json` 的 `build` 脚本前置 `check:models`，因此 `npm run tauri build` 在资源缺失时会直接报错，杜绝"打包出无模型应用"。

### 2.2 类 `EmbeddingEngine`

| 成员 | 说明 |
|------|------|
| `status` / `progress` / `error` | `EngineStatus = 'idle' \| 'loading' \| 'ready' \| 'error'`、进度(0-1)、错误信息 |
| `isReady()` | `status === 'ready' && extractor !== null` |
| `initialize(onProgress?)` | 加载 `pipeline('feature-extraction', model)`；**失败后先清理 `/models/` 在 Cache Storage（`transformers-cache`）中的脏缓存再重试一次**（防止开发期 404 回退的 index.html 被缓存导致 "Unexpected token '<'" 错误） |
| `embed(text)` | 单文本向量化：`pooling:'mean'` + `normalize:true` → `Float32Array → number[]` |
| `embedBatch(texts)` | 逐条调用（未并行） |
| `changeModel(modelName)` | 切换模型并复位状态（需重新 initialize） |

### 2.3 单例

`getEmbeddingEngine()` 返回模块级单例；`App.vue` 挂载时调用 `engine.initialize()`，就绪后触发 `vaultStore.initIndex()`。

## 3. 索引器 `embedding/indexer.ts`

### 3.1 数据结构

```ts
interface IndexEntry { path: string; vector: number[]; indexedAt: number }
interface IndexStore { version: number; entries: IndexEntry[] }
const INDEX_VERSION = 1
const STORAGE_KEY = 'study-thread-note-index'   // localStorage
```

### 3.2 类 `NoteIndexer`

| 方法 | 说明 |
|------|------|
| `loadFromStorage()` | 读取 localStorage，版本不符返回 false |
| `saveToStorage()` | 写回 localStorage |
| `buildIndex(notes, getNoteContent, onProgress?)` | 全量构建：**已索引且 `updated <= indexedAt` 跳过**（无效日期按 +∞ 保守重索引）；索引文本 = `title + proposition + content.slice(0,500)` |
| `updateNote(path, content)` | 单篇增量更新 |
| `removeNote(path)` | 删除条目 |
| `getVector(path)` / `getAllEntries()` / `size` / `clear()` | 查询与维护 |

### 3.3 单例

`getNoteIndexer()`：`new NoteIndexer(getEmbeddingEngine())`。

> 索引内容随笔记/参考资料增删改同步维护（见 [03-notes-module.md](./03-notes-module.md) 与 [04-references-module.md](./04-references-module.md)）。

## 4. 相似检索 `embedding/linker.ts`

### 4.1 `cosineSimilarity(a, b)`

标准余弦相似度；维度不等或零范数返回 0。

### 4.2 类 `NoteLinker`

```ts
suggestLinks(currentNotePath, cursorParagraph, topK = 5): Promise<LinkSuggestion[]>
```

- 引擎未就绪 / 段落为空 → `[]`。
- 向量化当前段落 → 与全部索引条目算相似度 → 排除自身 → 降序取 Top-K。
- `LinkSuggestion = { notePath, title, similarity, snippet }`。

## 5. 知识检索 `utils/knowledge-retrieval.ts`（RAG）

### 5.1 预算常量

| 常量 | 值 | 含义 |
|------|----|------|
| `MAX_FULL_TEXT_LENGTH` | 30000 | 单条命中全文注入上限 |
| `MAX_TOTAL_TEXT_LENGTH` | 50000 | 全部命中全文总预算 |
| `MAX_PREVIEW_LENGTH` | 4000 | 摘要模式单条正文预览上限 |
| `MAX_TOTAL_PREVIEW_LENGTH` | 20000 | 摘要模式全部预览总预算 |

### 5.2 接口

```ts
interface KnowledgeHit {
  kind: 'note' | 'reference'
  path: string
  title: string
  snippet: string    // ≤300 字简短摘要
  preview?: string   // 正文开头预览（默认模式注入）
  fullText?: string  // includeFullText 模式的完整正文
  truncated?: boolean
}

retrieveKnowledge(query, topK = 4, options?: { includeFullText? }): Promise<KnowledgeHit[]>
buildKnowledgeContext(hits): string    // 组装注入用 markdown
retrieveKnowledgeContext(query, topK = 4): Promise<string>  // 一步到位，异常返回 ''
```

### 5.3 流程

1. 引擎就绪 + 索引非空守卫；查询向量化。
2. 全部条目算余弦相似度 → 降序取 Top-K。
3. 逐条组装 hit：
   - 参考资料（`.json` 路径）：`parseReferenceMeta` → 摘要；md 类型额外注入正文预览或全文。
   - 笔记：`parseFrontmatter` → 标题 + 正文预览。
4. 全文/预览按相似度优先级消耗预算，超限截断并标记 `truncated`。
5. `buildKnowledgeContext` 生成注入片段：每条标注 `[笔记]` / `[参考资料]` 前缀；参考资料附提示——"完整全文可通过工具 `read_reference` 读取：`read_reference({ reference_id: "..." })`"。

### 5.4 设计要点

- **默认只注入摘要 + 正文预览**（让 LLM 先判断相关性），需要完整内容时由 LLM 通过 `read_reference` 工具分页读取（借鉴 qwen-code 的 agentic 分页思路，与 [08-llm-api-layer.md](./08-llm-api-layer.md) 配合）。
- 整体 try/catch 兜底：任何异常返回 `''`，保证不阻塞聊天。

## 6. 协作链路

```
App.vue ──► engine.initialize() ──► vaultStore.initIndex() ──► NoteIndexer.buildIndex/updateNote
MainChatPage/BranchChatPage ──► retrieveKnowledgeContext(query) → 拼入 systemPrompt
MarkdownEditor ──► NoteLinker.suggestLinks ──► LinkHint 浮层
```

## 7. 相关测试

- `src/embedding/engine.test.ts`、`model-assets.test.ts`（资源完整性校验）
- `src/utils/knowledge-retrieval.test.ts`

---

> 上一模块 → [09 Skill 系统](./09-skills-system.md)  
> 下一模块 → [11 解析器与序列化工具](./11-parsers-serializers.md)
