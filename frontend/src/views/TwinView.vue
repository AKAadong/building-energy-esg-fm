<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { Picture, Document, CircleCheck } from '@element-plus/icons-vue'
import AppChart from '@/components/AppChart.vue'
import * as api from '@/api'
import { ElMessage } from 'element-plus'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
const activeTab = ref('vision')

/** 视觉 */
const uploadResult = ref(null)
const loadingUpload = ref(false)

const prompt = ref('')
const conf = ref(undefined)
/** 更大 imgsz 一般利于小目标定位，推理更慢 */
const worldImgsz = ref(1280)
const worldIou = ref(0.42)
const visionMode = ref('world')
const fileList = ref([])
const panelCollapsed = ref(false)
const showAdvancedParams = ref(false)
const showGrid = ref(true)
const inferPreset = ref('none')

const previewUrl = ref('')
const modelHost = ref(null)
const modelCanvas = ref(null)
const modelReady = ref(false)
const uploadRef = ref(null)
const selectedFile = ref(null)

function _setPreviewFromFile(raw) {
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = ''
  }
  if (raw instanceof File) {
    previewUrl.value = URL.createObjectURL(raw)
  }
}

function onUploadChange(uploadFile, uploadFiles) {
  // 仅保留最后一张，避免旧文件残留导致“识别还是上一张”
  const latest = uploadFiles?.length ? uploadFiles[uploadFiles.length - 1] : null
  fileList.value = latest ? [latest] : []
  selectedFile.value = latest?.raw instanceof File ? latest.raw : null
  _setPreviewFromFile(selectedFile.value)
  // 新选文件时清空旧结果，避免右侧误显示旧建模
  uploadResult.value = null
  _disposeModel()
}

function onUploadExceed(files) {
  // limit=1 时默认不替换；这里改成“新图覆盖旧图”
  const f = files?.[0]
  if (!(f instanceof File)) return
  if (uploadRef.value) {
    uploadRef.value.clearFiles()
    uploadRef.value.handleStart(f)
  }
  selectedFile.value = f
  _setPreviewFromFile(f)
  uploadResult.value = null
  _disposeModel()
}

onUnmounted(() => {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  _disposeModel()
})

const modelBoxes = computed(() => {
  const r = uploadResult.value
  const boxes = r?.yolo?.boxes ?? r?.boxes
  if (!Array.isArray(boxes)) return []
  return boxes
    .map((b) => ({
      label: b?.label ?? 'object',
      conf: b?.conf ?? b?.confidence ?? null,
      bbox: Array.isArray(b?.bbox_xyxy) ? b.bbox_xyxy : (Array.isArray(b?.bbox) ? b.bbox : null),
    }))
    .filter((x) => Array.isArray(x.bbox) && x.bbox.length >= 4)
})

/** 与 BoxGeometry 一致：w=宽(X)、h=高(Y)、d=深(Z)；单位与房间场景一致（米级示意） */
const objectDims = ref([])
const selectedObjIdx = ref(0)

function _defaultDimsForBox(it, imgW, imgH) {
  const roomW = 10
  const roomD = 7
  const [x1, y1, x2, y2] = it.bbox.map((x) => Number(x) || 0)
  const bw = Math.max(8, Math.abs(x2 - x1))
  const bh = Math.max(8, Math.abs(y2 - y1))
  const sx = Math.max(0.16, (bw / imgW) * roomW * 0.56)
  const sz = Math.max(0.16, (bh / imgH) * roomD * 0.56)
  const sy = Math.min(1.3, Math.max(0.16, 0.12 + (it.conf == null ? 0.22 : Number(it.conf) * 0.68)))
  return { w: sx, h: sy, d: sz }
}

function resetObjectDimensions() {
  const boxes = modelBoxes.value
  if (!boxes.length) {
    objectDims.value = []
    return
  }
  const imgW = Number(uploadResult.value?.yolo?.image_size?.w) || 1000
  const imgH = Number(uploadResult.value?.yolo?.image_size?.h) || 1000
  objectDims.value = boxes.map((it) => {
    const o = _defaultDimsForBox(it, imgW, imgH)
    return { w: o.w, h: o.h, d: o.d }
  })
}

function applyObjectDimsToScene() {
  const boxes = modelBoxes.value
  if (!boxes.length) return
  const imgW = Number(uploadResult.value?.yolo?.image_size?.w) || 1000
  const imgH = Number(uploadResult.value?.yolo?.image_size?.h) || 1000
  objectDims.value.forEach((row, i) => {
    const it = boxes[i]
    if (!it) return
    if (!row || row.w <= 0 || row.h <= 0 || row.d <= 0) {
      const d0 = _defaultDimsForBox(it, imgW, imgH)
      objectDims.value[i] = { w: d0.w, h: d0.h, d: d0.d }
      return
    }
    row.w = THREE.MathUtils.clamp(Number(row.w) || 0.2, 0.08, 8)
    row.h = THREE.MathUtils.clamp(Number(row.h) || 0.2, 0.08, 3)
    row.d = THREE.MathUtils.clamp(Number(row.d) || 0.2, 0.08, 8)
  })
  _applyObjectDimsInPlace()
}

/**
 * 仅替换物体 BoxGeometry，保留位置与旋转；按旧几何与落点微调 y / 墙面法向偏移，避免穿模。
 * 场景尚未建立时回退为整场景重建。
 */
function _applyObjectDimsInPlace() {
  if (!modelScene || !modelDragMeshes.length) {
    nextTick(() => _buildModelFromDetections())
    return
  }
  const boxes = modelBoxes.value
  const n = Math.min(60, boxes.length, modelDragMeshes.length)
  const halfRoomY = 2.6
  const epsR = 0.12
  for (let idx = 0; idx < n; idx++) {
    const mesh = modelDragMeshes[idx]
    const row = objectDims.value[idx]
    if (!mesh?.geometry || !row) continue

    const sx = THREE.MathUtils.clamp(Number(row.w), 0.08, 8)
    const sy = THREE.MathUtils.clamp(Number(row.h), 0.08, 3)
    const sz = THREE.MathUtils.clamp(Number(row.d), 0.08, 8)

    const oldGeo = mesh.geometry
    const oldDepth = oldGeo.parameters?.depth ?? sz
    const oldRx = mesh.rotation.x
    const oldRy = mesh.rotation.y
    const oldRz = mesh.rotation.z

    oldGeo.dispose()
    mesh.geometry = new THREE.BoxGeometry(sx, sy, sz)
    mesh.rotation.set(oldRx, oldRy, oldRz)

    const halfY = sy / 2

    if (Math.abs(oldRy) < epsR && Math.abs(oldRx) < epsR && Math.abs(oldRz) < epsR) {
      const backZAnchor = -3.5 + oldDepth / 2
      if (Math.abs(mesh.position.z - backZAnchor) < 0.42) {
        mesh.position.z = -3.5 + sz / 2
      } else {
        mesh.position.y = halfY
      }
    } else if (Math.abs(oldRy - Math.PI / 2) < epsR) {
      const leftXAnchor = -5 + oldDepth / 2
      const rightXAnchor = 5 - oldDepth / 2
      if (Math.abs(mesh.position.x - leftXAnchor) <= Math.abs(mesh.position.x - rightXAnchor)) {
        mesh.position.x = -5 + sz / 2
      } else {
        mesh.position.x = 5 - sz / 2
      }
      mesh.position.y = THREE.MathUtils.clamp(mesh.position.y, halfY, halfRoomY - halfY)
    }

    mesh.children.forEach((ch) => {
      if (ch.type === 'Sprite') ch.position.set(0, sy / 2 + 0.35, 0)
    })
  }
  _syncObjectHighlight()
}

const twinSceneVolumeSum = computed(() => {
  let s = 0
  const dims = objectDims.value
  const n = Math.min(dims.length, 60)
  for (let i = 0; i < n; i++) {
    const r = dims[i]
    if (r?.w && r?.h && r?.d) s += Number(r.w) * Number(r.h) * Number(r.d)
  }
  return s
})

/** 演示级：与后端 Prophet 分离；体量系数与「电器台数」分项展示，避免与建筑级预测混为一谈 */
const twinAssetHealthSummary = computed(() => uploadResult.value?.asset_health?.summary ?? null)
const twinAssetAttentionCount = computed(() => Number(twinAssetHealthSummary.value?.needs_attention ?? 0))
const heroRiskClass = computed(() => {
  const n = twinAssetAttentionCount.value
  if (n >= 3) return 'hero-kpi-card--danger'
  if (n >= 1) return 'hero-kpi-card--warn'
  return 'hero-kpi-card--safe'
})
const twinVolumeHeuristicKwh = computed(() => (twinSceneVolumeSum.value * 0.0085).toFixed(3))
const twinApplianceExtraKwh = computed(() => {
  const n = Number(twinAssetHealthSummary.value?.electric_appliance_detections ?? 0)
  return (Math.max(0, n) * 0.12).toFixed(3)
})
const twinDemoLoadTotalKwh = computed(() => {
  const v = Number(twinVolumeHeuristicKwh.value)
  const a = Number(twinApplianceExtraKwh.value)
  if (Number.isNaN(v) || Number.isNaN(a)) return '—'
  return (v + a).toFixed(3)
})

