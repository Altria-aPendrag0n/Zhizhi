/**
 * 参考资料序列化工具
 * 负责参考资料元数据的序列化/反序列化、id 生成与路径拼接
 */

import type { ReferenceMeta, ReferenceType } from '../types'

/**
 * 生成参考资料唯一 id
 * 优先使用 crypto.randomUUID()，失败则回退时间戳+随机数
 */
export function generateReferenceId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    // 环境不支持 crypto.randomUUID 时走回退逻辑
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * 获取参考资料目录路径
 */
export function getReferencesDir(vaultPath: string): string {
  return `${vaultPath}/references`
}

/**
 * 获取参考资料元数据 JSON 文件路径
 */
export function getReferenceMetaPath(vaultPath: string, id: string): string {
  return `${vaultPath}/references/${id}.json`
}

/**
 * 获取参考资料实际文件路径
 */
export function getReferenceFilePath(vaultPath: string, id: string, fileType: ReferenceType): string {
  return `${vaultPath}/references/${id}.${fileType}`
}

/**
 * 按扩展名检测参考资料类型（大小写不敏感）
 * @returns 'md' | 'pdf' | 'png'，无法识别时返回 null
 */
export function detectReferenceType(fileName: string): ReferenceType | null {
  const ext = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]
  if (ext === 'md' || ext === 'pdf' || ext === 'png') {
    return ext
  }
  return null
}

/**
 * 清理文件名，移除 Windows 不允许的字符（保留扩展名）
 */
export function sanitizeFileName(name: string): string {
  const dotIndex = name.lastIndexOf('.')
  const ext = dotIndex > 0 ? name.slice(dotIndex) : ''
  const base = dotIndex > 0 ? name.slice(0, dotIndex) : name
  const cleaned = base.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_').slice(0, 80) || 'untitled'
  return cleaned + ext
}

/**
 * 序列化元数据为 JSON 字符串
 */
export function serializeReferenceMeta(meta: ReferenceMeta): string {
  return JSON.stringify(meta, null, 2)
}

function isReferenceType(value: unknown): value is ReferenceType {
  return value === 'md' || value === 'pdf' || value === 'png'
}

/**
 * 解析元数据 JSON 字符串并做字段校验与兜底
 * - title 默认 '未命名参考资料'
 * - tags 兜底 []
 * - fileType 非法（或缺失）时抛错
 * @throws 当 fileType 缺失或非法时抛出 Error
 */
export function parseReferenceMeta(json: string): ReferenceMeta {
  const raw = JSON.parse(json) as Partial<ReferenceMeta>
  const fileType = raw.fileType
  if (!isReferenceType(fileType)) {
    throw new Error(`非法 fileType: ${String(fileType)}`)
  }
  return {
    id: typeof raw.id === 'string' ? raw.id : '',
    path: typeof raw.path === 'string' ? raw.path : '',
    title: typeof raw.title === 'string' && raw.title.trim() !== '' ? raw.title : '未命名参考资料',
    description: typeof raw.description === 'string' ? raw.description : undefined,
    tags: Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === 'string') : [],
    fileType,
    fileName: typeof raw.fileName === 'string' ? raw.fileName : '',
    filePath: typeof raw.filePath === 'string' ? raw.filePath : '',
    created: typeof raw.created === 'string' ? raw.created : '',
    updated: typeof raw.updated === 'string' ? raw.updated : '',
  }
}
