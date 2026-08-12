# 大模型如何阅读 PDF —— 方案调研

> 调研时间：2026-08-12　|　目的：为「知枝」参考资料（md/pdf/png）提供 PDF 解析方案选型依据
> 关键词：PDF 解析、多模态直读、RAG 分块、Skill vs Tools

---

## 0. TL;DR

- PDF 不是文本容器，而是**图形指令集**（坐标 + 字体 + 渲染命令），LLM 只能吃 token，所以「读 PDF」本质是**先把 PDF 转成模型能理解的形式**。
- 市面主流有**三条路线**：① 多模态模型直接看 PDF 页（厂商原生解析）；② 本地工具把 PDF 提取为文本/Markdown 再喂给模型；③ RAG——先解析分块、向量索引，再按需检索（大 PDF 的标配）。
- **小 PDF 与大 PDF 的本质区别 = 是否超出模型上下文窗口**。小 PDF 可整本直读；大 PDF 必须分块/摘要/检索，否则截断丢信息、成本与延迟飙升。
- **纯 Skill 不能直接读 PDF**（SKILL.md 只是提示词与流程约定，无法解析二进制），但可以编排提取工具或引导分块检索流程；**真正的解析必须落到本地 Tools**（解析库/OCR/分块索引）。
- 对知枝项目：**短期**用 pdf.js 或 Rust crate（pdf_oxide/pdf_extract）提取文本 → 复用现有 `read_reference` 工具与 `knowledge-retrieval` 链路；**中期**对扫描件引入 OCR；**大 PDF** 走「分块 + 现有本地向量索引」的 RAG 路线。

---

## 1. 为什么「读 PDF」是个问题

PDF 是 1992 年诞生的**版式渲染格式**：页面里只有字符的坐标、字体、路径和渲染指令，没有「段落」「表格」「标题」这些语义概念。直接 `cat` 或按字节读 PDF 对 LLM 毫无意义，必须经过**解析（extraction）→ 结构化（layout understanding）→ 表示（text/markdown/tokens）** 三步。

典型解析难点（社区共识，RAG 项目 90% 的失败源于解析阶段信息丢失）：

| 难点 | 说明 |
|------|------|
| 多栏排版 | 双栏论文按物理行切分时左右栏交错，前言不搭后语 |
| 表格 | 格子内文本按行读出，行列关系彻底丢失；跨页表格更难 |
| 公式 | 数学公式变成散乱字符（`∫` 变 `f r o m`） |
| 扫描件 | 无文本层，必须 OCR；带权限锁/加密的 PDF 无法提取 |

---

## 2. 三大技术路线对比

| 路线 | 代表方案 | 优点 | 缺点 | 适合场景 |
|------|----------|------|------|----------|
| **A. 多模态直读** | Gemini / GPT-4o / Claude 原生 PDF 上传 | 开箱即用、保留版式与图表、扫描件也能看 | Token 消耗不透明且贵（常见 3 倍于纯文本）；受上下文窗口限制；厂商黑箱 | 少量文档、带复杂图表/公式的文档、快速体验 |
| **B. 本地提取文本** | PyMuPDF / pdfplumber / pdf.js / pdf_oxide(Rust) / Docling / Marker / MinerU | 可控、便宜（纯文本页 token 极少）、离线 | 需要选型与调参；扫描件需额外 OCR；复杂版面质量依赖解析器 | 文本型 PDF、批量入库、成本敏感 |
| **C. RAG（分块+检索）** | 解析 → 分块 → 向量化 → 检索 → 生成（Docling/LlamaIndex/自建） | 大 PDF 唯一可行解、按需取上下文、token 省 90%+ | 链路复杂、需维护索引、检索质量依赖分块策略 | 大 PDF、知识库问答、多文档 |

> 参考数字（社区实测，会随版本变化）：
> - 25 页 PDF 用 GPT-4o 直接读实测约消耗 **132,500 tokens**，其中 OCR/视觉部分占 ~71%——"原生支持"其实是厂商在后台跑 OCR + 版面分析 + 切片的整套流水线。
> - 图片 token 计费（做视觉直读时的成本参考）：OpenAI 约 85 base + ~170/512×512 tile；Claude 约 `1.15 × (宽×高/750)`；Gemini 小图固定 258 tokens/张。
> - 纯文本提取则便宜得多：**1 页 ≈ 500-700 tokens**，与图片直读相差一个数量级。

---

## 3. 路线 A：多模态模型直接读 PDF

**原理**：厂商在 API 侧把 PDF 逐页转成图像 token（或做内部 OCR），模型用视觉能力理解整页内容。Gemini 官方宣称支持长达 1000 页的文档；GPT-4o / Claude / Gemini 2026 均已原生支持 PDF 输入。