const twinForecastHorizon = ref(48)
const twinForecastEnergy = ref(null)
const loadingTwinForecastEnergy = ref(false)

function modelLabelTwin(m) {
  const map = {
    prophet: 'Prophet',
    naive_moving_average: '滑动平均',
    naive_fallback: '滑动平均（回退）',
    none: '无数据',
  }
  return map[m] ?? (m || '—')
}

function applyInferPreset(name) {
  inferPreset.value = name
  if (name === 'office') {
    prompt.value = 'person,chair,desk,monitor,laptop,air conditioner,lamp'
    conf.value = 0.18
    worldImgsz.value = 1280
    worldIou.value = 0.42
    visionMode.value = 'world'
    return
  }
  if (name === 'meeting') {
    prompt.value = 'person,chair,dining table,monitor,projector,air conditioner,lamp'
    conf.value = 0.15
    worldImgsz.value = 1280
    worldIou.value = 0.38
    visionMode.value = 'world'
    return
  }
  if (name === 'server') {
    prompt.value = 'server rack,computer,laptop,monitor,air conditioner,fan,cable'
    conf.value = 0.12
    worldImgsz.value = 1600
    worldIou.value = 0.45
    visionMode.value = 'world'
  }
}

function resetInferDefaults() {
  inferPreset.value = 'none'
  prompt.value = ''
  conf.value = undefined
  worldImgsz.value = 1280
  worldIou.value = 0.42
  visionMode.value = 'world'
}

const twinForecastLabels = computed(
  () => twinForecastEnergy.value?.labels ?? twinForecastEnergy.value?.times ?? [],
)
const twinForecastValues = computed(
  () => twinForecastEnergy.value?.values ?? twinForecastEnergy.value?.forecast ?? [],
)

const twinForecastMeanKwh = computed(() => {
  const arr = twinForecastValues.value
  if (!arr.length) return null
  const s = arr.reduce((acc, x) => acc + Number(x || 0), 0)
  return (s / arr.length).toFixed(3)
})
const twinForecastPeakKwh = computed(() => {
  const arr = twinForecastValues.value.map((x) => Number(x || 0))
  if (!arr.length) return null
  return Math.max(...arr).toFixed(3)
})
const twinForecastMinKwh = computed(() => {
  const arr = twinForecastValues.value.map((x) => Number(x || 0))
  if (!arr.length) return null
  return Math.min(...arr).toFixed(3)
})
const twinForecastDeltaKwh = computed(() => {
  if (twinForecastPeakKwh.value == null || twinForecastMinKwh.value == null) return null
  return (Number(twinForecastPeakKwh.value) - Number(twinForecastMinKwh.value)).toFixed(3)
})

const twinForecastHeadLine = computed(() => {
  const f = twinForecastEnergy.value
  if (!f) return ''
  const m = modelLabelTwin(f.model)
  const h = f.horizon_hours != null ? `${f.horizon_hours}h` : ''
  return h ? `${m} · ${h}` : m
})

