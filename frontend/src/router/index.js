import { createRouter, createWebHistory } from 'vue-router'
import MainLayout from '@/layouts/MainLayout.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      component: MainLayout,
      redirect: '/dashboard',
      children: [
        {
          path: 'dashboard',
          name: 'dashboard',
          meta: { title: '能源仪表盘', module: '工作台', moduleKey: 'hub' },
          component: () => import('@/views/DashboardView.vue'),
        },
        {
          path: 'screen',
          name: 'screen',
          meta: { title: '数据大屏', module: '查询与统计', moduleKey: 'stats' },
          component: () => import('@/views/BigScreenView.vue'),
        },
        {
          path: 'energy',
          name: 'energy',
          meta: { title: '能源监控', module: '数据层', moduleKey: 'data' },
          component: () => import('@/views/EnergyView.vue'),
        },
        {
          path: 'stats',
          name: 'stats',
          meta: { title: '统计分析', module: '查询与统计', moduleKey: 'stats' },
          component: () => import('@/views/StatsView.vue'),
        },
        {
          path: 'benchmark',
          name: 'benchmark',
          meta: { title: '能效对标', module: '查询与统计', moduleKey: 'stats' },
          component: () => import('@/views/BenchmarkView.vue'),
        },
        {
          path: 'knowledge',
          name: 'knowledge',
          meta: { title: '智能问答', module: '智慧运维', moduleKey: 'ops' },
          component: () => import('@/views/KnowledgeView.vue'),
        },
        {
          path: 'incidents',
          name: 'incidents',
          meta: { title: '告警与工单', module: '智慧运维', moduleKey: 'ops' },
          component: () => import('@/views/IncidentsView.vue'),
        },
        {
          path: 'twin',
          name: 'twin',
          meta: { title: '孪生与视觉', module: '智慧运维', moduleKey: 'ops' },
          component: () => import('@/views/TwinView.vue'),
        },
        {
          path: 'vision',
          redirect: { path: '/twin', query: { tab: 'vision' } },
        },
        {
          path: 'operations',
          name: 'operations',
          meta: { title: '运营与预测', module: '智慧运维', moduleKey: 'ops' },
          component: () => import('@/views/OperationsView.vue'),
        },
        {
          path: 'admin',
          name: 'admin',
          meta: { title: '系统管理', module: '系统集成', moduleKey: 'sys' },
          component: () => import('@/views/AdminView.vue'),
        },
      ],
    },
  ],
})

export default router