**两种调用方式**（以 Gemini 为例，OpenAI/Claude 类似）：
- **inline（内嵌 base64）**：适合小文件、单次处理；
- **Files API（先上传再引用）**：适合大 PDF、多轮对话，减少请求体与带宽。

**实践要点**：
- 上传前把页面旋转正、避免模糊，识别率更高；
- 小 PDF 可以 inline，大 PDF 必须走 Files API；
- 成本敏感时不要无脑直读——纯文本页提成文本再送，视觉直读只留给图表页。

**对本项目的启示**：若 API 走 OpenAI/Anthropic/Gemini 兼容层，需确认所选模型与 provider 是否支持 PDF 输入（多数 SDK 只支持 image/text），且直读大 PDF 的成本不可控。作为短期兜底可行，不建议作为大 PDF 主方案。

---

## 4. 路线 B：本地提取文本 / Markdown

**关键结论（2025-2026 多个基准）**：PDF → **Markdown** 后喂给模型，比直接喂 PDF 或裸文本**回答质量提升 20-40%**——Markdown 保留标题层级、表格、引用这些 LLM 天生擅长的结构。

### 4.1 规则型解析器（快、离线、无需 GPU）

| 方案 | 语言/环境 | 特点 | 备注 |
|------|-----------|------|------|
| **PyMuPDF (fitz)** | Python | 综合最快最准（~2ms/页，13× 于 pdfplumber），文本+布局+坐标 | **AGPL 协议**（商用注意）；可转 Markdown（pymupdf4llm） |
| **pdfplumber** | Python | 布局分析最精细（表格/坐标/字符级），~22ms/页 | 慢、内存高；适合结构化提取 |
| **pdfminer.six** | Python | 底层库，~17ms/页，通过率 98.8% | MIT |
| **pdf.js** | JS（浏览器/WebView） | Mozilla 出品，浏览器端渲染+文本提取 | **非常适合 Tauri/Electron 前端**；扫描件弱 |
| **pypdfium2** | Python | PDFium（Chrome 同源）封装，~1ms/页，36× 于 pdfplumber | Apache-2.0；对齐浏览器目标 |
| **pdf_oxide** | Rust / Python | 0.8ms/页、3830 份真实 PDF 100% 通过、内置 Markdown 转换 | **MIT**；Rust 侧最快；Rust 生态里 pdf_extract(91.5%)/lopdf(80.2%) 弱一些 |
| **Poppler / pdftotext** | 命令行 | 快、成熟、跨平台 | 需随系统安装，配置繁琐 |
| **PDFium / Apache PDFBox** | C++ / Java | 成熟、可定制 | 集成成本高 |

> 跨类别基准（arXiv 2410.09871 对 10 种工具、6 类文档的评测）：**纯文本提取 PyMuPDF 与 pypdfium 综合最优**，但在 Scientific/Patent 等复杂类别所有规则型解析器都挣扎，需上学习型方案。

### 4.2 学习型（布局理解 / ML 模型）解析器——复杂版面、扫描件

| 方案 | 定位 | 协议 | 备注 |
|------|------|------|------|
| **Docling**（IBM） | 企业级多格式文档流水线（PDF/DOCX/PPTX/XLSX…），输出 Markdown/JSON/DoclingDocument | MIT | 与 LlamaIndex/LangChain 深度集成；**RAG 社区首选**；中文仍标"实验性" |
| **Marker** | 轻量快速 PDF→Markdown，GPU 加速 25 页/秒 | GPL 代码 + Open RAIL-M 权重 | 表格/公式强；中文等多语言支持弱于 MinerU/Docling |
| **MinerU**（上海AI Lab） | 高精度**中文**文档解析（学术/财报），过滤页眉页脚强 | Apache-2.0 衍生 | 中文场景首选；自带 Web/CLI/SDK |
| **Nougat**（Meta） | 学术 PDF → Markdown，公式（LaTeX）强 | MIT | 慢（~3.8s/页），专攻论文 |
| **olmOCR**（AI2） | 7B VLM 把 PDF 页转干净线性化文本，100 万页约 $190 | Apache-2.0 | 大规模批量处理利器 |

**选型口诀**：纯文本/简单版面 → 规则型（PyMuPDF / pdf.js / pdf_oxide）；复杂表格/公式 → Docling / Marker；中文复杂文档 → MinerU；扫描件 → OCR（Tesseract / 学习型 OCR）或直接交给多模态模型看页。

---

## 5. 路线 C：RAG——大 PDF 的标配

### 5.1 标准流水线

```
PDF → 解析（规则型/学习型）→ Markdown/结构化文本
     → 分块（chunking）→ 向量化（embedding）→ 向量库/索引
     → 用户提问 → 检索 Top-K 相关块 → 拼进上下文 → LLM 生成（带引用）
```