const twinForecastOption = computed(() => {
  const labels = twinForecastLabels.value
  const n = labels.length
  const values = twinForecastValues.value.map((v) => (v == null ? 0 : Number(v)))
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

async function loadTwinForecastEnergy() {
  loadingTwinForecastEnergy.value = true
  try {
    const params = { horizon_hours: twinForecastHorizon.value }
    if (twinBuildingId.value) params.building_id = twinBuildingId.value
    twinForecastEnergy.value = await api.getV2ForecastEnergy(params)
  } catch (e) {
    twinForecastEnergy.value = null
    ElMessage.error(e.message ?? '能耗预测加载失败')
  } finally {
    loadingTwinForecastEnergy.value = false
  }
}

/** 运营建议：所选建筑能耗规则 + 本页视觉推导 */
const buildings = ref([])
const twinBuildingId = ref('')
const opsSuggestions = ref(null)
const loadingSuggestions = ref(false)
const opsSourceFilter = ref('all')
const opsPriorityFilter = ref('all')
const opsKeyword = ref('')

function priorityMeta(p) {
  const map = {
    high: { label: '高', type: 'danger' },
    medium: { label: '中', type: 'warning' },
    low: { label: '低', type: 'info' },
    info: { label: '提示', type: 'info' },
  }
  return map[p] ?? { label: p || '—', type: 'info' }
}

async function loadBuildingsForTwin() {
  const data = await api.getBuildings().catch(() => ({ items: [] }))
  buildings.value = data.items ?? []
}

async function loadOpsSuggestionsTwin() {
  if (!twinBuildingId.value) {
    opsSuggestions.value = null
    return
  }
  loadingSuggestions.value = true
  try {
    opsSuggestions.value = await api.getV2OpsSuggestions({ building_id: twinBuildingId.value })
  } catch {
    opsSuggestions.value = null
  } finally {
    loadingSuggestions.value = false
  }
}

const visionDerivedTips = computed(() => {
  const det = uploadResult.value?.yolo?.detections
  const tips = []
  if (!det || typeof det !== 'object') return tips
  let lights = 0
  let furn = 0
  let people = 0
  for (const [k, v] of Object.entries(det)) {
    const n = Number(v) || 0
    const kl = String(k).toLowerCase()
    if (kl.includes('lamp') || kl.includes('light')) lights += n
    if (kl.includes('chair') || kl.includes('desk') || kl.includes('table') || kl.includes('sofa')) furn += n
    if (kl.includes('person') || kl.includes('people')) people += n
  }
  const applianceAttn = Number(twinAssetHealthSummary.value?.needs_attention ?? 0)
  const applianceCount = Number(twinAssetHealthSummary.value?.electric_appliance_detections ?? 0)
  const forecastDelta = Number(twinForecastDeltaKwh.value ?? 0)
  if (lights >= 2) {
    tips.push({
      priority: 'medium',
      title:
        '识别到多组照明相关目标，建议结合照度与作息做分区调光或人走灯灭，降低电器用电与峰时负荷。',
      expected_effect: '照明节电',
      source: 'vision',
    })
  }
  if (furn >= 5 && people <= 1 && modelBoxes.value.length >= 10) {
    tips.push({
      priority: 'low',
      title: '家具/工位目标较多而人员检出偏少，空间利用可能偏低，建议复核工位分配与共享策略。',
      expected_effect: '空间利用',
      source: 'vision',
    })
  }
  if (people >= 2) {
    tips.push({
      priority: 'medium',
      title:
        '检出多名人员，人员密度上升时空调与新风负荷往往增加，可对照「运营与预测」中的市电预测曲线做提前干预。',
      expected_effect: '负荷与预测',
      source: 'vision',
    })
  }
  if (applianceAttn >= 1 && applianceCount >= 2) {
    tips.push({
      priority: applianceAttn >= 2 ? 'high' : 'medium',
      title: '识别到需关注电器，建议优先排查对应回路并核对分项计量是否存在异常抬升。',
      expected_effect: '电器风险排查',
      source: 'vision',
    })
  }
  if (forecastDelta >= 3.2) {
    tips.push({
      priority: 'medium',
      title: '预测曲线峰谷差偏大，建议联动负荷策略与启停计划，优先平滑高峰时段。',
      expected_effect: '负荷平滑',
      source: 'vision',
    })
  }
  if (modelBoxes.value.length >= 10 && people === 0 && applianceAttn === 0) {
    tips.push({
      priority: 'low',
      title: '场景中目标较密集，建议结合分项计量与电器用电分解预测，细化分区用能。',
      expected_effect: '分项计量',
      source: 'vision',
    })
  }
  return tips
})

const mergedOpsRows = computed(() => {
  const demoLoad = Number(twinDemoLoadTotalKwh.value)
  const forecastMean = Number(twinForecastMeanKwh.value ?? 0)
  const volumeLoad = Number(twinVolumeHeuristicKwh.value)
  const applianceLoad = Number(twinApplianceExtraKwh.value)
  const sceneRatio = forecastMean > 1e-6 ? demoLoad / forecastMean : 0
  const sceneTips = []

  if (forecastMean > 0) {
    if (sceneRatio <= 0.02) {
      sceneTips.push({
        priority: 'info',
        title: `场景示意负荷约 ${demoLoad.toFixed(3)} kWh/h（占预测均值 ${(sceneRatio * 100).toFixed(2)}%），当前高基荷更可能来自未入镜设备或公共系统。`,
        expected_effect: '建议补充分项计量与公区负荷排查',
        source: 'scene',
      })
    } else if (sceneRatio <= 0.08) {
      sceneTips.push({
        priority: 'low',
        title: `场景示意负荷约 ${demoLoad.toFixed(3)} kWh/h（占预测均值 ${(sceneRatio * 100).toFixed(2)}%），可先优化场景内设备调度，再联动建筑策略。`,
        expected_effect: '场景+建筑联合优化',
        source: 'scene',
      })
    } else {
      sceneTips.push({
        priority: 'medium',
        title: `场景示意负荷占比较高（${(sceneRatio * 100).toFixed(2)}%），建议优先治理当前场景设备启停与待机策略。`,
        expected_effect: '场景侧削峰与节电',
        source: 'scene',
      })
    }
  }

  if (applianceLoad >= 0.5) {
    sceneTips.push({
      priority: 'medium',
      title: `电器示意附加约 ${applianceLoad.toFixed(3)} kWh/h，建议优先核查识别到的电器回路与待机负载。`,
      expected_effect: '电器回路优化',
      source: 'scene',
    })
  }

  if (volumeLoad > 0 && applianceLoad > volumeLoad * 3.5) {
    sceneTips.push({
      priority: 'info',
      title: '当前示意负荷主要来自电器检出而非体量，建议重点排查电器开关策略与待机用电。',
      expected_effect: '电器侧精细化控制',
      source: 'scene',
    })
  }

  const apiItems = twinBuildingId.value ? (opsSuggestions.value?.items ?? []).map((r) => ({ ...r, source: 'energy' })) : []
  return [...sceneTips, ...visionDerivedTips.value, ...apiItems]
})

const filteredOpsRows = computed(() => {
  const kw = opsKeyword.value.trim().toLowerCase()
  return mergedOpsRows.value.filter((row) => {
    if (opsSourceFilter.value !== 'all' && row.source !== opsSourceFilter.value) return false
    if (opsPriorityFilter.value !== 'all' && String(row.priority || '') !== opsPriorityFilter.value) return false
    if (!kw) return true
    const title = String(row.title || '').toLowerCase()
    const ext = String(fmtSuggestionExpected(row) || '').toLowerCase()
    return title.includes(kw) || ext.includes(kw)
  })
})

function fmtSuggestionExpected(row) {
  if (row.expected_saving_kwh_per_hour != null) {
    return `≈ ${Number(row.expected_saving_kwh_per_hour).toLocaleString('zh-CN', { maximumFractionDigits: 2 })} kWh/h`
  }
  if (row.expected_effect) return row.expected_effect
  return '—'
}

function exportOpsRowsCsv() {
  const rows = filteredOpsRows.value
  if (!rows.length) {
    ElMessage.warning('当前无可导出的建议')
    return
  }
  const header = ['来源', '优先级', '建议内容', '预期/说明']
  const body = rows.map((r) => [
    r.source === 'vision' ? '视觉' : r.source === 'scene' ? '场景' : '能耗',
    priorityMeta(r.priority).label,
    String(r.title || ''),
    String(fmtSuggestionExpected(r) || ''),
  ])
  const esc = (v) => `"${String(v).replace(/"/g, '""')}"`
  const csv = [header, ...body].map((line) => line.map(esc).join(',')).join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const ts = new Date()
  const p2 = (x) => String(x).padStart(2, '0')
  const stamp = `${ts.getFullYear()}${p2(ts.getMonth() + 1)}${p2(ts.getDate())}_${p2(ts.getHours())}${p2(ts.getMinutes())}`
  a.href = url
  a.download = `ops_suggestions_${stamp}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

watch(twinBuildingId, () => {
  twinForecastEnergy.value = null
  loadOpsSuggestionsTwin()
})

const previewFileName = computed(() => {
  const raw = selectedFile.value ?? fileList.value?.[0]?.raw
  if (raw instanceof File) return raw.name
  return ''
})

const previewImageMeta = computed(() => {
  const r = uploadResult.value
  const w = r?.yolo?.image_size?.w
  const h = r?.yolo?.image_size?.h
  if (w != null && h != null) return { w: Number(w), h: Number(h) }
  return null
})

watch(
  [modelBoxes, activeTab],
  async ([boxes, tab]) => {
    if (tab !== 'vision') return
    if (!boxes.length) {
      objectDims.value = []
      _disposeModel()
      return
    }
    resetObjectDimensions()
    if (selectedObjIdx.value >= boxes.length) selectedObjIdx.value = 0
    await nextTick()
    _buildModelFromDetections()
  },
  { deep: true },
)

watch(selectedObjIdx, () => {
  nextTick(() => _syncObjectHighlight())
})

let modelRenderer = null
let modelScene = null
let modelCamera = null
let modelControls = null
let modelFrame = 0
let modelMeshes = []
let modelDragMeshes = []
let modelSurfaceMeshes = []
let surfaceBaseColors = new Map()
let modelGrid = null
let modelRaycaster = null
let modelMouse = null
const dragState = {
  active: false,
  mesh: null,
}

function _disposeModel() {
  if (modelFrame) {
    cancelAnimationFrame(modelFrame)
    modelFrame = 0
  }
  if (modelRenderer) {
    _unbindModelDrag()
    modelRenderer.dispose()
    const el = modelRenderer.domElement
    if (el && el.parentNode) el.parentNode.removeChild(el)
  }
  for (const m of modelMeshes) {
    if (m.geometry) m.geometry.dispose()
    if (Array.isArray(m.material)) m.material.forEach((mat) => mat.dispose && mat.dispose())
    else if (m.material) m.material.dispose && m.material.dispose()
  }
  modelMeshes = []
  modelRenderer = null
  modelScene = null
  modelCamera = null
  modelControls = null
  modelDragMeshes = []
  modelSurfaceMeshes = []
  surfaceBaseColors = new Map()
  modelGrid = null
  modelRaycaster = null
  modelMouse = null
  dragState.active = false
  dragState.mesh = null
  modelReady.value = false
}

function _labelColor(label) {
  const s = String(label || '').toLowerCase()
  if (s.includes('person')) return 0x60a5fa
  if (s.includes('chair') || s.includes('sofa')) return 0xf59e0b
  if (s.includes('desk') || s.includes('table')) return 0x22c55e
  if (s.includes('light') || s.includes('lamp')) return 0xeab308
  return 0xa78bfa
}

function _makeTextSprite(text) {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 64
  const ctx = c.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = 'rgba(15,23,42,0.84)'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 24px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(text || 'object').slice(0, 18), c.width / 2, c.height / 2)
  const tex = new THREE.CanvasTexture(c)
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true })
  const sp = new THREE.Sprite(mat)
  sp.scale.set(1.8, 0.45, 1)
  return sp
}

function _getMouseNdc(ev) {
  const rect = modelRenderer.domElement.getBoundingClientRect()
  modelMouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1
  modelMouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1
}

function _bindModelDrag() {
  if (!modelRenderer || !modelCamera) return
  const dom = modelRenderer.domElement
  modelRaycaster = new THREE.Raycaster()
  modelMouse = new THREE.Vector2()

  const onDown = (ev) => {
    _getMouseNdc(ev)
    modelRaycaster.setFromCamera(modelMouse, modelCamera)
    const hits = modelRaycaster.intersectObjects(modelDragMeshes, false)
    if (!hits.length) return
    dragState.active = true
    dragState.mesh = hits[0].object
    const bi = hits[0].object?.userData?.boxIndex
    if (typeof bi === 'number' && bi >= 0) selectedObjIdx.value = bi
    if (modelControls) modelControls.enabled = false
  }
  const onMove = (ev) => {
    if (!dragState.active || !dragState.mesh) return
    _getMouseNdc(ev)
    modelRaycaster.setFromCamera(modelMouse, modelCamera)
    const hits = modelRaycaster.intersectObjects(modelSurfaceMeshes, false)
    if (!hits.length) return
    const hit = hits[0]
    for (const s of modelSurfaceMeshes) {
      if (s.material && s.material.color) {
        const base = surfaceBaseColors.get(s.uuid)
        if (base) s.material.color.set(base)
      }
    }
    if (hit.object?.material?.color) hit.object.material.color.set(0x93c5fd)

    const mesh = dragState.mesh
    const halfY = Math.max(0.12, mesh.scale?.y ? mesh.scale.y / 2 : (mesh.geometry?.parameters?.height || 0.4) / 2)
    const userSurface = hit.object?.userData?.surface

    // floor: normal placement
    if (userSurface === 'floor') {
      mesh.rotation.set(0, 0, 0)
      mesh.position.x = THREE.MathUtils.clamp(hit.point.x, -4.8, 4.8)
      mesh.position.z = THREE.MathUtils.clamp(hit.point.z, -3.3, 3.3)
      mesh.position.y = halfY
      return
    }

    // back wall z=-3.5
    if (userSurface === 'back') {
      mesh.rotation.set(0, 0, 0)
      mesh.position.x = THREE.MathUtils.clamp(hit.point.x, -4.8, 4.8)
      mesh.position.y = THREE.MathUtils.clamp(hit.point.y, halfY, 2.6 - halfY)
      mesh.position.z = -3.5 + (mesh.geometry?.parameters?.depth || 0.3) / 2
      return
    }

    // left / right walls
    if (userSurface === 'left') {
      mesh.rotation.set(0, Math.PI / 2, 0)
      mesh.position.x = -5 + (mesh.geometry?.parameters?.depth || 0.3) / 2
      mesh.position.y = THREE.MathUtils.clamp(hit.point.y, halfY, 2.6 - halfY)
      mesh.position.z = THREE.MathUtils.clamp(hit.point.z, -3.3, 3.3)
      return
    }
    if (userSurface === 'right') {
      mesh.rotation.set(0, Math.PI / 2, 0)
      mesh.position.x = 5 - (mesh.geometry?.parameters?.depth || 0.3) / 2
      mesh.position.y = THREE.MathUtils.clamp(hit.point.y, halfY, 2.6 - halfY)
      mesh.position.z = THREE.MathUtils.clamp(hit.point.z, -3.3, 3.3)
    }
  }
  const onUp = () => {
    dragState.active = false
    dragState.mesh = null
    for (const s of modelSurfaceMeshes) {
      if (s.material && s.material.color) {
        const base = surfaceBaseColors.get(s.uuid)
        if (base) s.material.color.set(base)
      }
    }
    if (modelControls) modelControls.enabled = true
  }

  dom.addEventListener('pointerdown', onDown)
  dom.addEventListener('pointermove', onMove)
  dom.addEventListener('pointerup', onUp)
  dom.addEventListener('pointerleave', onUp)
  dom.__modelDragHandlers = { onDown, onMove, onUp }
}

function _unbindModelDrag() {
  if (!modelRenderer) return
  const dom = modelRenderer.domElement
  const h = dom.__modelDragHandlers
  if (!h) return
  dom.removeEventListener('pointerdown', h.onDown)
  dom.removeEventListener('pointermove', h.onMove)
  dom.removeEventListener('pointerup', h.onUp)
  dom.removeEventListener('pointerleave', h.onUp)
  delete dom.__modelDragHandlers
}

function _syncObjectHighlight() {
  if (!modelDragMeshes.length) return
  modelDragMeshes.forEach((m, i) => {
    const mat = m.material
    if (!mat || mat.emissive == null) return
    const sel = i === selectedObjIdx.value
    mat.emissive.setHex(sel ? 0x1e3a8a : 0x000000)
    mat.emissiveIntensity = sel ? 0.55 : 0
  })
}

function _buildModelFromDetections() {
  const host = modelHost.value
  const mount = modelCanvas.value
  if (!host || !mount) return
  _disposeModel()

  const w = Math.max(320, host.clientWidth || 320)
  const h = Math.max(220, host.clientHeight || 220)
  modelRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  modelRenderer.setSize(w, h)
  mount.innerHTML = ''
  mount.appendChild(modelRenderer.domElement)

  modelScene = new THREE.Scene()
  modelScene.background = new THREE.Color(0x0b1220)
  modelCamera = new THREE.PerspectiveCamera(50, w / h, 0.1, 200)
  modelCamera.position.set(0, 7.8, 12.5)
  modelCamera.lookAt(0, 1.2, 0)
  modelControls = new OrbitControls(modelCamera, modelRenderer.domElement)
  modelControls.enableDamping = true
  modelControls.dampingFactor = 0.06
  modelControls.target.set(0, 1.1, 0)
  modelControls.update()

  modelScene.add(new THREE.AmbientLight(0xffffff, 0.85))
  const dl = new THREE.DirectionalLight(0xffffff, 0.9)
  dl.position.set(6, 10, 4)
  modelScene.add(dl)
  modelGrid = new THREE.GridHelper(12, 24, 0x334155, 0x1e293b)
  modelGrid.position.y = 0.01
  modelGrid.visible = !!showGrid.value
  modelScene.add(modelGrid)
  modelMeshes.push(modelGrid)

  const roomW = 10
  const roomD = 7
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.92 })
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(roomW, 0.2, roomD),
    floorMat,
  )
  floor.position.set(0, -0.1, 0)
  floor.userData.surface = 'floor'
  modelScene.add(floor)
  modelMeshes.push(floor)
  modelSurfaceMeshes.push(floor)

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.98 })
  const wallBack = new THREE.Mesh(new THREE.BoxGeometry(roomW, 2.8, 0.14), wallMat)
  wallBack.position.set(0, 1.3, -roomD / 2)
  wallBack.userData.surface = 'back'
  modelScene.add(wallBack)
  modelMeshes.push(wallBack)
  modelSurfaceMeshes.push(wallBack)
  const wallLeft = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.8, roomD), wallMat)
  wallLeft.position.set(-roomW / 2, 1.3, 0)
  wallLeft.userData.surface = 'left'
  modelScene.add(wallLeft)
  modelMeshes.push(wallLeft)
  modelSurfaceMeshes.push(wallLeft)
  const wallRight = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.8, roomD), wallMat)
  wallRight.position.set(roomW / 2, 1.3, 0)
  wallRight.userData.surface = 'right'
  modelScene.add(wallRight)
  modelMeshes.push(wallRight)
  modelSurfaceMeshes.push(wallRight)
  for (const s of modelSurfaceMeshes) {
    if (s.material?.color) surfaceBaseColors.set(s.uuid, `#${s.material.color.getHexString()}`)
  }

  const imgW = Number(uploadResult.value?.yolo?.image_size?.w) || 1000
  const imgH = Number(uploadResult.value?.yolo?.image_size?.h) || 1000

  modelBoxes.value.slice(0, 60).forEach((it, idx) => {
    const [x1, y1, x2, y2] = it.bbox.map((x) => Number(x) || 0)
    const cx = (x1 + x2) / 2
    const cy = (y1 + y2) / 2

    const dimRow = objectDims.value[idx]
    let sx
    let sy
    let sz
    if (dimRow && dimRow.w > 0 && dimRow.h > 0 && dimRow.d > 0) {
      sx = THREE.MathUtils.clamp(Number(dimRow.w), 0.08, 8)
      sy = THREE.MathUtils.clamp(Number(dimRow.h), 0.08, 3)
      sz = THREE.MathUtils.clamp(Number(dimRow.d), 0.08, 8)
    } else {
      const d0 = _defaultDimsForBox(it, imgW, imgH)
      sx = d0.w
      sy = d0.h
      sz = d0.d
    }

    const px = (cx / imgW - 0.5) * roomW
    const pz = (cy / imgH - 0.5) * roomD

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(sx, sy, sz),
      new THREE.MeshStandardMaterial({
        color: _labelColor(it.label),
        transparent: true,
        opacity: 0.9,
        roughness: 0.65,
        emissive: new THREE.Color(0x000000),
        emissiveIntensity: 0,
      }),
    )
    mesh.userData.boxIndex = idx
    mesh.position.set(px, sy / 2, pz)
    modelScene.add(mesh)
    modelMeshes.push(mesh)
    modelDragMeshes.push(mesh)
    const label = _makeTextSprite(it.label)
    if (label) {
      label.position.set(0, sy / 2 + 0.35, 0)
      mesh.add(label)
      modelMeshes.push(label)
    }
  })

  _bindModelDrag()
  _syncObjectHighlight()

  const render = () => {
    if (!modelRenderer || !modelScene || !modelCamera) return
    if (modelControls) modelControls.update()
    modelRenderer.render(modelScene, modelCamera)
    modelFrame = requestAnimationFrame(render)
  }
  modelReady.value = true
  render()
}

