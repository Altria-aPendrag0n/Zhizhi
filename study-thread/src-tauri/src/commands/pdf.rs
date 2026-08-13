use serde::Serialize;
use pdf_oxide::PdfDocument;
use pdf_oxide::converters::ConversionOptions;

/// PDF 文本提取结果（提取产物 Markdown 由前端写入 {id}.extracted.md）
#[derive(Debug, Serialize)]
pub struct ExtractPdfResult {
    /// PDF 页数
    page_count: usize,
    /// 提取出的 Markdown 文本（页边界以 `<!-- page: N -->` 标记）
    markdown: String,
    /// 提取产物字符数（前端用于小/大 PDF 判定与上下文预算）
    chars: usize,
}

/// 解析本地 PDF 文件为带页标记的 Markdown 文本。
///
/// 完全在本地执行，不联网、不上传数据。逐页提取并插入 `<!-- page: N -->`
/// 页边界标记，前端据此按页读取 / 按章节分块。扫描件（无文本层）会返回错误。
#[tauri::command]
pub fn extract_pdf_text(path: String) -> Result<ExtractPdfResult, String> {
    let doc = PdfDocument::open(&path).map_err(|e| format!("打开 PDF 失败: {e}"))?;
    let page_count = doc.page_count().map_err(|e| format!("读取页数失败: {e}"))?;
    if page_count == 0 {
        return Err("该 PDF 没有可读取的页面（文件可能损坏）".to_string());
    }

    // 启用标题检测，尽量保留 PDF 中的标题层级，便于后续按章节分块
    let options = ConversionOptions {
        detect_headings: true,
        ..Default::default()
    };

    let mut markdown = String::new();
    let mut has_content = false;
    for i in 0..page_count {
        let page_md = doc
            .to_markdown(i, &options)
            .map_err(|e| format!("解析第 {} 页失败: {e}", i + 1))?;
        if !page_md.trim().is_empty() {
            has_content = true;
        }
        if i > 0 {
            markdown.push_str("\n\n");
        }
        markdown.push_str(&format!("<!-- page: {} -->\n", i + 1));
        markdown.push_str(&page_md);
    }

    // 无任何文本内容：通常是扫描件（纯图片 PDF），暂不支持 OCR，返回明确错误
    if !has_content {
        return Err("该 PDF 无可提取的文本内容（可能是扫描件，暂不支持 OCR）".to_string());
    }

    let chars = markdown.chars().count();

    Ok(ExtractPdfResult {
        page_count,
        markdown,
        chars,
    })
}