### 5.2 分块（chunking）策略——小 PDF 与大 PDF 分野的核心

| 策略 | 做法 | 适用 |
|------|------|------|
| 固定大小（token 分块） | 128-2048 tokens/块，重叠 10-20% | 简单场景；factoid 类问答用小块（256-512 tokens） |
| 按页分块 | 每页一块 | NVIDIA 实测**平均准确率最高**（0.648），且稳定（标准差 0.107） |
| 按章节/标题分块 | 按 H2/H3 结构切，块内语义完整 | 复杂分析类问答（1024+ tokens 或整节）；Azure/社区推荐 |
| 语义分块 | 布局感知 + 标题层级 + 段落边界自适应聚合 | 长文档质量最好；100+ 页财报实测断裂从 19 处降到 1 处 |

要点：
- **分块不是越大越好**：小块召回准（factoid），大块上下文连贯（分析题），按内容类型混用。
- 块过小会把表格/段落切碎，块过大浪费 token 且检索噪声大。
- 超长文档（>100 页）还需考虑**向量压缩（量化）与内存**：实测 300 页 PDF 基线会 OOM，优化后可降到 ~8.7GB。

### 5.3 大 PDF 的替代思路（不完全依赖检索）

- **分页直读 + 多轮聚合**：把 1000 页 PDF 分页喂给 Gemini 这类超长上下文模型，先各页摘要再汇总（厂商支持到 1000 页）。
- **文档级摘要树（map-reduce）**：先每章摘要，再摘要之摘要，最后回答。
- 这些仍是"本地/厂商解析 + LLM"的组合，只是把上下文管理从"一次全量"换成"分层聚合"。

---

## 6. 小 PDF vs 大 PDF —— 一张表说清

**判定标准**：解析出的文本（token 数）是否超出模型上下文窗口。粗算：**1 页 ≈ 500-700 tokens**；GPT-4o 128K ≈ 200 页，Claude 200K ≈ 300 页，Gemini 1M-2M ≈ 1500-3000 页。判断时预留 prompt + 回答 + 10-15% 安全余量。

| 维度 | 小 PDF（通常 <50 页或 <10K tokens） | 大 PDF（通常 >100 页或超上下文） |
|------|------------------------------------|----------------------------------|
| 上下文处理 | 整本直接塞进上下文（一次摘要/问答/结构化提取） | 必须分块 + 检索，或分层摘要聚合 |
| 解析成本 | 低，纯文本页 token 极少 | 高（直读可 3× 纯文本成本）；OCR 部分常占大头 |
| 延迟 | 一次请求 | 多请求/检索 + 多块拼接，延迟显著上升 |
| 质量风险 | 低（全量信息可见） | 截断丢信息、跨块上下文断裂、检索不到目标内容 |
| 失败模式 | 基本无 | 内存/索引 OOM、检索召回低、答案碎片化 |
| 推荐路线 | A（直读）或 B（提取后直喂） | C（RAG），或分页直读+聚合 |
| 关键调优点 | 无需调优 | 分块策略、块大小、重叠率、向量索引、检索 Top-K |

> 社区结论（NVIDIA / Azure / 多篇实测）：**分块策略直接决定检索与回答质量**，固定窗口最省事但不最优；按页/按章节分块普遍更好；100 页是多数 RAG 系统的性能分水岭，需对内存与延迟专门优化。

---

## 7. Skill 能实现吗？还是要本地 Tools？

### 7.1 概念边界（以知枝/TRAE 的语境）

| 概念 | 本质 | 能不能"读 PDF" |
|------|------|----------------|
| **Skill**（如 `src/skills/*/SKILL.md`） | 提示词 + 操作约定 + 工具编排说明，不携带可执行代码 | **不能直接读**。PDF 是二进制，SKILL.md 本身解析不了；它只能描述"用什么工具、按什么步骤" |
| **本地 Tool / 后端命令** | 真实可执行的解析代码（JS 库 / Rust 命令） | **能**。这才是提取文本/图片、做分块索引的执行体 |
| **多模态模型能力** | 模型自身视觉/PDF 原生支持 | 能"读"（转 token），但属于模型能力而非 Skill/Tool |

### 7.2 结论

- **纯 Skill 无法让模型读懂 PDF**。Skill 可以做的三件事：
  1. **编排**已有的提取工具（如调用 `read_reference` 读 md、调 OCR/解析命令读 pdf）——前提是这些工具存在；
  2. 若 API 支持，Skill 约定"把 PDF 页作为图片/文档直传模型"的流程；
  3. 对**大 PDF**，Skill 描述"先分块 → 检索 → 引用作答"的 RAG 工作流。