watch(showGrid, (v) => {
  if (modelGrid) modelGrid.visible = !!v
})

function resetView() {
  if (!modelCamera || !modelControls) return
  modelCamera.position.set(0, 7.8, 12.5)
  modelControls.target.set(0, 1.1, 0)
  modelControls.update()
}

async function runUpload() {
  const raw = selectedFile.value ?? fileList.value[0]?.raw
  if (!raw || !(raw instanceof File)) {
    ElMessage.warning('请先选择图片文件')
    return
  }
  loadingUpload.value = true
  uploadResult.value = null
  try {
    const p = {}
    p.mode = visionMode.value
    if (prompt.value.trim()) p.prompt = prompt.value.trim()
    if (conf.value != null && !Number.isNaN(Number(conf.value))) p.conf = Number(conf.value)
    p.iou = Number(worldIou.value)
    p.imgsz = Number(worldImgsz.value)
    uploadResult.value = await api.postV2VisionUpload(raw, p)
    await loadOpsSuggestionsTwin()
    if (twinBuildingId.value) await loadTwinForecastEnergy()
  } catch (e) {
    ElMessage.error(e.message ?? 'upload 调用失败')
  } finally {
    loadingUpload.value = false
  }
}

onMounted(async () => {
  activeTab.value = 'vision'
  await loadBuildingsForTwin()
  await loadOpsSuggestionsTwin()
})
</script>

