# 参考资料 PDF 支持 —— 设计方案

> 状态：设计定稿（2026-08-12）　|　决策来源：与用户探讨收敛（解析器=Rust 后端、时机=上传后立即后台解析、存储=每参考资料独立文件夹 + sidecar、索引=分块多向量）
> 关联调研：见 [pdf-reading-research.md](./pdf-reading-research.md)

---

## 1. 目标

让 PDF 参考资料达到与 md 同等的「可检索、可阅读、可引用」能力，并优雅处理大 PDF（超上下文窗口）。

- 上传后自动解析，用户提问时内容已就绪；
- 文本型 PDF 提取为 Markdown（保留标题/表格/公式，问答质量优于裸文本）；
- 大 PDF 走分块 + 多向量检索，检索命中精确到页；
- 扫描件（无文本层）明确标记失败并提示，OCR 后置。

## 2. 总体架构（四层）

```
┌─────────────────────────────────────────────────────────┐
│ UI 层     ReferenceCard 解析状态徽标 / 失败重试          │
├─────────────────────────────────────────────────────────┤
│ 读取层    read_reference 扩展：pdf 按「页」分页读取       │
├─────────────────────────────────────────────────────────┤
│ 检索层    knowledge-retrieval：分块多向量 → 命中带页码   │
├─────────────────────────────────────────────────────────┤
│ 索引层    NoteIndexer：IndexEntry 支持 chunkIndex        │
├─────────────────────────────────────────────────────────┤
│ 解析层    Tauri command extract_pdf_text（Rust 后端）    │
├─────────────────────────────────────────────────────────┤
│ 存储层    references/{id}/ 文件夹 + sidecar extracted.md │
└─────────────────────────────────────────────────────────┘
```

## 3. 存储结构（每参考资料独立文件夹 + sidecar）

```
{vault}/references/
  {id}/                     # 一个参考资料一个文件夹（自包含单元）
    {id}.json               # 元数据（原 {id}.json 原样移入，见 §4 数据结构）
    {id}.pdf                # 原始文件（原 {id}.pdf 原样移入）
    {id}.extracted.md       # 解析产物：pdf → markdown（可选，parsed 后存在）
```

要点：
- 元数据与原始文件**保持原名**（仅移入文件夹）：迁移 = 建文件夹 + 移文件两步；
- 依赖 `.json` 后缀区分参考资料的逻辑（`read_reference`、`knowledge-retrieval`）无需改动；
- 页边界用 `<!-- page: N -->` 注释标记写入 extracted.md——与项目现有 `<!-- thinking -->`、`<!-- fork-context -->` 区块同一风格，不污染 Markdown 渲染，且能按页定位。

**连带改动（现有代码）**：

| 位置 | 现状 | 改造 |
|------|------|------|
| `reference-serializer.ts` | `getReferenceMetaPath` = `references/{id}.json`；`getReferenceFilePath` = `references/{id}.{ext}` | 改为 `references/{id}/{id}.json`、`references/{id}/{id}.{ext}`，新增 `getReferenceDir` / `getReferenceExtractedPath` |
| `stores/references.ts` `loadAllReferences` | `if (entry.is_dir) continue`（跳过文件夹） | 递归读 `{id}/{id}.json`；兼容根目录旧扁平 `{id}.json` |
| `stores/references.ts` `deleteReference` | 删 meta.path + filePath 两个文件 | 递归删除 `references/{id}/` 整个文件夹 |
| `stores/references.ts` `uploadReference` | 写原始文件 + 元数据 | 创建文件夹 → 写原始文件 → 触发后台解析 |

## 4. 数据结构

### 4.1 ReferenceMeta 扩展（向后兼容，全字段可选）

```ts
export type ReferenceParseStatus = 'pending' | 'parsing' | 'parsed' | 'failed'

export interface ReferenceMeta {
  // ...现有字段不变
  /** PDF 解析状态：pending=待解析 / parsing=解析中 / parsed=已解析 / failed=解析失败 */
  parseStatus?: ReferenceParseStatus
  /** 解析失败原因（扫描件无文本层 / 加密 / 损坏等） */
  parseError?: string
  /** PDF 页数（parsed 后写入） */
  pageCount?: number
  /** 提取产物字符数（用于小/大 PDF 判定与上下文预算） */
  extractedChars?: number
  /** 提取产物路径：{vault}/references/{id}/{id}.extracted.md */
  extractedPath?: string
  /** 提取时间 */
  extractedAt?: string
}
```

> md/png 不写这些字段；解析失败时保留原始文件，用户可重新上传或删除。

### 4.2 索引分块（IndexEntry 扩展）

