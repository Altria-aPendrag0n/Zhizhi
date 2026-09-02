import { afterEach, describe, expect, it } from 'vitest'
import router from './index'

afterEach(async () => {
  await router.push('/home')
})

describe('应用路由', () => {
  it('访问根路径时跳转到主界面', async () => {
    await router.push('/')

    expect(router.currentRoute.value.fullPath).toBe('/home')
    expect(router.currentRoute.value.name).toBe('home')
  })

  it('保留 /notes 笔记详情深链接', async () => {
    await router.push('/notes/测试笔记')

    expect(router.currentRoute.value.fullPath).toBe('/notes/测试笔记')
    expect(router.currentRoute.value.name).toBe('note-detail')
    expect(router.currentRoute.value.params.id).toBe('测试笔记')
  })

  it('设置页为嵌套路由：/settings 重定向到常规设置子路由', async () => {
    await router.push('/settings')

    expect(router.currentRoute.value.name).toBe('settings-general')
  })

  it('命名路由 settings 仍可跳转（重定向到常规设置）', async () => {
    await router.push({ name: 'settings' })

    expect(router.currentRoute.value.name).toBe('settings-general')
  })

  it('模型配置官方/自定义子路由保持原路径', async () => {
    await router.push('/settings/models/official')
    expect(router.currentRoute.value.name).toBe('settings-models-official')

    await router.push('/settings/models/custom')
    expect(router.currentRoute.value.name).toBe('settings-models-custom')
  })
})
