/**
 * 图片压缩工具
 *
 * 图片转笔记前将大图（拍照原图通常 3-10MB）压缩为可控体积，减少 token 消耗与请求失败风险。
 * 采用 Canvas 缩放 + JPEG 编码；任一环节失败降级返回原图 base64，保证功能可用。
 */

/** 默认最长边（OpenAI 视觉模型官方建议 1568px 内） */
export const DEFAULT_MAX_EDGE = 1568
/** 默认 JPEG 质量 */
export const DEFAULT_JPEG_QUALITY = 0.85

export interface CompressedImage {
  mimeType: string
  /** base64 编码的图片数据（不含 data: 前缀） */
  base64: string
}

/**
 * 计算等比缩放后的目标尺寸（最长边对齐 maxEdge）。
 * 原图最长边不超过 maxEdge 时返回原始尺寸；maxEdge/尺寸非法时原样返回。
 */
export function computeScaledDimensions(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  if (width <= 0 || height <= 0 || maxEdge <= 0) return { width, height }
  const longest = Math.max(width, height)
  if (longest <= maxEdge) return { width, height }
  const ratio = maxEdge / longest
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  }
}

/** 从 File 读取原始 base64（不含 data: 前缀）与 mimeType */
export function fileToBase64(file: File): Promise<CompressedImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('读取图片文件失败'))
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('读取图片文件失败'))
        return
      }
      const commaIndex = result.indexOf(',')
      if (commaIndex < 0) {
        reject(new Error('读取图片文件失败'))
        return
      }
      resolve({ mimeType: file.type || 'image/png', base64: result.slice(commaIndex + 1) })
    }
    reader.readAsDataURL(file)
  })
}

/** 加载图片位图，返回位图与原始尺寸（createImageBitmap 不可用时用 Image + objectURL 兜底） */
async function loadBitmap(file: File): Promise<{ bitmap: CanvasImageSource; width: number; height: number }> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file)
    return { bitmap, width: bitmap.width, height: bitmap.height }
  }
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.decoding = 'async'
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('图片解码失败'))
      image.src = url
    })
    return { bitmap: image, width: image.naturalWidth, height: image.naturalHeight }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * 压缩图片为 JPEG base64。
 *
 * @param file - 用户选择的图片文件
 * @param maxEdge - 压缩后最长边（默认 1568px）
 * @param quality - JPEG 质量（0-1，默认 0.85）
 * @returns 压缩后的图片数据；压缩失败时降级返回原图 base64（mimeType 保持原始类型）
 */
export async function compressImageFile(
  file: File,
  maxEdge = DEFAULT_MAX_EDGE,
  quality = DEFAULT_JPEG_QUALITY,
): Promise<CompressedImage> {
  try {
    const { bitmap, width, height } = await loadBitmap(file)
    const target = computeScaledDimensions(width, height, maxEdge)

    const canvas = document.createElement('canvas')
    canvas.width = target.width
    canvas.height = target.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('无法创建画布上下文')

    // JPEG 无透明通道：先铺白底，避免透明区域变黑
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, target.width, target.height)
    context.drawImage(bitmap, 0, 0, target.width, target.height)

    const dataUrl = canvas.toDataURL('image/jpeg', quality)
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
    if (base64.length === 0) throw new Error('图片编码失败')
    return { mimeType: 'image/jpeg', base64 }
  } catch {
    // 降级：返回原图 base64（可能较大，但功能可用）
    return fileToBase64(file)
  }
}