<template>
  <div class="myems-page twin-vision-view twin-immersive">
    <div class="page-hero">
      <h1 class="myems-page-title">孪生与视觉</h1>
      <p class="myems-page-desc">
        上传空间图片后调用 <code>/api/v2/vision/upload</code>，自动生成可交互 3D 建模结果；建模完成后下方给出结合<strong>能耗数据</strong>与<strong>识别目标</strong>的运营建议。
      </p>
      <div class="hero-kpi-row">
        <div class="hero-kpi-card">
          <span class="hero-kpi-label">关联建筑</span>
          <strong class="hero-kpi-value">{{ twinBuildingId || '未选择' }}</strong>
        </div>
        <div class="hero-kpi-card">
          <span class="hero-kpi-label">识别目标数</span>
          <strong class="hero-kpi-value">{{ modelBoxes.length || 0 }}</strong>
        </div>
        <div class="hero-kpi-card">
          <span class="hero-kpi-label">预测均值</span>
          <strong class="hero-kpi-value">{{ twinForecastMeanKwh ?? '—' }}<em>kWh/h</em></strong>
        </div>
        <div class="hero-kpi-card" :class="heroRiskClass">
          <span class="hero-kpi-label">待关注电器</span>
          <strong class="hero-kpi-value">{{ twinAssetAttentionCount }}</strong>
        </div>
      </div>
      <div class="hero-building-row">
        <span class="hero-building-label">关联建筑（可选：不选则使用全局基线）</span>
        <el-select
          v-model="twinBuildingId"
          placeholder="选择建筑"
          clearable
          filterable
          size="small"
          class="hero-building-select"
          @change="loadOpsSuggestionsTwin"
        >
          <el-option
            v-for="b in buildings"
            :key="JSON.stringify(b)"
            :label="b.building_id ?? b.name ?? String(b)"
            :value="b.building_id ?? b.id"
          />
        </el-select>
      </div>
      <div class="hero-tips">
        <el-tag effect="light" type="primary">拖拽到墙面 / 地面</el-tag>
        <el-tag effect="light">滚轮缩放</el-tag>
        <el-tag effect="light">鼠标拖动旋转视角</el-tag>
      </div>
    </div>

    <div class="vision-layout">
      <div class="top-row">
        <el-card v-show="!panelCollapsed" shadow="never" class="ems-card control-panel">
          <template #header>
            <span class="card-title">识别参数</span>
          </template>
          <el-form label-position="top" class="control-form" size="default">
            <div class="control-section">
              <div class="section-head">
                <span class="section-title">推理设置</span>
                <span class="section-hint">支持 YOLO-World / YOLO12：提示词、置信度与分辨率</span>
              </div>
              <el-form-item label="识别模型" class="form-item-tight">
                <el-select v-model="visionMode" class="world-imgsz-select">
                  <el-option value="world" label="YOLO-World（开放词汇）" />
                  <el-option value="yolo12" label="YOLO12（封闭类别）" />
                </el-select>
              </el-form-item>
              <div class="preset-row">
                <span class="preset-label">识别预设</span>
                <div class="preset-actions">
                  <el-button
                    size="small"
                    :type="inferPreset === 'office' ? 'primary' : 'default'"
                    plain
                    @click="applyInferPreset('office')"
                  >
                    办公
                  </el-button>
                  <el-button
                    size="small"
                    :type="inferPreset === 'meeting' ? 'primary' : 'default'"
                    plain
                    @click="applyInferPreset('meeting')"
                  >
                    会议室
                  </el-button>
                  <el-button
                    size="small"
                    :type="inferPreset === 'server' ? 'primary' : 'default'"
                    plain
                    @click="applyInferPreset('server')"
                  >
                    机房
                  </el-button>
                  <el-button size="small" plain @click="resetInferDefaults">恢复默认</el-button>
                </div>
              </div>
              <div class="params-head-row">
                <el-form-item label="置信度 conf" class="form-item-slider basic-param">
                  <el-slider
                    v-model="conf"
                    :min="0.02"
                    :max="0.95"
                    :step="0.01"
                    show-input
                    :show-input-controls="false"
                  />
                  <p class="field-tip">不填则使用后端默认；拖动或输入数值</p>
                </el-form-item>
                <el-button text type="primary" class="advanced-toggle" @click="showAdvancedParams = !showAdvancedParams">
                  {{ showAdvancedParams ? '收起高级参数' : '展开高级参数' }}
                </el-button>
              </div>
              <div v-show="showAdvancedParams" class="advanced-param-wrap">
                <el-form-item label="prompt（可选）">
                  <el-input
                    v-model="prompt"
                    placeholder="英文类别，如 person, chair, desk"
                    clearable
                    maxlength="256"
                    show-word-limit
                  />
                </el-form-item>
                <el-form-item label="推理边长 imgsz" class="form-item-tight">
                  <el-select v-model="worldImgsz" class="world-imgsz-select">
                    <el-option :value="1024" label="1024（更快）" />
                    <el-option :value="1280" label="1280（推荐）" />
                    <el-option :value="1600" label="1600（更精细）" />
                  </el-select>
                  <p class="field-tip">更高分辨率通常有利于小目标框精度，显存与耗时增加。</p>
                </el-form-item>
                <el-form-item label="NMS IoU" class="form-item-slider">
                  <el-slider
                    v-model="worldIou"
                    :min="0.2"
                    :max="0.9"
                    :step="0.05"
                    show-input
                    :show-input-controls="false"
                  />
                  <p class="field-tip">略低可减少重复框；略高更易保留密集重叠目标。</p>
                </el-form-item>
              </div>
            </div>

            <el-divider class="control-divider" />

            <div class="control-section">
              <div class="section-head">
                <span class="section-title">图片</span>
                <span class="section-hint">单张，识别前可预览右侧</span>
              </div>
              <el-form-item class="form-item-upload">
                <el-upload
                  ref="uploadRef"
                  v-model:file-list="fileList"
                  drag
                  class="vision-upload"
                  :on-change="onUploadChange"
                  :on-exceed="onUploadExceed"
                  :auto-upload="false"
                  :limit="1"
                  accept="image/*"
                >
                  <el-icon class="upload-ico"><Picture /></el-icon>
                  <div class="upload-text">拖拽到此处，或点击选择</div>
                  <div class="upload-sub">常见图片格式；大小以后端限制为准</div>
                </el-upload>
              </el-form-item>
            </div>

            <div class="control-actions">
              <el-button
                type="primary"
                size="large"
                class="submit-primary"
                :loading="loadingUpload"
                :disabled="!fileList.length"
                @click="runUpload"
              >
                上传并建模
              </el-button>
              <p v-if="!fileList.length" class="action-tip">请先选择一张图片</p>
            </div>
          </el-form>
        </el-card>

        <el-card shadow="never" class="ems-card preview-panel">
          <template #header>
            <div class="model-header preview-card-header">
              <span class="card-title">识别原图</span>
              <div class="header-actions">
                <el-tag v-if="uploadResult" type="success" effect="light" size="small">已识别</el-tag>
                <el-tag v-else-if="previewUrl" type="warning" effect="light" size="small">待识别</el-tag>
                <el-tag v-else type="info" effect="plain" size="small">未选择</el-tag>
                <el-button text type="primary" size="small" @click="panelCollapsed = !panelCollapsed">
                  {{ panelCollapsed ? '展开参数' : '收起参数' }}
                </el-button>
              </div>
            </div>
          </template>
          <div class="preview-body">
            <div class="preview-stage-block">
              <div class="preview-stage-toolbar">
                <span class="preview-stage-label">
                  <el-icon class="preview-stage-ico"><Picture /></el-icon>
                  画面预览
                </span>
                <span v-if="previewFileName" class="preview-file-name" :title="previewFileName">
                  <el-icon class="file-ico"><Document /></el-icon>
                  {{ previewFileName }}
                </span>
              </div>
              <div class="preview-stage">
                <el-image
                  v-if="previewUrl"
                  :src="previewUrl"
                  fit="contain"
                  class="preview-img"
                />
                <div v-else class="preview-empty-wrap">
                  <el-empty description="暂无预览" :image-size="80">
                    <template #description>
                      <span class="preview-empty-text">在左侧选择或拖入图片后，此处显示原图</span>
                    </template>
                  </el-empty>
                </div>
              </div>
            </div>

            <div v-if="previewImageMeta || (uploadResult && modelBoxes.length)" class="preview-meta-bar">
              <template v-if="previewImageMeta">
                <span class="meta-pill">原图尺寸 {{ previewImageMeta.w }} × {{ previewImageMeta.h }}</span>
              </template>
              <template v-if="uploadResult && modelBoxes.length">
                <span class="meta-pill meta-pill--accent">检出 {{ modelBoxes.length }} 个目标</span>
              </template>
            </div>

            <div class="preview-tips">
              <div class="section-head preview-tips-head">
                <span class="section-title">说明</span>
                <span class="section-hint">与下方 3D 预览联动</span>
              </div>
              <ul class="preview-tip-list">
                <li>
                  <el-icon class="tip-ico"><CircleCheck /></el-icon>
                  <span>识别完成后，下方自动生成可交互 3D 场景。</span>
                </li>
                <li>
                  <el-icon class="tip-ico"><CircleCheck /></el-icon>
                  <span>物体模块可拖拽至地面与三面墙；标签随模块移动。</span>
                </li>
                <li>
                  <el-icon class="tip-ico"><CircleCheck /></el-icon>
                  <span>滚轮缩放视角，鼠标拖动旋转观察空间关系。</span>
                </li>
              </ul>
            </div>
          </div>
        </el-card>
      </div>

      <el-card shadow="never" class="ems-card model-panel full-row model-panel--stage">
        <template #header>
          <div class="model-header">
            <span class="card-title">3D 建模预览</span>
          </div>
        </template>
        <div ref="modelHost" class="model3d-host">
          <div ref="modelCanvas" class="model3d-canvas"></div>
          <div v-if="loadingUpload" class="model3d-skeleton">
            <el-skeleton :rows="5" animated />
          </div>
          <div class="canvas-float">
            <el-switch v-model="showGrid" size="small" inline-prompt active-text="网格" inactive-text="网格" />
            <el-button size="small" @click="resetView">重置视角</el-button>
          </div>
          <el-empty
            v-if="!modelReady"
            class="model3d-empty"
            description="上传并识别后自动生成 3D 模型"
            :image-size="64"
          />
        </div>
      </el-card>

      <el-card
        v-if="uploadResult && modelBoxes.length"
        shadow="never"
        class="ems-card object-energy-panel full-row"
      >
        <template #header>
          <div class="suggestions-card-head">
            <span class="card-title">物体尺寸与能耗预测</span>
            <span class="section-hint">调整长宽高后应用到 3D；预测为所选建筑后端时序结果</span>
          </div>
        </template>
        <el-row :gutter="20">
          <el-col :xs="24" :md="9">
            <el-form label-position="top" size="small" class="object-dim-form">
              <el-form-item label="选择物体">
                <el-select v-model="selectedObjIdx" filterable class="object-dim-select">
                  <el-option
                    v-for="(b, i) in modelBoxes"
                    :key="i"
                    :label="`${i + 1}. ${b.label}`"
                    :value="i"
                  />
                </el-select>
              </el-form-item>
              <el-alert
                v-if="selectedObjIdx >= 60"
                type="info"
                :closable="false"
                show-icon
                class="mb-sug"
                title="当前 3D 场景最多展示前 60 个检出目标；仍可记录尺寸供列表查看。"
              />
              <template v-if="objectDims[selectedObjIdx]">
                <el-form-item label="长（场景 X）">
                  <el-input-number
                    v-model="objectDims[selectedObjIdx].w"
                    :min="0.08"
                    :max="8"
                    :step="0.05"
                    controls-position="right"
                    class="dim-input"
                  />
                </el-form-item>
                <el-form-item label="高（场景 Y，贴地高度）">
                  <el-input-number
                    v-model="objectDims[selectedObjIdx].h"
                    :min="0.08"
                    :max="3"
                    :step="0.05"
                    controls-position="right"
                    class="dim-input"
                  />
                </el-form-item>
                <el-form-item label="深（场景 Z）">
                  <el-input-number
                    v-model="objectDims[selectedObjIdx].d"
                    :min="0.08"
                    :max="8"
                    :step="0.05"
                    controls-position="right"
                    class="dim-input"
                  />
                </el-form-item>
              </template>
              <el-button type="primary" class="apply-dim-btn" @click="applyObjectDimsToScene">
                应用到 3D 场景
              </el-button>
              <p class="field-tip">
                应用尺寸仅更新物体几何，保留当前摆放位置与旋转；贴墙时会按新厚度微调法向偏移以免穿模。场景未就绪时会整场景重建。仍可在场景中点击物体同步选中项。
              </p>
              <el-divider class="control-divider" />
              <p class="section-hint">演示估算（非计费）：前 60 个物体体积合计；负荷为示意分项，与右侧建筑时序预测独立</p>
              <p class="volume-line">
                <span class="volume-val">{{ twinSceneVolumeSum.toFixed(2) }}</span>
                <span class="volume-unit"> 体积单位³</span>
              </p>
              <p class="volume-line">
                建筑预测曲线均值（已拉取时）
                <span class="volume-val">{{ twinForecastMeanKwh ?? '—' }}</span>
                <span class="volume-unit"> kWh/h</span>
              </p>
              <p class="volume-line">
                体量示意附加
                <span class="volume-val">{{ twinVolumeHeuristicKwh }}</span>
                <span class="volume-unit"> kWh/h</span>
              </p>
              <p class="volume-line">
                电器检出示意附加（约 0.12×台）
                <span class="volume-val">{{ twinApplianceExtraKwh }}</span>
                <span class="volume-unit"> kWh/h</span>
              </p>
              <p class="volume-line">
                示意合计（体量+电器）
                <span class="volume-val">{{ twinDemoLoadTotalKwh }}</span>
                <span class="volume-unit"> kWh/h</span>
              </p>
            </el-form>
          </el-col>
          <el-col :xs="24" :md="15">
            <div v-loading="loadingTwinForecastEnergy" class="twin-forecast-block">
              <div v-if="loadingTwinForecastEnergy && !twinForecastLabels.length" class="forecast-skeleton">
                <el-skeleton :rows="4" animated />
              </div>
              <el-form label-position="top" size="small" class="forecast-inline-form">
                <el-form-item label="预测步长">
                  <el-select v-model="twinForecastHorizon" class="forecast-horizon-select">
                    <el-option :value="24" label="24h" />
                    <el-option :value="48" label="48h" />
                    <el-option :value="72" label="72h" />
                    <el-option :value="96" label="96h" />
                    <el-option :value="168" label="168h" />
                  </el-select>
                  <el-button
                    type="primary"
                    class="forecast-load-btn"
                    :loading="loadingTwinForecastEnergy"
                    @click="loadTwinForecastEnergy"
                  >
                    拉取能耗预测
                  </el-button>
                </el-form-item>
              </el-form>
              <el-alert
                v-if="!twinBuildingId"
                type="info"
                :closable="false"
                show-icon
                class="mb-sug"
                title="未选择建筑：当前预测基于全局样本；选择建筑后可切换为该建筑专属曲线。"
              />
              <p v-if="twinForecastHeadLine" class="forecast-head-line">{{ twinForecastHeadLine }}</p>
              <div v-if="twinForecastLabels.length" class="forecast-metrics-row">
                <span class="meta-pill meta-pill--accent">峰值 {{ twinForecastPeakKwh ?? '—' }} kWh/h</span>
                <span class="meta-pill">均值 {{ twinForecastMeanKwh ?? '—' }} kWh/h</span>
                <span class="meta-pill">最低 {{ twinForecastMinKwh ?? '—' }} kWh/h</span>
                <span class="meta-pill">峰谷差 {{ twinForecastDeltaKwh ?? '—' }} kWh/h</span>
              </div>
              <AppChart
                v-if="twinForecastLabels.length"
                :option="twinForecastOption"
                class="twin-forecast-chart"
              />
              <el-empty
                v-else-if="!loadingTwinForecastEnergy"
                description="点击「拉取能耗预测」查看市电 kWh/h 曲线"
                :image-size="72"
              />
            </div>
          </el-col>
        </el-row>
      </el-card>

      <el-card
        v-if="uploadResult?.asset_health"
        shadow="never"
        class="ems-card asset-health-panel full-row"
      >
        <template #header>
          <div class="suggestions-card-head">
            <span class="card-title">电器完好度与更换建议</span>
            <span class="section-hint">结合识别结果输出巡检优先级、寿命估计与更换建议</span>
          </div>
        </template>
        <el-alert
          v-if="!uploadResult.asset_health.available"
          type="warning"
          :closable="false"
          show-icon
          class="mb-sug"
          :title="uploadResult.asset_health.hint || '暂无电器健康评估'"
        />
        <p v-if="uploadResult.asset_health.summary?.electric_anomaly_overview" class="field-tip">
          {{ uploadResult.asset_health.summary.electric_anomaly_overview }}
        </p>
        <el-table
          v-if="(uploadResult.asset_health.items || []).length"
          :data="uploadResult.asset_health.items"
          size="small"
          class="ops-sug-table data-table--borderless"
          max-height="360"
        >
          <el-table-column prop="category_zh" label="类别" width="100" show-overflow-tooltip />
          <el-table-column prop="label" label="标签" min-width="100" show-overflow-tooltip />
          <el-table-column label="完好" width="72" align="center">
            <template #default="{ row }">{{ row.integrity_score }}</template>
          </el-table-column>
          <el-table-column label="破损度" width="88" align="center">
            <template #default="{ row }">{{ row.damage_index }}（{{ row.damage_level }}）</template>
          </el-table-column>
          <el-table-column prop="estimated_remaining_life_years" label="估剩余寿命(年)" width="120" align="center" />
          <el-table-column prop="replace_recommendation" label="更换建议" min-width="120" show-overflow-tooltip />
          <el-table-column prop="electricity_risk_note" label="用电风险说明" min-width="200" show-overflow-tooltip />
        </el-table>
        <el-empty
          v-else-if="uploadResult.asset_health.available"
          description="未匹配到常见电器类标签；可在提示词中加入 refrigerator、laptop、lamp 等英文类名后重试"
          :image-size="72"
        />
      </el-card>

      <el-card
        v-loading="loadingSuggestions"
        shadow="never"
        class="ems-card suggestions-after-model full-row"
      >
        <template #header>
          <div class="suggestions-card-head">
            <span class="card-title">建模后运营建议</span>
            <span class="section-hint">基于识别目标（照明/家具/人员等）+ 所选建筑能耗规则</span>
          </div>
        </template>
        <el-alert
          v-if="!twinBuildingId"
          type="info"
          show-icon
          :closable="false"
          title="未选择建筑：当前仅展示基于上传图的场景/视觉建议；选择建筑后可叠加建筑级能耗建议。"
          class="mb-sug"
        />
        <div v-if="mergedOpsRows.length" class="ops-toolbar">
          <el-select v-model="opsSourceFilter" size="small" class="ops-filter-select">
            <el-option label="全部来源" value="all" />
            <el-option label="仅视觉" value="vision" />
            <el-option label="仅场景" value="scene" />
            <el-option label="仅能耗" value="energy" />
          </el-select>
          <el-select v-model="opsPriorityFilter" size="small" class="ops-filter-select">
            <el-option label="全部优先级" value="all" />
            <el-option label="高" value="high" />
            <el-option label="中" value="medium" />
            <el-option label="低" value="low" />
            <el-option label="提示" value="info" />
          </el-select>
          <el-input
            v-model="opsKeyword"
            size="small"
            clearable
            placeholder="搜索建议关键词"
            class="ops-filter-keyword"
          />
          <el-button size="small" class="ops-export-btn" @click="exportOpsRowsCsv">导出当前筛选</el-button>
        </div>
        <el-table
          v-if="filteredOpsRows.length"
          :data="filteredOpsRows"
          size="small"
          class="ops-sug-table data-table--borderless"
          max-height="420"
        >
          <el-table-column label="来源" width="88" align="center">
            <template #default="{ row }">
              <el-tag
                size="small"
                :type="row.source === 'vision' ? 'success' : row.source === 'scene' ? 'warning' : 'primary'"
                effect="plain"
                class="ems-tag-soft"
              >
                {{ row.source === 'vision' ? '视觉' : row.source === 'scene' ? '场景' : '能耗' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="级" width="64" align="center">
            <template #default="{ row }">
              <el-tag
                :type="priorityMeta(row.priority).type"
                size="small"
                class="ems-tag-soft"
                effect="plain"
              >
                {{ priorityMeta(row.priority).label }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="title" label="建议内容" min-width="220" show-overflow-tooltip />
          <el-table-column label="预期/说明" min-width="140" show-overflow-tooltip>
            <template #default="{ row }">
              {{ fmtSuggestionExpected(row) }}
            </template>
          </el-table-column>
        </el-table>
        <el-empty
          v-else-if="twinBuildingId && !loadingSuggestions"
          :description="mergedOpsRows.length ? '无匹配建议：请调整筛选条件' : '暂无建议：请完成上传识别，或检查该建筑是否有能耗样本'"
          :image-size="56"
        />
      </el-card>
    </div>
  </div>
</template>

<style scoped>
.twin-vision-view {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding-bottom: 8px;
}

.page-hero {
  background:
    radial-gradient(120% 100% at 0% 0%, rgba(24, 144, 255, 0.1) 0%, rgba(24, 144, 255, 0) 45%),
    linear-gradient(135deg, #ffffff 0%, #f8fbff 100%);
  border: 1px solid #e7eef7;
  border-radius: 14px;
  padding: 18px 18px 16px;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.05);
}

.hero-kpi-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin: 12px 0 4px;
}

.hero-kpi-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid #dbe7f5;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.8);
}

.hero-kpi-card--safe {
  border-color: #d9efe2;
  background: rgba(240, 253, 244, 0.7);
}

.hero-kpi-card--warn {
  border-color: #fde6bf;
  background: rgba(255, 247, 237, 0.8);
}

.hero-kpi-card--danger {
  border-color: #fecaca;
  background: rgba(254, 242, 242, 0.85);
}

.hero-kpi-label {
  font-size: 12px;
  color: rgba(15, 23, 42, 0.58);
  line-height: 1.2;
}

.hero-kpi-value {
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.25;
}

.hero-kpi-value em {
  margin-left: 4px;
  font-size: 11px;
  font-style: normal;
  font-weight: 500;
  color: rgba(15, 23, 42, 0.5);
}

.hero-building-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
}

