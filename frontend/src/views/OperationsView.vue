<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { RefreshRight, Download } from '@element-plus/icons-vue'
import AppChart from '@/components/AppChart.vue'
import * as api from '@/api'
import { apiUrl } from '@/api/client'
import { ElMessage } from 'element-plus'

const indicators = ref(null)
const forecast = ref(null)
const buildingId = ref('')
const buildings = ref([])
const loading = ref(false)
const horizonHours = ref(48)
const filtersReady = ref(false)
const activePanel = ref('indicators')
/** 原「建议」已迁至孪生与视觉：上传图片建模后展示 */

/** 与后端 v2_service.ops_indicators 含义对齐的简要说明（演示算法） */
const IND = {
  ewi: {
    name: 'EWI',
    fullName: '能效浪费指数',
    brief:
      '用「平均电耗相对分位基准」与「夜间（如 0–5 点）记录占比」相乘，偏高表示非工作时段或低负荷下浪费风险更大。',
  },
  dh: {
    name: 'DH',
    fullName: '设备健康（示意）',
    brief:
      '由夜间占比映射到 0–1 的「健康度」示意，越接近 1 表示运行时段结构越平稳；非真实故障率或维保数据。',
  },
}

function fmtNum(v, digits = 4) {
  if (v == null || Number.isNaN(Number(v))) return '—'
  return Number(v).toLocaleString('zh-CN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })
}

function modelLabel(m) {
  const map = {
    prophet: 'Prophet',
    naive_moving_average: '滑动平均',
    naive_fallback: '滑动平均（回退）',
    none: '无数据',
  }
  return map[m] ?? (m || '—')
}

const indicatorItems = computed(() => {
  const ind = indicators.value?.indicators ?? {}
  const hints = indicators.value?.formula_hint ?? {}
  return ['ewi', 'dh'].map((key) => {
    const meta = IND[key]
    return {
      key,
      name: meta.name,
      fullName: meta.fullName,
      brief: meta.brief,
      tip: [`${meta.name}（${meta.fullName}）`, hints[key]].filter(Boolean).join(' · '),
      value: ind[key],
    }
  })
})

const forecastLabels = computed(() => forecast.value?.labels ?? forecast.value?.times ?? [])
const forecastValues = computed(() => forecast.value?.values ?? forecast.value?.forecast ?? [])
const hasForecastSeries = computed(
  () => Array.isArray(forecastLabels.value) && forecastLabels.value.length > 0,
)

/** 预测图标题区（避免 ECharts 内置 title/subtext 与 grid 重叠） */
const forecastHeadLine = computed(() => {
  const f = forecast.value
  if (!f) return ''
  const m = modelLabel(f.model)
  const h = f.horizon_hours != null ? `${f.horizon_hours}h` : ''
  return h ? `${m} · ${h}` : m
})

const forecastOption = computed(() => {
  const labels = forecastLabels.value
  const n = labels.length
  const values = forecastValues.value.map((v) => (v == null ? 0 : Number(v)))
  // 约展示 10～14 个横轴文字，避免 168 点叠在一起
  const labelStep = n ? Math.max(1, Math.ceil(n / 12)) : 1

  return {
    color: ['#1890ff'],
    animationDuration: 400,
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: '#91caff' } },
      valueFormatter: (val) => (val != null ? `${Number(val).toFixed(3)} kWh/h` : '—'),
    },
    grid: { left: 52, right: 20, top: 12, bottom: n > 24 ? 72 : 40, containLabel: false },
    xAxis: {
      type: 'category',
      data: labels,
      boundaryGap: false,
      axisTick: { alignWithLabel: true },
      axisLabel: {
        fontSize: 11,
        color: 'rgba(0,0,0,0.45)',
        rotate: n > 40 ? 32 : 0,
        formatter: (value, index) => {
          const idx = typeof index === 'number' ? index : labels.indexOf(value)
          return idx >= 0 && idx % labelStep === 0 ? value : ''
        },
      },
    },
    yAxis: {
      type: 'value',
      name: 'kWh/h',
      nameTextStyle: { fontSize: 11, color: 'rgba(0,0,0,0.45)', padding: [0, 0, 0, 8] },
      axisLabel: { fontSize: 11, color: 'rgba(0,0,0,0.45)' },
      splitLine: { lineStyle: { type: 'dashed', color: '#f0f0f0' } },
    },
    dataZoom:
      n > 24
        ? [
            { type: 'inside', start: 0, end: 100, zoomOnMouseWheel: true, moveOnMouseMove: true },
            {
              type: 'slider',
              start: 0,
              end: 100,
              height: 22,
              bottom: 6,
              borderColor: 'transparent',
              backgroundColor: '#f5f5f5',
              fillerColor: 'rgba(24,144,255,0.15)',
              handleStyle: { color: '#1890ff' },
            },
          ]
        : undefined,
    series: [
      {
        type: 'line',
        name: '预测',
        data: values,
        smooth: 0.35,
        showSymbol: n <= 36,
        symbolSize: 5,
        lineStyle: { width: 2, cap: 'round' },
        areaStyle: { opacity: 0.12, color: '#1890ff' },
      },
    ],
  }
})

