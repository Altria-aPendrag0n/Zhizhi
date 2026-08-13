# 04 · 参考资料模块

> 本模块覆盖：参考资料（md / pdf / png）的上传、编辑、删除与预览，以及元数据序列化。
> 相关代码：`study-thread/src/components/references/`、`study-thread/src/stores/references.ts`、`study-thread/src/utils/reference-serializer.ts`。

---

## 1. 模块职责

- 管理 `<vault>/references/` 目录下的参考资料，每个参考资料一个**自包含文件夹**（原始文件 + 元数据 JSON + pdf 提取产物）。
- 支持三种类型：`md`（可全文检索/工具读取）、`pdf`（上传后后台解析为 Markdown，可检索/按页读取/按章节分块索引）、`png`（图片预览）。
- 上传/编辑/解析后**尽力而为地同步向量索引**（md 全文嵌入，小 pdf 用提取正文单块嵌入，大 pdf 按章节分块多向量），供 RAG 检索与 `read_reference` 工具使用（见 [08]/[10] 模块）。

## 2. 数据模型（`src/types/index.ts`）

```ts
type ReferenceType = 'md' | 'pdf' | 'png'
type ReferenceParseStatus = 'pending' | 'parsing' | 'parsed' | 'failed'

interface ReferenceMeta {
  id: string        // uuid，用于文件命名
  path: string      // 元数据 JSON 路径：{vault}/references/{id}/{id}.json
  title: string
  description?: string
  tags: string[]
  fileType: ReferenceType
  fileName: string  // 原始上传文件名
  filePath: string  // 实际文件路径：{vault}/references/{id}/{id}.{ext}
  created: string   // ISO
  updated: string   // ISO
  // —— pdf 解析字段（向后兼容，可选）——
  parseStatus?: ReferenceParseStatus  // pending/parsing/parsed/failed
  parseError?: string                 // 解析失败原因（扫描件无文本层等）
  pageCount?: number                  // pdf 页数（parsed 后写入）
  extractedChars?: number             // 提取产物字符数
  extractedPath?: string              // {vault}/references/{id}/{id}.extracted.md
  extractedAt?: string                // 提取时间
}

interface Reference extends ReferenceMeta {
  previewText?: string  // 预览：md 正文 / png base64 data URL / pdf 无
}
```

## 3. 目录结构约定（`utils/reference-serializer.ts`）

```
{vault}/references/
└── {id}/                  # 一个参考资料一个自包含文件夹
    ├── {id}.json          # 元数据
    ├── {id}.{ext}         # 原始文件（md / pdf / png）
    └── {id}.extracted.md  # pdf 解析产物（parsed 后存在，含 <!-- page: N --> 页标记）
```

| 函数 | 说明 |
|------|------|
| `generateReferenceId()` | 优先 `crypto.randomUUID()`，失败回退时间戳 + 随机数 |
| `getReferencesDir(vaultPath)` | `{vault}/references` |
| `getReferenceDir(vaultPath, id)` | `{vault}/references/{id}`（自包含文件夹） |
| `getReferenceMetaPath(vaultPath, id)` | `{vault}/references/{id}/{id}.json` |
| `getReferenceFilePath(vaultPath, id, fileType)` | `{vault}/references/{id}/{id}.{ext}` |
| `getReferenceExtractedPath(vaultPath, id)` | `{vault}/references/{id}/{id}.extracted.md` |
| `detectReferenceType(fileName)` | 按扩展名识别 `md/pdf/png`（大小写不敏感），未知返回 `null` |
| `sanitizeFileName(name)` | 清理非法字符，**保留扩展名**，空白转 `_`，截断 80 字符 |
| `serializeReferenceMeta(meta)` | JSON 字符串（缩进 2） |
| `parseReferenceMeta(json)` | 解析并校验：title 兜底"未命名参考资料"、tags 兜底 `[]`、**fileType 非法时抛错**；透传 pdf 解析字段 |

## 4. Store（`stores/references.ts`）

| 状态 | 说明 |
|------|------|
| `references: ReferenceMeta[]` | 按 updated 降序 |
| `isLoading` / `currentVaultPath` | 加载状态与当前 vault |

