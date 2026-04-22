<script setup>
import {
  DataBoard,
  Lightning,
  Histogram,
  Reading,
  List,
  Fold,
  Expand,
  Cpu,
  MoreFilled,
  Monitor,
} from '@element-plus/icons-vue'
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const collapsed = ref(false)
const asideWidth = computed(() => (collapsed.value ? '64px' : '248px'))
const active = computed(() => route.path)

const openeds = ref(['grp-analysis', 'grp-more'])

const moduleTitle = computed(() => route.meta?.module ?? '')
const pageTitle = computed(() => route.meta?.title ?? '')

/** 与 router meta.moduleKey 对齐：面包屑中间层快捷切换同级页 */
const MODULE_QUICK = {
  hub: [{ path: '/dashboard', title: '能源仪表盘' }],
  data: [{ path: '/energy', title: '能源监控' }],
  stats: [
    { path: '/screen', title: '数据大屏' },
    { path: '/stats', title: '统计分析' },
    { path: '/benchmark', title: '能效对标' },
  ],
  ops: [
    { path: '/knowledge', title: '智能问答' },
    { path: '/incidents', title: '告警与工单' },
    { path: '/twin', title: '孪生与视觉' },
    { path: '/operations', title: '运营与预测' },
  ],
  sys: [{ path: '/admin', title: '系统管理' }],
}

const modulePeers = computed(() => MODULE_QUICK[route.meta?.moduleKey] ?? [])
const showModuleDropdown = computed(() => modulePeers.value.length > 1 && !!moduleTitle.value)

function goPeer(path) {
  if (path && path !== route.path) router.push(path)
}
</script>

