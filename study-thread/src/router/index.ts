import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: '/home',
    },
    {
      path: '/home',
      name: 'home',
      component: () => import('../views/HomePage.vue'),
    },
    {
      path: '/chat',
      name: 'chat',
      component: () => import('../views/MainChatPage.vue'),
    },
    {
      path: '/chat/branch/:sessionId/:branchId',
      name: 'branch-chat',
      component: () => import('../views/BranchChatPage.vue'),
    },
    {
      path: '/review/:sessionId',
      name: 'review-chat',
      component: () => import('../views/ReviewChatPage.vue'),
    },
    {
      path: '/notes',
      name: 'notes',
      component: () => import('../views/NotesPage.vue'),
    },
    {
      path: '/notes/:id',
      name: 'note-detail',
      component: () => import('../views/NoteDetailPage.vue'),
    },
    {
      path: '/hub',
      name: 'hub',
      component: () => import('../views/LearningHubPage.vue'),
    },
    {
      path: '/settings',
      component: () => import('../views/SettingsPage.vue'),
      children: [
        {
          path: '',
          name: 'settings',
          redirect: { name: 'settings-general' },
        },
        {
          path: 'general',
          name: 'settings-general',
          component: () => import('../components/settings/GeneralSettingsPanel.vue'),
        },
        {
          path: 'models',
          name: 'settings-models',
          component: () => import('../views/ModelConfigPage.vue'),
        },
        {
          path: 'models/official',
          name: 'settings-models-official',
          component: () => import('../views/OfficialModelPage.vue'),
        },
        {
          path: 'models/custom',
          name: 'settings-models-custom',
          component: () => import('../views/CustomModelPage.vue'),
        },
        {
          path: 'user',
          name: 'settings-user',
          // 与「模型配置 → 官方 API」同一页面（官方账号中心：登录/注册/套餐/兑换），避免两套登录 UI
          component: () => import('../views/OfficialModelPage.vue'),
        },
      ],
    },
  ],
})

export default router