| 动作 | 说明 |
|------|------|
| `loadAllReferences(vaultPath)` | 递归读取 `references/{id}/{id}.json`；兼容旧扁平 `references/{id}.json` 并**懒迁移**到文件夹；损坏元数据跳过；目录不存在时静默置空 |
| `uploadReference(vaultPath, file)` | `detectReferenceType` → 建文件夹 → 写原始文件 + 元数据 → 同步向量索引；pdf 上传后**后台触发解析**（不阻塞返回） |
| `updateReference(meta)` | 更新 `updated` 时间并写回 JSON → 重算向量索引 |
| `deleteReference(metaPath)` | 递归删除整个自包含文件夹（含提取产物）→ 移除向量索引 |
| `loadReferencePreview(meta)` | md → 返回正文；png → base64 data URL；pdf → `''` |
| `parseReference(meta, vaultPath)` | pdf 解析状态机：`pending → parsing → parsed/failed`；成功写 `{id}.extracted.md` 并回填 pageCount/extractedChars，失败写 parseError |
| `retryParseReference(metaPath)` | 重新解析失败的 pdf（UI「重试」按钮） |

辅助函数：
- `toReferenceTitle(fileName)`：去掉扩展名的清理文件名作为标题。
- `buildIndexText(meta)`：`title + description + tags + md 正文`（或小 pdf 的提取正文）。
- `refreshIndex(meta)`：小 pdf/md 单块 `updateNote`；**大 pdf（`extractedChars > PDF_CHUNK_MIN_CHARS`）按章节 `chunkPdfByChapters` 分块后 `updateChunks` 多向量索引**（无标题退化按页）。
- `bytesToBase64(bytes)`：分块（0x8000）拼接避免大数组栈溢出。

> 注意：上传/编辑/解析后的索引同步是**尽力而为**（try/catch 静默），失败不影响文件操作本身。

## 5. 组件层（`src/components/references/`）

### 5.1 `ReferenceList.vue` — 列表容器

- props：`references: ReferenceMeta[]`、`selectedPath?`；emits：`select(path)`、`upload(files: File[])`、`delete(path)`。
- 隐藏 file input（accept `.md,.pdf,.png`，`multiple` 支持**一次多选**），`handleFileChange` 把全部选中文件组成数组 emit 后**清空 input**（允许重复选同一文件）。NotesPage 侧逐文件调用 `uploadReference` 落盘并汇总 toast 结果。
- 搜索过滤（标题/描述/标签）+ updated 排序；右键删除菜单（Teleport，逻辑与 NoteList 相同）。

### 5.2 `ReferenceCard.vue` — 卡片

- props：`reference: ReferenceMeta`、`isSelected?`；emits：`select(path)`、`contextmenu(event)`、`retry-parse(path)`。
- 类型徽标按 fileType 着色：md 绿 / pdf 棕 / png 蓝；展示标题、描述、标签、短日期。
- pdf 额外展示**解析状态徽标**：pending（待解析）/ parsing（解析中）/ parsed（已解析）/ failed（解析失败，附「重试」按钮触发 `retry-parse`）。

### 5.3 `ReferenceEditDialog.vue` — 编辑弹窗

- props：`visible`、`reference: ReferenceMeta | null`；emits：`close`、`save(meta)`、`delete(path)`。
- 表单：标题/描述/标签（逗号或顿号分隔）；`canSave` 要求标题非空。
- 内容预览：md 纯文本 / png 图片 / pdf 提示。
- 通过 `@tauri-apps/plugin-opener` 的 `openPath` 打开原文件；不可用时 toast 提示"当前环境不支持打开文件"。

## 6. 协作链路

```
NotesPage（参考资料 tab）
  ├─ ReferenceList（上传/搜索/删除）
  ├─ ReferenceEditDialog（编辑/预览/打开原文件）
  └─ referencesStore
       ├─ writeFileBytes → Rust write_file_bytes          [13 Rust 后端]
       ├─ pdf 上传 → extractPdfText → Rust extract_pdf_text（本地 pdf_oxide 解析）
       ├─ 解析成功 → writeFile({id}.extracted.md) + 回填元数据
       └─ getNoteIndexer().updateNote / updateChunks → 向量索引  [10 Embedding]

LLM 侧：knowledge-retrieval 检索命中（pdf 块带章节/页码）→ read_reference 按页读取 [08/10]
```

## 7. 相关测试

- `src/stores/references.test.ts`
- `src/utils/reference-serializer.test.ts`
- `src/utils/pdf-chunk.test.ts`
- `src/components/references/ReferenceCard.test.ts`、`ReferenceEditDialog.test.ts`、`ReferenceList.test.ts`
- `src/api/tools/read-reference.test.ts`（跨模块工具测试）

---

> 上一模块 → [03 笔记模块](./03-notes-module.md)  
> 下一模块 → [05 Markdown 编辑器](./05-editor-module.md)
