# 04 · 参考资料模块

> 本模块覆盖：参考资料（md / pdf / png）的上传、编辑、删除与预览，以及元数据序列化。
> 相关代码：`study-thread/src/components/references/`、`study-thread/src/stores/references.ts`、`study-thread/src/utils/reference-serializer.ts`。

---

## 1. 模块职责

- 管理 `<vault>/references/` 目录下的参考资料：原始文件 + 元数据 JSON（两者分离）。
- 支持三种类型：`md`（可全文检索/工具读取）、`pdf`（仅元数据）、`png`（图片预览）。
- 上传/编辑后**尽力而为地同步向量索引**（md 全文嵌入，其余仅元数据），供 RAG 检索与 `read_reference` 工具使用（见 [08]/[10] 模块）。

## 2. 数据模型（`src/types/index.ts`）

```ts
type ReferenceType = 'md' | 'pdf' | 'png'

interface ReferenceMeta {
  id: string        // uuid，用于文件命名
  path: string      // 元数据 JSON 路径：{vault}/references/{id}.json
  title: string
  description?: string
  tags: string[]
  fileType: ReferenceType
  fileName: string  // 原始上传文件名
  filePath: string  // 实际文件路径：{vault}/references/{id}.{ext}
  created: string   // ISO
  updated: string   // ISO
}

interface Reference extends ReferenceMeta {
  previewText?: string  // 预览：md 正文 / png base64 data URL / pdf 无
}
```

## 3. 目录结构约定（`utils/reference-serializer.ts`）

```
{vault}/references/
├── {id}.json        # 元数据（title/description/tags/fileType/fileName/filePath/时间）
└── {id}.{ext}       # 实际文件（md / pdf / png）
```

| 函数 | 说明 |
|------|------|
| `generateReferenceId()` | 优先 `crypto.randomUUID()`，失败回退时间戳 + 随机数 |
| `getReferencesDir(vaultPath)` | `{vault}/references` |
| `getReferenceMetaPath(vaultPath, id)` | `{vault}/references/{id}.json` |
| `getReferenceFilePath(vaultPath, id, fileType)` | `{vault}/references/{id}.{ext}` |
| `detectReferenceType(fileName)` | 按扩展名识别 `md/pdf/png`（大小写不敏感），未知返回 `null` |
| `sanitizeFileName(name)` | 清理非法字符，**保留扩展名**，空白转 `_`，截断 80 字符 |
| `serializeReferenceMeta(meta)` | JSON 字符串（缩进 2） |
| `parseReferenceMeta(json)` | 解析并校验：title 兜底"未命名参考资料"、tags 兜底 `[]`、**fileType 非法时抛错** |

## 4. Store（`stores/references.ts`）

| 状态 | 说明 |
|------|------|
| `references: ReferenceMeta[]` | 按 updated 降序 |
| `isLoading` / `currentVaultPath` | 加载状态与当前 vault |

| 动作 | 说明 |
|------|------|
| `loadAllReferences(vaultPath)` | 读取 `references/*.json` 列表；损坏的元数据跳过；目录不存在时静默置空 |
| `uploadReference(vaultPath, file)` | `detectReferenceType` → 生成 id → `writeFileBytes` 写原始文件 → 写元数据 JSON → 同步向量索引 |
| `updateReference(meta)` | 更新 `updated` 时间并写回 JSON → 重算向量索引 |
| `deleteReference(metaPath)` | 删除元数据 JSON + 原始文件（各自独立容错）→ 移除向量索引 |
| `loadReferencePreview(meta)` | md → 返回正文；png → base64 data URL；pdf → `''` |

辅助函数：
- `toReferenceTitle(fileName)`：去掉扩展名的清理文件名作为标题。
- `buildIndexText(meta)`：`title + description + tags + md 正文`。
- `bytesToBase64(bytes)`：分块（0x8000）拼接避免大数组栈溢出。

> 注意：上传/更新后的索引同步是**尽力而为**（try/catch 静默），失败不影响文件操作本身。

## 5. 组件层（`src/components/references/`）

### 5.1 `ReferenceList.vue` — 列表容器

- props：`references: ReferenceMeta[]`、`selectedPath?`；emits：`select(path)`、`upload(files: File[])`、`delete(path)`。
- 隐藏 file input（accept `.md,.pdf,.png`，`multiple` 支持**一次多选**），`handleFileChange` 把全部选中文件组成数组 emit 后**清空 input**（允许重复选同一文件）。NotesPage 侧逐文件调用 `uploadReference` 落盘并汇总 toast 结果。
- 搜索过滤（标题/描述/标签）+ updated 排序；右键删除菜单（Teleport，逻辑与 NoteList 相同）。

### 5.2 `ReferenceCard.vue` — 卡片

- props：`reference: ReferenceMeta`、`isSelected?`；emits：`select(path)`、`contextmenu(event)`。
- 类型徽标按 fileType 着色：md 绿 / pdf 棕 / png 蓝；展示标题、描述、标签、短日期。

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
       ├─ writeFileBytes → Rust write_file_bytes     [13 Rust 后端]
       └─ getNoteIndexer().updateNote → 向量索引      [10 Embedding]

LLM 侧：knowledge-retrieval 检索命中 → read_reference 工具按需读取全文 [08/10]
```

## 7. 相关测试

- `src/stores/references.test.ts`
- `src/utils/reference-serializer.test.ts`
- `src/components/references/ReferenceCard.test.ts`、`ReferenceEditDialog.test.ts`、`ReferenceList.test.ts`
- `src/api/tools/read-reference.test.ts`（跨模块工具测试）

---

> 上一模块 → [03 笔记模块](./03-notes-module.md)  
> 下一模块 → [05 Markdown 编辑器](./05-editor-module.md)