.hero-building-label {
  font-size: 13px;
  color: rgba(0, 0, 0, 0.55);
}

.hero-building-select {
  width: min(100%, 320px);
}

.hero-tips {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.hero-tips :deep(.el-tag) {
  border-radius: 999px;
  padding-inline: 10px;
}

.suggestions-after-model {
  margin-top: 4px;
}

.suggestions-card-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px 16px;
  justify-content: space-between;
}

.suggestions-card-head .section-hint {
  font-size: 12px;
  font-weight: 400;
  color: rgba(0, 0, 0, 0.45);
}

.mb-sug {
  margin-bottom: 12px;
}

.ops-sug-table :deep(.el-table__header th) {
  background: #fafafa;
}

.vision-layout {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.top-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
  align-items: stretch;
}

@media (max-width: 1100px) {
  .top-row {
    grid-template-columns: 1fr;
  }
}

.card-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 14px;
}

.twin-immersive {
  max-width: none;
  margin: calc(-1 * var(--ems-space-lg, 24px)) calc(-1 * var(--ems-space-lg, 24px))
    calc(-1 * var(--ems-space-xl, 32px));
  width: calc(100% + 2 * var(--ems-space-lg, 24px));
  box-sizing: border-box;
}

.control-panel,
.preview-panel,
.model-panel {
  border-radius: 14px;
  border: 1px solid #e6edf6;
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.05);
  transition: box-shadow 0.2s ease;
}

