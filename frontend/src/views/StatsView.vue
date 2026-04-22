<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import * as api from '@/api'
import { apiUrl } from '@/api/client'
import { ElMessage } from 'element-plus'
import { buildPeriodTableRows, formatIsoRange } from '@/utils/statsDisplay'

const buildings = ref([])
const buildingId = ref('')
const dateRange = ref(null)
const loading = ref(false)
/** 避免首屏 loadBuildings 设置 buildingId 时触发重复请求 */
const toolbarReady = ref(false)

const periodData = ref(null)
const anomalies = ref(null)
const cop = ref(null)

const activeTab = ref('period')

const kpis = computed(() => {
  const sums = periodData.value?.sums ?? {}
  const elec = Number(sums.electricity_kwh)
  const ar = anomalies.value?.ratio
  const arN = ar != null ? Number(ar) : null
  const pct = arN != null ? (arN * 100).toFixed(2) : '—'
  const copv = cop.value?.mean_chilled_over_elec
  const serious = arN != null && arN > 0.1
  const warn = arN != null && arN > 0.05 && !serious
  return [
    {
      label: '市电累计',
      value: Number.isFinite(elec) ? elec.toLocaleString('zh-CN', { maximumFractionDigits: 0 }) : '—',
      unit: 'kWh',
      trend: '筛选期',
      trendDir: 'neutral',
      trendText: '合计',
      kpiClass: '',
    },
    {
      label: '异常用电占比',
      value: pct,
      unit: '%',
      trend: 'z-score',
      trendDir: arN != null && arN > 0.1 ? 'up' : 'down',
      trendText: '演示检测',
      kpiClass: serious ? 'myems-kpi-card--accent-danger' : warn ? 'myems-kpi-card--accent-warn' : '',
    },
    {
      label: cop.value?.demo_simulated ? '冷/电比(演示·模拟)' : '冷/电 比值(演示)',
      value: copv != null ? String(copv) : '—',
      unit: '',
      trend: 'COP 相关',
      trendDir: 'neutral',
      trendText: cop.value?.demo_simulated ? '无冷量同小时' : '小时级',
      kpiClass: '',
    },
    {
      label: '时段行数',
      value: String(periodData.value?.rows ?? '—'),
      unit: '行',
      trend: '数据',
      trendDir: 'neutral',
      trendText: '小时粒度',
      kpiClass: '',
    },
  ]
})

const periodTableRows = computed(() =>
  buildPeriodTableRows(periodData.value?.sums, periodData.value?.means),
)

const periodTimeRangeText = computed(() =>
  formatIsoRange(periodData.value?.time_range?.min, periodData.value?.time_range?.max),
)

const anomalyRatioPct = computed(() => {
  const r = anomalies.value?.ratio
  if (r == null || Number.isNaN(Number(r))) return '—'
  return `${(Number(r) * 100).toFixed(2)}%`
})

const copDisplay = computed(() => {
  const c = cop.value
  if (!c) return null
  const fmt = (x) =>
    x != null && Number.isFinite(Number(x)) ? Number(x).toLocaleString('zh-CN', { maximumFractionDigits: 4 }) : '—'
  return {
    valid_hours: c.valid_hours,
    mean: fmt(c.mean_chilled_over_elec),
    median: fmt(c.median_chilled_over_elec),
  }
})

