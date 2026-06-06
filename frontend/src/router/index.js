import { createRouter, createWebHistory } from 'vue-router'
import MainLayout from '@/layouts/MainLayout.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    /** 数据大屏：独立全屏页，不在侧栏展示 */
    {
      path: '/screen',
      name: 'screen',
      meta: { title: '数据大屏', fullscreen: true },
      component: () => import('@/views/BigScreenView.vue'),
    },
    {
      path: '/',
      component: MainLayout,
      redirect: '/dashboard',
      children: [
        {
          path: 'dashboard',
          name: 'dashboard',
          meta: { title: '能源仪表盘', module: '总览', moduleKey: 'hub' },
          component: () => import('@/views/DashboardView.vue'),
        },
        {
          path: 'energy',
          name: 'energy',
          meta: { title: '能源明细', module: '用能分析', moduleKey: 'analysis' },
          component: () => import('@/views/EnergyView.vue'),
        },
        {
          path: 'stats',
          name: 'stats',
          meta: { title: '统计分析', module: '用能分析', moduleKey: 'analysis' },
          component: () => import('@/views/StatsView.vue'),
        },
        {
          path: 'benchmark',
          name: 'benchmark',
          meta: { title: '能效对标', module: '决策支持', moduleKey: 'decision' },
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
          meta: { title: '孪生与现场', module: '智慧运维', moduleKey: 'ops' },
          component: () => import('@/views/TwinView.vue'),
        },
        {
          path: 'vision',
          redirect: { path: '/twin', query: { tab: 'vision' } },
        },
        {
          path: 'operations',
          name: 'operations',
          meta: { title: '运营与预测', module: '决策支持', moduleKey: 'decision' },
          component: () => import('@/views/OperationsView.vue'),
        },
        {
          path: 'pricing',
          name: 'pricing',
          meta: { title: '产品与收费', module: '商业', moduleKey: 'biz' },
          component: () => import('@/views/PricingView.vue'),
        },
        {
          path: 'admin',
          name: 'admin',
          meta: { title: '系统管理', module: '系统', moduleKey: 'sys' },
          component: () => import('@/views/AdminView.vue'),
        },
      ],
    },
  ],
})

export default router