const apiParams = computed(() => {
  const p = {}
  if (buildingId.value) p.building_id = buildingId.value
  return p
})

async function loadCore() {
  loading.value = true
  try {
    const bp = apiParams.value
    const [o, f] = await Promise.all([
      api.getV2OpsIndicators(bp).catch(() => null),
      api.getV2ForecastEnergy({ ...bp, horizon_hours: horizonHours.value }).catch(() => null),
    ])
    indicators.value = o
    forecast.value = f
  } catch (e) {
    ElMessage.error(e.message ?? '加载失败')
  } finally {
    loading.value = false
  }
}

async function loadBuildings() {
  const data = await api.getBuildings().catch(() => ({ items: [] }))
  buildings.value = data.items ?? []
  if (!buildingId.value && buildings.value.length) {
    buildingId.value = buildings.value[0].building_id ?? buildings.value[0].id ?? ''
  }
}

function openReport(kind, format) {
  const q = new URLSearchParams({ file_format: format })
  if (buildingId.value) q.set('building_id', buildingId.value)
  window.open(apiUrl(`/api/v2/reports/${kind}?${q.toString()}`), '_blank')
}

onMounted(async () => {
  await loadBuildings()
  await loadCore()
  filtersReady.value = true
})

watch([buildingId, horizonHours], () => {
  if (!filtersReady.value) return
  loadCore()
})
</script>

<template>
  <div class="myems-page operations-view">
    <h1 class="myems-page-title">运营与预测</h1>

    <el-alert type="info" show-icon :closable="false" class="ops-twin-hint">
      <template #title>节能与空间建议</template>
      已整合至
      <router-link class="ops-twin-link" to="/twin">孪生与视觉</router-link>
      ：在<strong>上传图片并完成 3D 建模</strong>后，系统会结合识别目标（照明、家具、人员等）与所选建筑能耗数据，给出室内布局与设备运行建议。
    </el-alert>

    <div class="myems-toolbar myems-toolbar--dense ops-bar">
      <el-select
        v-model="buildingId"
        placeholder="建筑"
        clearable
        filterable
        class="ops-select"
        size="small"
      >
        <el-option
          v-for="b in buildings"
          :key="JSON.stringify(b)"
          :label="b.building_id ?? b.name ?? String(b)"
          :value="b.building_id ?? b.id"
        />
      </el-select>
      <el-select v-model="horizonHours" class="ops-select-sm" size="small">
        <el-option :value="24" label="24h" />
        <el-option :value="48" label="48h" />
        <el-option :value="72" label="72h" />
        <el-option :value="96" label="96h" />
        <el-option :value="168" label="168h" />
      </el-select>
      <el-button type="primary" :icon="RefreshRight" :loading="loading" link @click="loadCore">
        刷新
      </el-button>
      <el-dropdown trigger="click" @command="({ k, f }) => openReport(k, f)">
        <el-button :icon="Download">
          导出报告
          <span class="ops-caret">▼</span>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item :command="{ k: 'operations', f: 'pdf' }">运营 PDF</el-dropdown-item>
            <el-dropdown-item :command="{ k: 'operations', f: 'word' }">运营 Word</el-dropdown-item>
            <el-dropdown-item divided :command="{ k: 'esg', f: 'pdf' }">ESG PDF</el-dropdown-item>
            <el-dropdown-item :command="{ k: 'esg', f: 'word' }">ESG Word</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>

    <el-card v-loading="loading" shadow="never" class="ems-card ops-main ops-main--flat">
      <el-tabs v-model="activePanel">
        <el-tab-pane label="指标" name="indicators">
          <template v-if="indicators && indicators.rows !== 0">
            <div class="ind-strip">
              <span v-if="indicators.rows != null" class="ind-meta">样本 {{ indicators.rows }} 行 · 演示指标</span>
            </div>
            <el-row :gutter="10" class="ind-row">
              <el-col v-for="it in indicatorItems" :key="it.key" :xs="24" :sm="12">
                <div class="ind-mini">
                  <div class="ind-mini-head">
                    <span class="ind-mini-name">{{ it.name }}</span>
                    <span class="ind-mini-full">{{ it.fullName }}</span>
                    <el-tooltip :content="it.tip" placement="top" :show-after="300">
                      <span class="ind-formula-hint" tabindex="0">公式</span>
                    </el-tooltip>
                  </div>
                  <div class="ind-mini-val">{{ fmtNum(it.value) }}</div>
                  <p class="ind-brief">{{ it.brief }}</p>
                </div>
              </el-col>
            </el-row>
          </template>
          <el-alert
            v-else-if="indicators && indicators.rows === 0"
            title="当前筛选下无样本"
            type="warning"
            :closable="false"
          />
          <el-empty v-else-if="!loading" description="无数据" :image-size="64" />
        </el-tab-pane>

        <el-tab-pane label="预测" name="forecast" lazy>
          <div v-if="hasForecastSeries" class="forecast-panel">
            <div class="forecast-head">
              <span class="forecast-title">市电预测（kWh/h）</span>
              <span class="forecast-meta">{{ forecastHeadLine }}</span>
            </div>
            <AppChart class="forecast-chart" :option="forecastOption" />
          </div>
          <el-empty
            v-else-if="forecast && !hasForecastSeries"
            description="无历史序列"
            :image-size="56"
          />
          <el-empty v-else-if="!loading" description="无数据" :image-size="56" />
          <p v-if="forecast?.prophet_error" class="ops-note">{{ forecast.prophet_error }}</p>
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<style scoped>
.ops-twin-hint {
  margin-bottom: 12px;
}