function formatAnomalyElecCell(v) {
  if (v === '' || v == null) return '—'
  const n = Number(v)
  if (!Number.isFinite(n)) return String(v)
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function rangeToParams() {
  if (!dateRange.value || !Array.isArray(dateRange.value) || dateRange.value.length !== 2) {
    return { time_from: undefined, time_to: undefined }
  }
  const [a, b] = dateRange.value
  if (!a || !b) return { time_from: undefined, time_to: undefined }
  return { time_from: a, time_to: b }
}

function filterParams() {
  const { time_from, time_to } = rangeToParams()
  const params = {}
  if (buildingId.value) params.building_id = buildingId.value
  if (time_from) params.time_from = time_from
  if (time_to) params.time_to = time_to
  return params
}

async function loadBuildings() {
  const data = await api.getBuildings()
  buildings.value = data.items ?? []
  if (!buildingId.value && buildings.value.length) {
    buildingId.value = buildings.value[0].building_id ?? buildings.value[0].id ?? ''
  }
}

async function loadAllPanels() {
  const p = filterParams()
  loading.value = true
  try {
    const [per, ano, cp] = await Promise.all([
      api.getStatsPeriod(p).catch(() => null),
      api.getStatsAnomalies({ ...p, z_threshold: 3 }).catch(() => null),
      api.getStatsCopProxy(p).catch(() => null),
    ])
    periodData.value = per
    anomalies.value = ano
    cop.value = cp
  } catch (e) {
    ElMessage.error(e.message ?? '加载失败')
  } finally {
    loading.value = false
  }
}

function exportCsv() {
  const p = filterParams()
  const q = new URLSearchParams()
  if (p.building_id) q.set('building_id', p.building_id)
  if (p.time_from) q.set('time_from', p.time_from)
  if (p.time_to) q.set('time_to', p.time_to)
  const url = apiUrl(`/api/stats/export/csv${q.toString() ? `?${q.toString()}` : ''}`)
  window.open(url, '_blank')
}

onMounted(async () => {
  await loadBuildings()
  await loadAllPanels()
  toolbarReady.value = true
})

watch(
  [buildingId, dateRange],
  async () => {
    if (!toolbarReady.value) return
    await loadAllPanels()
  },
  { deep: true },
)
</script>

<template>
  <div class="myems-page stats-view">
    <h1 class="myems-page-title">数据分析</h1>

    <div class="myems-toolbar myems-toolbar--dense">
      <el-form label-width="0">
        <el-row :gutter="[10, 8]">
          <el-col :xs="24" :sm="12" :md="6">
            <el-form-item>
              <el-select
                v-model="buildingId"
                clearable
                placeholder="空间 · 全部建筑"
                class="w-full"
                filterable
                size="small"
              >
                <el-option
                  v-for="b in buildings"
                  :key="JSON.stringify(b)"
                  :label="b.building_id ?? b.name ?? String(b)"
                  :value="b.building_id ?? b.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="24" :md="18">
            <el-form-item>
              <el-date-picker
                v-model="dateRange"
                type="datetimerange"
                range-separator="至"
                start-placeholder="统计期 · 开始"
                end-placeholder="统计期 · 结束"
                format="YYYY-MM-DD HH:mm"
                value-format="YYYY-MM-DD HH:mm:ss"
                class="w-full"
                size="small"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <div class="toolbar-actions">
          <el-button @click="exportCsv">导出 CSV</el-button>
        </div>
      </el-form>
    </div>

    <el-row :gutter="12" class="myems-kpi-row">
      <el-col v-for="(k, i) in kpis" :key="i" :xs="24" :sm="12" :md="6">
        <div class="myems-kpi-card" :class="k.kpiClass">
          <div class="myems-kpi-label">{{ k.label }}</div>
          <div>
            <span class="myems-kpi-value num-font">{{ k.value }}</span>
            <span class="myems-kpi-unit">{{ k.unit }}</span>
          </div>
          <div
            class="myems-kpi-trend"
            :class="{
              'myems-kpi-trend--up': k.trendDir === 'up',
              'myems-kpi-trend--down': k.trendDir === 'down',
            }"
          >
            {{ k.trend }} · {{ k.trendText }}
          </div>
        </div>
      </el-col>
    </el-row>

    <div class="myems-section">
      <div class="myems-section-head">
        <span>指标与明细</span>
      </div>
      <el-tabs v-model="activeTab" type="card" class="analysis-tabs">
        <el-tab-pane label="时段汇总" name="period">
          <div v-loading="loading" class="detail-tab">
            <template v-if="periodData && periodData.rows > 0">
              <el-descriptions :column="3" border size="small" class="detail-desc mb">
                <el-descriptions-item label="时间范围" :span="2">
                  <span class="detail-mono">{{ periodTimeRangeText }}</span>
                </el-descriptions-item>
                <el-descriptions-item label="数据行数">
                  <el-tag size="small" type="info" effect="plain">{{ periodData.rows }} 行</el-tag>
                </el-descriptions-item>
                <el-descriptions-item v-if="periodData.buildings?.length" label="涉及建筑" :span="3">
                  <span class="detail-buildings">{{ periodData.buildings.join('、') }}</span>
                </el-descriptions-item>
              </el-descriptions>
              <el-table
                v-if="periodTableRows.length"
                :data="periodTableRows"
                size="small"
                class="detail-table data-table--borderless"
                max-height="440"
                empty-text="无汇总字段"
              >
                <el-table-column prop="label" label="指标" min-width="120" fixed="left" />
                <el-table-column prop="unit" label="单位" width="72" align="center" />
                <el-table-column prop="sumFmt" label="合计" min-width="120" align="right">
                  <template #header>
                    <span>合计</span>
                    <span class="col-hint">累加</span>
                  </template>
                </el-table-column>
                <el-table-column prop="meanFmt" label="均值" min-width="120" align="right">
                  <template #header>
                    <span>均值</span>
                    <span class="col-hint">小时</span>
                  </template>
                </el-table-column>
              </el-table>
              <p class="detail-footnote">
                气温、湿度类指标「合计」无业务含义时显示为 —，请以均值为准。
              </p>
            </template>
            <el-empty v-else description="变更顶部空间或统计期后将自动加载" :image-size="80" />
          </div>
        </el-tab-pane>
        <el-tab-pane label="用电异常" name="anomalies">
          <div v-loading="loading" class="detail-tab">
            <el-alert
              v-if="anomalies?.note"
              :title="anomalies.note"
              type="warning"
              show-icon
              :closable="false"
              class="mb"
            />
            <template v-if="anomalies && anomalies.total_hours > 0">
              <el-descriptions :column="2" border size="small" class="detail-desc mb">
                <el-descriptions-item label="统计小时数">{{ anomalies.total_hours }}</el-descriptions-item>
                <el-descriptions-item label="异常小时数">
                  <el-tag :type="anomalies.anomaly_hours > 0 ? 'warning' : 'success'" size="small" effect="light">
                    {{ anomalies.anomaly_hours }}
                  </el-tag>
                </el-descriptions-item>
                <el-descriptions-item label="异常占比">
                  <span class="detail-em">{{ anomalyRatioPct }}</span>
                  <span class="detail-sub">（相对全部小时）</span>
                </el-descriptions-item>
                <el-descriptions-item label="z 阈值">{{ anomalies.z_threshold }}</el-descriptions-item>
              </el-descriptions>
              <div v-if="anomalies.samples?.length" class="detail-table-wrap">
                <div class="detail-table-title">异常样本（最多 50 条）</div>
                <el-table
                  :data="anomalies.samples"
                  size="small"
                  class="detail-table data-table--borderless"
                  max-height="400"
                >
                  <el-table-column prop="building_id" label="建筑" min-width="200" show-overflow-tooltip />
                  <el-table-column prop="monitor_time" label="监测时间" min-width="168" />
                  <el-table-column label="市电 (kWh)" min-width="110" align="right">
                    <template #default="{ row }">
                      {{ formatAnomalyElecCell(row.electricity_kwh) }}
                    </template>
                  </el-table-column>
                </el-table>
              </div>
              <el-empty v-else description="当前阈值下未检出异常小时" :image-size="72" />
            </template>
            <el-empty v-else-if="!loading" description="无异常分析数据" :image-size="80" />
          </div>
        </el-tab-pane>
        <el-tab-pane label="COP 演示" name="cop">
          <div v-loading="loading" class="detail-tab">
            <el-alert
              v-if="cop?.demo_simulated"
              title="当前使用演示用模拟冷量/市电比（数据集无同小时冷冻水与市电）；接入真实冷量表后可为实测比值。"
              type="warning"
              show-icon
              :closable="false"
              class="mb"
            />
            <el-alert
              v-else-if="cop?.description"
              :title="cop.description"
              type="info"
              show-icon
              :closable="false"
              class="mb"
            />
            <template v-if="cop && cop.valid_hours > 0 && copDisplay">
              <el-descriptions :column="1" border size="small" class="detail-desc">
                <el-descriptions-item label="有效小时数">{{ copDisplay.valid_hours }}</el-descriptions-item>
                <el-descriptions-item label="冷量/市电 · 均值">
                  <span class="detail-mono">{{ copDisplay.mean }}</span>
                </el-descriptions-item>
                <el-descriptions-item label="冷量/市电 · 中位数">
                  <span class="detail-mono">{{ copDisplay.median }}</span>
                </el-descriptions-item>
              </el-descriptions>
            </template>
            <el-alert v-else-if="cop?.note" :title="cop.note" type="warning" show-icon :closable="false" />
            <el-empty v-else-if="!loading" description="暂无 COP 分析结果" :image-size="80" />
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>
  </div>
