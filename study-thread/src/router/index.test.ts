import { afterEach, describe, expect, it } from 'vitest'
import router from './index'

afterEach(async () => {
  await router.push('/chat')
})

describe('应用路由', () => {
  it('访问根路径时跳转到默认会话页', async () => {
    await router.push('/')

    expect(router.currentRoute.value.fullPath).toBe('/chat')
    expect(router.currentRoute.value.name).toBe('chat')
  })

  it('保留 /notes 笔记详情深链接', async () => {
    await router.push('/notes/测试笔记')

    expect(router.currentRoute.value.fullPath).toBe('/notes/测试笔记')
    expect(router.currentRoute.value.name).toBe('note-detail')
    expect(router.currentRoute.value.params.id).toBe('测试笔记')
  })
})