.ops-twin-hint :deep(.el-alert__description) {
  line-height: 1.65;
  font-size: 13px;
}

.ops-twin-link {
  color: var(--el-color-primary);
  font-weight: 600;
  text-decoration: none;
}

.ops-twin-link:hover {
  text-decoration: underline;
}

.ops-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.ops-select {
  width: min(100%, 240px);
}

.ops-select-sm {
  width: 100px;
}

.ops-caret {
  font-size: 10px;
  margin-left: 4px;
  opacity: 0.6;
}

.ops-main--flat {
  border-radius: 4px;
}

.ops-main :deep(.el-tabs__header) {
  margin-bottom: 12px;
}

.ops-main :deep(.el-tabs__content) {
  padding: 0 2px;
}

.forecast-panel {
  width: 100%;
}

.forecast-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px 16px;
  margin-bottom: 8px;
}

.forecast-title {
  font-size: 14px;
  font-weight: 600;
  color: rgba(0, 0, 0, 0.85);
}

.forecast-meta {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
}

.ind-strip {
  margin-bottom: 8px;
}

.ind-meta {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.4);
}

.ind-row {
  margin-bottom: 0;
}

.ind-mini {
  padding: 12px 14px;
  border: 1px solid var(--ems-border, #e8e8e8);
  border-radius: 6px;
  background: #fafafa;
  height: 100%;
}

.ind-mini-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  margin-bottom: 6px;
}

.ind-mini-name {
  font-size: 14px;
  font-weight: 600;
  color: rgba(0, 0, 0, 0.85);
}

.ind-mini-full {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
}

.ind-formula-hint {
  margin-left: auto;
  font-size: 12px;
  color: var(--el-color-primary);
  cursor: help;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.ind-mini-val {
  font-size: 22px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: #1890ff;
  line-height: 1.2;
  margin-bottom: 8px;
}

.ind-brief {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: rgba(0, 0, 0, 0.55);
}

.ops-table :deep(.el-table__header th) {
  background: #fafafa;
}

.muted {
  color: rgba(0, 0, 0, 0.35);
}

.forecast-chart {
  width: 100%;
  min-height: 380px;
  height: min(52vh, 520px);
}

.ops-note {
  margin: 8px 0 0;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
}

@media (max-width: 576px) {
  .forecast-chart {
    min-height: 280px;
    height: 42vh;
  }
}
</style>
