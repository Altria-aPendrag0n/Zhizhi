import { describe, it, expect, vi, afterEach } from 'vitest'
import { computeScaledDimensions, compressImageFile } from './image-compress'

/** 构造一个可用的 mock canvas（2D 上下文 + JPEG 编码） */
function mockCanvasContext() {
  const ctx = {
    fillStyle: '',
    fillRect: vi.fn(),
    drawImage: vi.fn(),
  }
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ctx),
    toDataURL: vi.fn(() => 'data:image/jpeg;base64,QUJD'),
  }
  vi.spyOn(document, 'createElement').mockReturnValue(canvas as unknown as HTMLCanvasElement)
  return { ctx, canvas }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('computeScaledDimensions', () => {
  it('最长边未超限时返回原始尺寸', () => {
    expect(computeScaledDimensions(800, 600, 1568)).toEqual({ width: 800, height: 600 })
    expect(computeScaledDimensions(1568, 1000, 1568)).toEqual({ width: 1568, height: 1000 })
  })

  it('最长边超限时等比缩放', () => {
    expect(computeScaledDimensions(4000, 3000, 1568)).toEqual({ width: 1568, height: 1176 })
    expect(computeScaledDimensions(2000, 1000, 1000)).toEqual({ width: 1000, height: 500 })
  })

  it('非法尺寸或 maxEdge 原样返回', () => {
    expect(computeScaledDimensions(0, 100, 1000)).toEqual({ width: 0, height: 100 })
    expect(computeScaledDimensions(100, 100, 0)).toEqual({ width: 100, height: 100 })
  })
})

describe('compressImageFile', () => {
  it('createImageBitmap 成功时按最长边缩放并编码为 JPEG', async () => {
    const { canvas } = mockCanvasContext()
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 4000, height: 3000 })))

    const file = new File(['x'], 'photo.png', { type: 'image/png' })
    const result = await compressImageFile(file)

    expect(result).toEqual({ mimeType: 'image/jpeg', base64: 'QUJD' })
    expect(canvas.width).toBe(1568)
    expect(canvas.height).toBe(1176)
    expect(canvas.getContext).toHaveBeenCalledWith('2d')
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.85)
  })

  it('createImageBitmap 不可用时用 Image + objectURL 兜底并成功压缩', async () => {
    vi.stubGlobal('createImageBitmap', undefined)
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:fake'), revokeObjectURL: vi.fn() })
    vi.stubGlobal('Image', class {
      naturalWidth = 1200
      naturalHeight = 800
      decoding = 'sync'
      src = ''
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      constructor() {
        setTimeout(() => this.onload?.(), 0)
      }
    })

    const { canvas } = mockCanvasContext()
    const file = new File(['x'], 'photo.png', { type: 'image/png' })
    const result = await compressImageFile(file)

    expect(result.mimeType).toBe('image/jpeg')
    expect(canvas.width).toBe(1200)
    expect(canvas.height).toBe(800)
  })

  it('createImageBitmap 解码失败时降级返回原图 base64', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(() => Promise.reject(new Error('decode failed'))))

    const file = new File(['hello'], 'test.png', { type: 'image/png' })
    const result = await compressImageFile(file)

    expect(result.mimeType).toBe('image/png')
    expect(atob(result.base64)).toBe('hello')
  })

  it('canvas 上下文不可用时降级返回原图 base64', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 100, height: 100 })))
    vi.spyOn(document, 'createElement').mockReturnValue({
      width: 0,
      height: 0,
      getContext: vi.fn(() => null),
      toDataURL: vi.fn(),
    } as unknown as HTMLCanvasElement)

    const file = new File(['abc'], 'test.png', { type: 'image/png' })
    const result = await compressImageFile(file)

    expect(result.mimeType).toBe('image/png')
    expect(atob(result.base64)).toBe('abc')
  })
})