</template>

<style scoped>
.w-full {
  width: 100%;
}

.label-cal {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.toolbar-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 4px;
}

.section-hint {
  font-size: 12px;
  font-weight: 400;
  color: rgba(0, 0, 0, 0.35);
}

.mb {
  margin-bottom: 12px;
}

.analysis-tabs :deep(.el-tabs__header) {
  margin-bottom: 12px;
}

.detail-tab {
  min-height: 120px;
}

.detail-desc :deep(.el-descriptions__label) {
  width: 108px;
  font-weight: 500;
}

.detail-mono {
  font-variant-numeric: tabular-nums;
  word-break: break-all;
}

.detail-buildings {
  font-size: 13px;
  color: rgba(0, 0, 0, 0.65);
  line-height: 1.5;
}

.detail-table :deep(.el-table__header th) {
  background: #fafafa;
}

.col-hint {
  display: block;
  font-size: 11px;
  font-weight: 400;
  color: rgba(0, 0, 0, 0.38);
  line-height: 1.2;
  margin-top: 2px;
}

.detail-footnote {
  margin: 10px 0 0;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.42);
  line-height: 1.5;
}

.detail-em {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.detail-sub {
  margin-left: 6px;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.42);
}

.detail-table-title {
  font-size: 13px;
  font-weight: 600;
  color: rgba(0, 0, 0, 0.75);
  margin-bottom: 8px;
}

.detail-table-wrap {
  margin-top: 4px;
}

</style>