<template>
  <el-container class="ems-shell">
    <el-aside class="ems-aside" :width="asideWidth">
      <div class="ems-brand">
        <div v-if="!collapsed" class="ems-brand-full">
          <span class="ems-brand-mark">EMS</span>
          <div class="ems-brand-text">
            <div class="ems-brand-title">建筑能源智能管理</div>
            <div class="ems-brand-sub">赛题 A08 · EMS</div>
          </div>
        </div>
        <span v-else class="ems-brand-mini">E</span>
      </div>

      <el-scrollbar class="ems-menu-wrap">
        <el-menu
          :default-active="active"
          :default-openeds="openeds"
          :collapse="collapsed"
          router
          class="ems-menu"
          background-color="transparent"
          text-color="#a9aeb8"
          active-text-color="#ffffff"
        >
          <el-menu-item index="/dashboard">
            <el-icon><DataBoard /></el-icon>
            <span class="menu-label">能源仪表盘</span>
          </el-menu-item>

          <el-menu-item index="/screen">
            <el-icon><Monitor /></el-icon>
            <span class="menu-label">数据大屏</span>
          </el-menu-item>

          <el-menu-item index="/energy">
            <el-icon><Lightning /></el-icon>
            <span class="menu-label">能源监控</span>
          </el-menu-item>

          <el-sub-menu index="grp-analysis">
            <template #title>
              <el-icon><Histogram /></el-icon>
              <span class="menu-label">查询与统计</span>
            </template>
            <el-menu-item index="/stats">
              <span class="sub-label">统计分析</span>
            </el-menu-item>
            <el-menu-item index="/benchmark">
              <span class="sub-label">能效对标</span>
            </el-menu-item>
          </el-sub-menu>

          <el-menu-item index="/knowledge">
            <el-icon><Reading /></el-icon>
            <span class="menu-label">智能问答</span>
          </el-menu-item>

          <el-menu-item index="/incidents">
            <el-icon><List /></el-icon>
            <span class="menu-label">告警与工单</span>
          </el-menu-item>

          <el-sub-menu index="grp-more">
            <template #title>
              <el-icon><MoreFilled /></el-icon>
              <span class="menu-label">扩展能力</span>
            </template>
            <el-menu-item index="/twin">
              <span class="sub-label">孪生与视觉</span>
            </el-menu-item>
            <el-menu-item index="/operations">
              <span class="sub-label">运营与预测</span>
            </el-menu-item>
            <el-menu-item index="/admin">
              <span class="sub-label">系统管理</span>
            </el-menu-item>
          </el-sub-menu>
        </el-menu>
      </el-scrollbar>

      <div class="ems-aside-foot">
        <el-icon class="foot-icon"><Cpu /></el-icon>
        <span v-if="!collapsed" class="foot-text">数据层 · 查询统计 · 智慧运维</span>
      </div>
    </el-aside>

    <el-container class="ems-right">
      <el-header class="ems-header">
        <div class="ems-header-left">
          <el-tooltip content="展开 / 收起导航" placement="bottom">
            <el-button text class="collapse-btn" aria-label="切换侧栏" @click="collapsed = !collapsed">
              <el-icon v-if="collapsed"><Expand /></el-icon>
              <el-icon v-else><Fold /></el-icon>
            </el-button>
          </el-tooltip>
          <el-breadcrumb separator="/" class="responsive-breadcrumb">
            <el-breadcrumb-item>建筑能源智能管理系统</el-breadcrumb-item>
            <el-breadcrumb-item v-if="moduleTitle && showModuleDropdown">
              <el-dropdown trigger="click" @command="goPeer">
                <span class="breadcrumb-dd-trigger" role="button" tabindex="0">
                  {{ moduleTitle }}
                  <span class="breadcrumb-dd-caret" aria-hidden="true">▾</span>
                </span>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item
                      v-for="it in modulePeers"
                      :key="it.path"
                      :command="it.path"
                      :disabled="it.path === route.path"
                    >
                      {{ it.title }}
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </el-breadcrumb-item>
            <el-breadcrumb-item v-else-if="moduleTitle">{{ moduleTitle }}</el-breadcrumb-item>
            <el-breadcrumb-item>{{ pageTitle }}</el-breadcrumb-item>
          </el-breadcrumb>
        </div>
        <div class="ems-header-right">
          <el-button
            class="hide-xs"
            tag="a"
            href="/docs"
            target="_blank"
            rel="noopener noreferrer"
            type="primary"
            link
            size="small"
          >
            API 文档
          </el-button>
          <el-tag class="hide-xs" type="info" size="small" effect="plain">REST / MCP</el-tag>
        </div>
      </el-header>
      <el-main class="ems-main">
        <RouterView />
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
.ems-shell {
  min-height: 100vh;
  background: var(--ems-main-bg, #f5f7fa);
}

.ems-aside {
  display: flex;
  flex-direction: column;
  background: var(--ems-bg-dark, var(--ems-sidebar-bg, #1d2129));
  transition: width 0.2s ease;
  overflow: hidden;
  border-right: none;
  box-shadow: none;
}

.ems-brand {
  height: 56px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  padding: 0 12px;
  background: rgba(255, 255, 255, 0.04);
}

.ems-brand-full {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.ems-brand-mark {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: linear-gradient(145deg, #5b7c9c, #3d5a78);
  color: #fff;
  font-weight: 800;
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.ems-brand-text {
  flex: 1;
  min-width: 0;
}

.ems-brand-title {
  color: #fff;
  font-weight: 600;
  font-size: 15px;
  line-height: 1.2;
}

.ems-brand-sub {
  color: rgba(255, 255, 255, 0.5);
  font-size: 11px;
  margin-top: 2px;
}

.ems-brand-mini {
  color: #8cc8ff;
  font-weight: 800;
  font-size: 18px;
}

.ems-menu-wrap {
  flex: 1;
  min-height: 0;
}

.ems-menu {
  border-right: none;
  padding: 8px 0 16px;
}

.menu-label {
  font-weight: 500;
}

.sub-label {
  font-weight: 400;
}

.sub-ico {
  margin-right: 4px;
  font-size: 15px;
  vertical-align: middle;
}

.ems-menu :deep(.el-sub-menu__title),
.ems-menu :deep(.el-menu-item) {
  margin: 3px 10px;
  border-radius: 6px;
}

/* 选中项：浅蓝底 + 左侧 3px 激活条（克制） */
.ems-menu :deep(.el-menu-item.is-active) {
  position: relative;
  background: var(--ems-menu-active-bg, rgba(24, 144, 255, 0.12)) !important;
  color: #fff !important;
  font-weight: 600;
  box-shadow: none;
}

.ems-menu :deep(.el-menu-item.is-active::before) {
  content: '';
  position: absolute;
  left: 0;
  top: 8px;
  bottom: 8px;
  width: 3px;
  background: var(--ems-blue, #1890ff);
  border-radius: 0 2px 2px 0;
  pointer-events: none;
}

.ems-menu :deep(.el-menu-item.is-active .menu-label),
.ems-menu :deep(.el-menu-item.is-active .sub-label) {
  font-weight: 600;
}

.ems-menu :deep(.el-menu-item:not(.is-active):hover) {
  background: rgba(255, 255, 255, 0.08) !important;
}

.ems-menu :deep(.el-sub-menu .el-menu-item) {
  min-width: auto;
  padding-left: 44px !important;
}

.ems-menu :deep(.el-sub-menu__title:hover) {
  background: rgba(255, 255, 255, 0.06) !important;
}

.ems-aside-foot {
  flex-shrink: 0;
  padding: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  gap: 8px;
  color: rgba(255, 255, 255, 0.4);
  font-size: 11px;
}

.foot-icon {
  font-size: 16px;
}

.foot-text {
  line-height: 1.3;
}

.ems-right {
  min-width: 0;
}

.ems-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--ems-bg-card, #fff);
  border-bottom: 1px solid var(--ems-border-light, #e5e6eb);
  box-shadow: none;
  padding: 0 24px;
  height: 56px;
}

.ems-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.collapse-btn {
  font-size: 18px;
  color: rgba(0, 0, 0, 0.65);
}

.ems-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.ems-main {
  padding: var(--ems-space-lg) var(--ems-space-lg) var(--ems-space-xl);
  overflow: auto;
  background: var(--ems-main-bg, #f2f3f5);
}

.breadcrumb-dd-trigger {
  cursor: pointer;
  color: rgba(0, 0, 0, 0.55);
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border-radius: 4px;
  padding: 2px 4px;
  margin: -2px -4px;
}

.breadcrumb-dd-trigger:hover {
  color: var(--ems-blue, #1890ff);
  background: rgba(24, 144, 255, 0.06);
}

.breadcrumb-dd-caret {
  font-size: 10px;
  opacity: 0.65;
}

.ems-header :deep(.el-breadcrumb) {
  font-size: 13px;
  line-height: 1.4;
}

.ems-header :deep(.el-breadcrumb__inner) {
  color: rgba(0, 0, 0, 0.55);
  font-weight: 500;
}

.ems-header :deep(.el-breadcrumb__item:last-child .el-breadcrumb__inner) {
  color: rgba(0, 0, 0, 0.88);
  font-weight: 600;
}

@media (max-width: 768px) {
  .responsive-breadcrumb :deep(.el-breadcrumb__item:not(:last-child)) {
    display: none;
  }

  .responsive-breadcrumb :deep(.el-breadcrumb__item:last-child .el-breadcrumb__inner) {
    font-weight: 600;
    font-size: 16px;
    color: var(--ems-text-primary, rgba(0, 0, 0, 0.88));
  }

  .ems-main {
    padding: 12px;
  }

  .hide-xs {
    display: none;
  }

  .ems-header {
    height: auto;
    min-height: 48px;
    flex-wrap: wrap;
    padding-top: 8px;
    padding-bottom: 8px;
  }

  .ems-aside {
    box-shadow: none;
  }
}
</style>
