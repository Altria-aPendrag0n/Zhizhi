import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: '/chat',
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
      name: 'settings',
      component: () => import('../views/SettingsPage.vue'),
    },
  ],
})

export default router