.control-panel:hover,
.preview-panel:hover,
.model-panel:hover,
.object-energy-panel:hover,
.asset-health-panel:hover,
.suggestions-after-model:hover {
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
}

.model-panel--stage :deep(.el-card__body) {
  padding: 0;
}

.canvas-float {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 6;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.preview-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.preview-panel :deep(.el-card__body) {
  padding: 16px 18px 18px;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.preview-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  flex: 1;
  min-height: 0;
}

.preview-card-header {
  flex-wrap: wrap;
  row-gap: 6px;
}

.preview-stage-block {
  display: flex;
  flex-direction: column;
  gap: 0;
  border: 1px solid #e4ecf7;
  border-radius: 12px;
  overflow: hidden;
  background: #fff;
}

.preview-stage-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.85);
  border-bottom: 1px solid var(--ems-border);
}

.preview-stage-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: rgba(0, 0, 0, 0.65);
}

.preview-stage-ico {
  font-size: 15px;
  color: var(--el-color-primary);
}

.preview-file-name {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: min(100%, 220px);
  font-size: 12px;
  color: var(--ems-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-ico {
  flex-shrink: 0;
  font-size: 14px;
  opacity: 0.85;
}

.preview-stage {
  position: relative;
  min-height: 220px;
  height: clamp(220px, 32vh, 380px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  background: radial-gradient(120% 80% at 50% 40%, #dbe7f4 0%, #f8fbff 55%, #fff 100%);
  border-radius: 12px;
  border: 1px solid #e5edf6;
}

.preview-img {
  width: 100%;
  height: 100%;
  max-height: 100%;
}

.preview-img :deep(.el-image__inner) {
  max-height: min(340px, 100%);
  object-fit: contain;
}

.preview-img :deep(.el-image__wrapper) {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-empty-wrap {
  width: 100%;
  height: 100%;
  min-height: 180px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-empty-text {
  font-size: 13px;
  color: var(--ems-text-secondary);
  line-height: 1.5;
}

.preview-meta-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.meta-pill {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  font-size: 12px;
  line-height: 1.4;
  color: rgba(0, 0, 0, 0.65);
  background: #f0f2f5;
  border-radius: 999px;
  border: 1px solid #dde7f3;
}

.meta-pill--accent {
  color: var(--el-color-primary);
  background: rgba(24, 144, 255, 0.08);
  border-color: rgba(24, 144, 255, 0.25);
}

.preview-tips {
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid #e4ecf7;
  background: #fff;
  box-shadow: 0 4px 10px rgba(15, 23, 42, 0.04);
}

.preview-tips-head {
  margin-bottom: 10px;
}

.preview-tip-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.preview-tip-list li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 13px;
  line-height: 1.55;
  color: rgba(0, 0, 0, 0.72);
}

.tip-ico {
  flex-shrink: 0;
  margin-top: 2px;
  font-size: 14px;
  color: var(--el-color-success);
}

.full-row {
  width: 100%;
}

.hint {
  font-size: 13px;
  color: #64748b;
  margin: 0 0 12px;
  line-height: 1.5;
}

.hint code {
  font-size: 12px;
  padding: 1px 6px;
  background: #f0f2f5;
  border-radius: 4px;
}

.control-panel :deep(.el-card__body) {
  padding: 18px 18px 18px;
  background: linear-gradient(180deg, rgba(248, 250, 252, 0.9), rgba(255, 255, 255, 1));
}

.control-form {
  --ctrl-label-color: rgba(0, 0, 0, 0.55);
}

.control-form :deep(.el-form-item) {
  margin-bottom: 14px;
}

.control-form :deep(.el-form-item__label) {
  font-weight: 500;
  color: var(--ctrl-label-color);
  line-height: 1.35;
  margin-bottom: 6px !important;
}

.control-section {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.params-head-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.preset-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 10px;
  margin-bottom: 10px;
}

.preset-label {
  font-size: 12px;
  color: rgba(15, 23, 42, 0.62);
  font-weight: 500;
}

.preset-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.basic-param {
  margin-bottom: 2px !important;
}

.advanced-toggle {
  align-self: flex-start;
  padding: 0 4px;
  margin-bottom: 4px;
}

.advanced-param-wrap {
  padding: 8px 10px 2px;
  border: 1px dashed #d6e4f3;
  border-radius: 10px;
  background: rgba(248, 250, 252, 0.75);
}

.section-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 12px;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: #0f172a;
  letter-spacing: 0.02em;
}

.section-hint {
  font-size: 12px;
  color: var(--ems-text-secondary);
  line-height: 1.45;
}

.form-item-tight :deep(.el-form-item__label) {
  margin-bottom: 8px !important;
}

.world-imgsz-select {
  width: 100%;
}

.form-item-slider :deep(.el-slider) {
  width: 100%;
  padding-right: 0;
}

.form-item-slider :deep(.el-slider__runway.show-input) {
  margin-right: 12px;
}

.field-tip {
  margin: 6px 0 0;
  font-size: 12px;
  color: #64748b;
  line-height: 1.4;
}

.control-divider {
  margin: 4px 0 16px;
  border-color: var(--ems-border);
}

.form-item-upload {
  margin-bottom: 0 !important;
}

.form-item-upload :deep(.el-form-item__content) {
  line-height: normal;
}

.control-actions {
  margin-top: 16px;
  padding-top: 4px;
}

.submit-primary {
  width: 100%;
  font-weight: 600;
  letter-spacing: 0.02em;
  border-radius: 10px;
  height: 42px;
}

.action-tip {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--el-color-primary);
  text-align: center;
  line-height: 1.4;
}

.model-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.vision-upload {
  width: 100%;
}

.vision-upload :deep(.el-upload) {
  width: 100%;
}

.vision-upload :deep(.el-upload-dragger) {
  width: 100%;
  padding: 18px 14px;
  border-radius: 10px;
  border-style: dashed;
  border-color: rgba(24, 144, 255, 0.35);
  background: linear-gradient(180deg, rgba(24, 144, 255, 0.04), rgba(255, 255, 255, 0.6));
  transition: border-color 0.2s, background 0.2s;
}

.vision-upload :deep(.el-upload-dragger:hover) {
  border-color: var(--el-color-primary);
  background: rgba(24, 144, 255, 0.06);
}

.upload-ico {
  font-size: 36px;
  color: var(--el-color-primary);
  margin-bottom: 6px;
}

.upload-text {
  font-size: 14px;
  color: var(--ems-text);
}

.upload-sub {
  font-size: 12px;
  color: var(--ems-text-secondary);
  margin-top: 4px;
}

.canvas-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.model3d-host {
  position: relative;
  min-height: 300px;
  height: min(62vh, 560px);
  border: none;
  border-radius: 0;
  background: linear-gradient(135deg, #080c12 0%, #0f1620 100%);
  overflow: hidden;
}

.model3d-canvas {
  position: absolute;
  inset: 0;
}

.model3d-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.model3d-skeleton {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  padding: 24px;
  background: linear-gradient(135deg, rgba(12, 18, 28, 0.9), rgba(14, 23, 36, 0.9));
  pointer-events: none;
}

.model3d-skeleton :deep(.el-skeleton__item) {
  background: rgba(255, 255, 255, 0.15);
}

.result-label {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
}

.object-energy-panel {
  margin-top: 4px;
}

.object-energy-panel :deep(.el-card__body),
.asset-health-panel :deep(.el-card__body),
.suggestions-after-model :deep(.el-card__body) {
  padding-top: 14px;
}

.object-dim-form .object-dim-select {
  width: 100%;
}

.object-dim-form .dim-input {
  width: 100%;
}

.apply-dim-btn {
  width: 100%;
  margin-top: 4px;
}

.volume-line {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--ems-text);
}

.volume-val {
  font-weight: 600;
  color: var(--el-color-primary);
}

.volume-unit {
  font-size: 12px;
  color: var(--ems-text-secondary);
}

.twin-forecast-block {
  min-height: 320px;
}

.forecast-skeleton {
  margin-bottom: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #e7edf5;
}

.forecast-inline-form :deep(.el-form-item) {
  margin-bottom: 12px;
}

.forecast-inline-form :deep(.el-form-item__content) {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.forecast-horizon-select {
  width: 120px;
}

.forecast-load-btn {
  flex-shrink: 0;
}

.forecast-head-line {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--ems-text-secondary);
}

.forecast-metrics-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0 0 10px;
}

.ops-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.ops-filter-select {
  width: 120px;
}

.ops-filter-keyword {
  width: min(260px, 100%);
}

.ops-export-btn {
  margin-left: auto;
}

.twin-forecast-chart {
  min-height: 280px;
}

@media (max-width: 1200px) {
  .hero-kpi-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 768px) {
  .page-hero {
    border-radius: 12px;
    padding: 14px;
  }
  .hero-kpi-row {
    grid-template-columns: 1fr;
    gap: 8px;
  }
  .top-row {
    gap: 10px;
  }
  .control-panel :deep(.el-card__body) {
    padding: 14px;
  }
  .model3d-host {
    height: min(54vh, 460px);
  }
  .ops-export-btn {
    margin-left: 0;
  }
}

</style>