- **必须落到本地 Tools 的场景**：
  1. 文本型 PDF 提取（pdf.js / Rust crate / 解析库）——**绕不开的第一步**；
  2. 扫描件 OCR（Tesseract 或学习型 OCR）；
  3. 大 PDF 分块 + 向量索引 + 检索（本地 embedding + 向量库）。
- **推荐架构**：`本地 Tools 做提取/分块/检索（确定性、便宜、可控） + LLM 做理解与生成（Skill 负责约定输入输出与流程）`。二者互补，不是二选一。

### 7.3 与知枝现有架构的对照

知枝已有（可复用）：
- 参考资料系统（`references` store）：已支持上传 **md/pdf/png**，但 **pdf 目前只存储、不解析**；
- `read_reference` 工具（`src/api/tools/read-reference.ts`）：md 读全文、png 转 base64，**尚未支持 pdf**；
- 本地 embedding（all-MiniLM-L6-v2）+ 向量索引（`src/embedding/*`）+ `knowledge-retrieval`：已是 RAG 雏形；
- Rust 后端命令（`src-tauri/src/commands/vault.rs`）：已有 `write_file_bytes` 等文件操作。

落地建议（按成本从低到高）：

| 阶段 | 方案 | 工作量 | 说明 |
|------|------|--------|------|
| **P0 文本 PDF 快速可用** | 前端集成 **pdf.js**（或 Rust 侧 `pdf_oxide`，MIT、带 Markdown 转换），新增 Rust 命令 `extract_pdf_text(path) → markdown`，接入 `read_reference` 与 references 上传流程 | 中 | 覆盖大多数"电子文档导出型" PDF；对齐项目现有"参考资料入库 → 向量索引 → RAG 检索"链路 |
| **P1 小 PDF 直读问答** | 提取后文本 ≤ 上下文窗口时，直接走现有 `chatWithTools` / `knowledge-retrieval` | 低 | 复用现有能力，无需新链路 |
| **P2 扫描件** | 引入 OCR（Tesseract 随包或调用多模态模型 OCR 页） | 高 | 优先级可后置；无文本层时明确提示用户 |
| **P3 大 PDF** | 解析后**按章节/按页分块** → 复用本地 `indexer` 向量化 → 检索 Top-K 注入 system prompt | 中 | 与现有 `knowledge-retrieval` 同构，主要新增"分块"模块；参考 5.2 分块策略 |

---

## 8. 参考来源

- MinerU vs Docling vs Marker 开源文档解析工具对比：https://juejin.cn/post/7636666943860572170
- Marker vs Docling（PDF→Markdown 选型）：https://www.file2markdown.ai/blog/marker-vs-docling
- 论文《Developing RAG based LLM Systems from PDFs: An Experience Report》：https://arxiv.org/pdf/2410.15944.pdf
- 2026 文档喂给 ChatGPT/Claude/Gemini 的准备指南（上下文窗口/分块）：https://blazedocs.io/blog/prepare-documents-for-chatgpt-claude
- RAG 精准问答：PDF 解析 + Docling 工作流：https://blog.csdn.net/RickyIT/article/details/161777660
- Gemini API 文件解读（原生 PDF 支持 1000 页、inline vs Files API）：https://ai.google.dev/gemini-api/docs/document-processing
- 大模型读 PDF 的 Token 黑箱成本（GPT-4o 实测）：https://bbs.csdn.net/weixin_30080745/article/details/100157171
- PDF 超 100 页的分块/向量压缩/上下文缝合三阶优化：https://blog.csdn.net/AlgoChat/article/details/161051310
- Azure AI Search 文档分块指南：https://learn.microsoft.com/en-au/azure/search/vector-search-how-to-chunk-documents
- NVIDIA：Finding the Best Chunking Strategy for Accurate AI Responses（页级分块最高准确率）：https://developer.nvidia.com/blog/finding-the-best-chunking-strategy-for-accurate-ai-responses
- 论文《A Comparative Study of PDF Parsing Tools Across Diverse Document Categories》（PyMuPDF/pypdfium 最优）：https://arxiv.org/pdf/2410.09871v2.pdf
- pypdfium2 vs pdfplumber 基准（36× 提速）：https://github.com/willhea/civic_tech_appropriations_bills/issues/38
- pdf_oxide（Rust 最快 PDF 库，0.8ms/页、MIT、内置 Markdown）：https://docs.rs/pdf_oxide/0.3.76/pdf_oxide/
- olmOCR（VLM 把 PDF 页转文本，100 万页 $190）：https://arxiv.org/html/2502.18443v1
- Gemini 图片 Token 计费机制（258 tokens/图）：https://dev.to/kushaagr/can-image-tokens-cost-less-than-text-tokens-explaining-gemini-api-image-token-economics-422c
- Multimodal inputs 模型能力快照（2026-06）：https://github.com/tonyx1998/modern-ai-guide/blob/main/docs/01-foundations/multimodal-inputs.md