```ts
export interface IndexEntry {
  path: string          // 参考资料 meta 路径 / 笔记路径（不变）
  chunkIndex?: number   // 新增：分块序号；缺失或 0 = 单块（md/小 pdf/笔记）
  vector: number[]
  indexedAt: number
}
// Map key 由 path 改为 `${path}#${chunkIndex}`（chunkIndex 缺失时仍用 path，兼容存量索引）
```

- 判定小/大 PDF：`extractedChars ÷ 4 ≈ tokens`，超出上下文预算（预留 prompt+回答+10-15% 余量）即分块；
- 分块策略：按页分块，每块约 800-1500 tokens（对齐 NVIDIA/社区结论：按页分块准确率最高且稳定），块与块之间记录页码区间；
- `buildIndexText`：单块用整块文本；md 超长同样受益。

## 5. 解析链路（Rust 后端）

```rust
// src-tauri/src/commands/pdf.rs（新增）
#[tauri::command]
async fn extract_pdf_text(path: String) -> Result<ExtractPdfResult, String>
// 返回 { page_count, markdown, chars }；markdown 由调用方写入 {id}.extracted.md

pub struct ExtractPdfResult {
    page_count: u32,
    markdown: String,   // 页边界以 <!-- page: N --> 分隔
    chars: usize,
}
```

- crate 选型：优先 **pdf_oxide**（MIT、0.8ms/页、内置 Markdown 转换、CJK 支持、3830 份真实 PDF 100% 通过）；集成受阻则回退 **pdf_extract**；
- 在 `references` store 中注册解析任务：`parseStatus='parsing'` → `invoke('extract_pdf_text')` → 成功写 extracted.md 并回填元数据；失败置 `failed + parseError`；
- 卡片 UI：pending（待解析）/ parsing（解析中动画）/ parsed（可问答）/ failed（错误提示 + 重试按钮）。

## 6. 检索与读取

### 6.1 检索（knowledge-retrieval）

- 命中 pdf 块时，`KnowledgeHit` 增加页信息：`pageFrom/pageTo`（chunk 对应页区间）；
- `buildKnowledgeContext` 对 pdf 命中追加「该内容位于第 X-Y 页，可用 read_reference 读取对应页」。

### 6.2 读取（read_reference 扩展）

- 参数语义：pdf 时 `offset/limit` = **起始页（0 起始）/ 页数**（页是模型可预测的自然单位，行号不可预测）；
- 实现：从 `{id}.extracted.md` 按 `<!-- page: N -->` 切分，读取指定页区间文本；
- 返回格式对齐现有：`Showing pages X-Y of N total pages.` + 截断提示；
- 非 pdf 保持现有行分页语义，互不干扰。

## 7. 兼容与迁移

- **旧格式识别**：`references/` 根目录下存在 `{id}.json`（非文件夹）即为旧格式；
- **迁移策略（懒迁移）**：`loadAllReferences` 扫描时遇到旧扁平文件 → 建 `{id}/` 文件夹并移入 `{id}.json` + `{id}.{ext}` → 若为 pdf 则标记 `pending` 待解析；迁移幂等，失败静默保留原文件；
- 存量索引：localStorage 索引 key 变化不影响（旧 key 无 `#chunk` 视为单块），pdf 解析完成后增量重建。

## 8. 实施分期

| 阶段 | 内容 | 验证 |
|------|------|------|
| **P0 存储改造 + 文本 PDF 解析** | 文件夹结构迁移（serializer/store 路径）+ Rust `extract_pdf_text` + 上传后后台解析 + parseStatus UI | 上传文本 PDF → 出 extracted.md → 卡片显示已解析；单测：serializer/store 路径、解析状态机 |
| **P1 检索与读取打通** | read_reference 按页读 pdf；knowledge-retrieval 命中 pdf 注入预览 + 页码提示 | 问答能引用 PDF 具体页；单测：页分页读取、检索命中 |
| **P2 大 PDF 分块多向量** | IndexEntry 加 chunkIndex；按页分块索引；检索命中块带页码 | 100+ 页 PDF 检索准确率与内存；单测：分块索引/检索 |
| **P3 扫描件（后置）** | OCR（Tesseract 随包或多模态模型页级 OCR） | 无文本层 PDF 可检索 |

## 9. 风险与待定

- **pdf_oxide 为较新 crate**：优先验证集成与 CJK 渲染质量，受阻即回退 pdf_extract/pdfium；
- **解析产物文件体积**：大 PDF 的 extracted.md 可能数百 KB，本地存储无压力，但 read_reference 单次读取需字符上限截断（沿用 8000 字符）;
- **分块与现有 localStorage 索引**：`updateNote/removeNote` 需同步支持 chunkIndex 语义，避免旧索引残留；
- **迁移时机**：懒迁移依赖 loadAllReferences 每次全扫，超大 vault 扫描开销可接受（与现有 md 元数据扫描同量级）。
