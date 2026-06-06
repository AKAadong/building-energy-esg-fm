/**
 * 与 frontend/src/views/TwinView.vue 对齐的孪生报告逻辑（无 Three.js，体量用检测框默认尺寸估算）。
 */

const MODEL_ZH = {
  prophet: 'Prophet',
  naive_moving_average: '滑动平均',
  naive_fallback: '滑动平均（回退）',
  none: '无数据',
}

const PRIORITY_META = {
  high: { label: '高', type: 'danger' },
  medium: { label: '中', type: 'warning' },
  low: { label: '低', type: 'info' },
  info: { label: '提示', type: 'info' },
}

function modelLabelTwin(m) {
  return MODEL_ZH[m] || m || '—'
}

function priorityMeta(p) {
  return PRIORITY_META[p] || { label: p || '—', type: 'info' }
}

function fmtSuggestionExpected(row) {
  if (row.expected_saving_kwh_per_hour != null) {
    return `≈ ${Number(row.expected_saving_kwh_per_hour).toFixed(2)} kWh/h`
  }
  if (row.expected_effect) return row.expected_effect
  return '—'
}

function parseModelBoxes(uploadResult) {
  const boxes = uploadResult?.yolo?.boxes ?? uploadResult?.boxes
  if (!Array.isArray(boxes)) return []
  return boxes
    .map((b) => ({
      label: b?.label ?? 'object',
      conf: b?.conf ?? b?.confidence ?? null,
      bbox: Array.isArray(b?.bbox_xyxy) ? b.bbox_xyxy : Array.isArray(b?.bbox) ? b.bbox : null,
    }))
    .filter((x) => Array.isArray(x.bbox) && x.bbox.length >= 4)
}

function defaultDimsForBox(bbox, imgW, imgH, conf) {
  const roomW = 10
  const roomD = 7
  const [x1, y1, x2, y2] = bbox.map((x) => Number(x) || 0)
  const bw = Math.max(8, Math.abs(x2 - x1))
  const bh = Math.max(8, Math.abs(y2 - y1))
  const sx = Math.max(0.16, (bw / imgW) * roomW * 0.56)
  const sz = Math.max(0.16, (bh / imgH) * roomD * 0.56)
  const sy = Math.min(1.3, Math.max(0.16, 0.12 + (conf == null ? 0.22 : Number(conf) * 0.68)))
  return { w: sx, h: sy, d: sz }
}

function computeSceneVolumeSum(modelBoxes, imgW, imgH) {
  let s = 0
  const n = Math.min(60, modelBoxes.length)
  for (let i = 0; i < n; i += 1) {
    const it = modelBoxes[i]
    const d = defaultDimsForBox(it.bbox, imgW, imgH, it.conf)
    s += d.w * d.h * d.d
  }
  return s
}

function computeVolumeMetrics(uploadResult, modelBoxes) {
  const imgW = Number(uploadResult?.yolo?.image_size?.w) || 1000
  const imgH = Number(uploadResult?.yolo?.image_size?.h) || 1000
  const twinSceneVolumeSum = computeSceneVolumeSum(modelBoxes, imgW, imgH)
  const summary = uploadResult?.asset_health?.summary ?? null
  const twinVolumeHeuristicKwh = (twinSceneVolumeSum * 0.0085).toFixed(3)
  const twinApplianceExtraKwh = (Math.max(0, Number(summary?.electric_appliance_detections ?? 0)) * 0.12).toFixed(3)
  const v = Number(twinVolumeHeuristicKwh)
  const a = Number(twinApplianceExtraKwh)
  const twinDemoLoadTotalKwh = Number.isNaN(v) || Number.isNaN(a) ? '—' : (v + a).toFixed(3)
  return {
    twinSceneVolumeSum,
    twinVolumeHeuristicKwh,
    twinApplianceExtraKwh,
    twinDemoLoadTotalKwh,
    twinAssetHealthSummary: summary,
    twinAssetAttentionCount: Number(summary?.needs_attention ?? 0),
  }
}

function computeForecastStats(forecastRaw) {
  const labels = forecastRaw?.labels ?? forecastRaw?.times ?? []
  const values = (forecastRaw?.values ?? forecastRaw?.forecast ?? []).map((v) =>
    v == null ? 0 : Number(v),
  )
  if (!values.length) {
    return {
      raw: forecastRaw,
      empty: true,
      headLine: '',
      labels: [],
      values: [],
      mean: null,
      peak: null,
      min: null,
      delta: null,
      rows: [],
    }
  }
  const s = values.reduce((acc, x) => acc + x, 0)
  const mean = (s / values.length).toFixed(3)
  const peak = Math.max(...values).toFixed(3)
  const min = Math.min(...values).toFixed(3)
  const delta = (Number(peak) - Number(min)).toFixed(3)
  const f = forecastRaw
  const m = modelLabelTwin(f.model)
  const h = f.horizon_hours != null ? `${f.horizon_hours}h` : ''
  const headLine = h ? `${m} · ${h}` : m
  const maxForBar = Math.max(Number(peak), 1e-6)
  const rows = values.map((v, i) => ({
    time: labels[i] || `+${i + 1}h`,
    value: Number(v).toFixed(3),
    pct: Math.max(6, Math.round((v / maxForBar) * 100)),
  }))
  return {
    raw: forecastRaw,
    empty: false,
    headLine,
    model: m,
    horizon: f.horizon_hours || values.length,
    labels,
    values,
    mean,
    peak,
    min,
    delta,
    rows,
  }
}

function buildAssetView(assetHealth) {
  if (!assetHealth) {
    return { available: false, hint: '暂无电器健康评估', items: [], summary: null, disclaimer: '' }
  }
  const items = (assetHealth.items || []).map((row) => ({
    category_zh: row.category_zh || '—',
    label: row.label || '—',
    integrity_score: row.integrity_score ?? '—',
    damage_index: row.damage_index ?? '—',
    damage_level: row.damage_level || '—',
    damage_display: `${row.damage_index ?? '—'}（${row.damage_level || '—'}）`,
    estimated_remaining_life_years: row.estimated_remaining_life_years ?? '—',
    replace_recommendation: row.replace_recommendation || '—',
    electricity_risk_note: row.electricity_risk_note || '—',
    scoreClass: Number(row.integrity_score) >= 70 ? 'ok' : 'warn',
  }))
  return {
    available: !!assetHealth.available,
    hint: assetHealth.hint || '',
    disclaimer: assetHealth.disclaimer || '',
    summary: assetHealth.summary || null,
    anomalyOverview: assetHealth.summary?.electric_anomaly_overview || '',
    items,
  }
}

function visionDerivedTips(uploadResult, modelBoxes, metrics, forecastStats) {
  const det = uploadResult?.yolo?.detections
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
  const applianceAttn = Number(metrics.twinAssetHealthSummary?.needs_attention ?? 0)
  const applianceCount = Number(metrics.twinAssetHealthSummary?.electric_appliance_detections ?? 0)
  const forecastDelta = Number(forecastStats.delta ?? 0)

  if (lights >= 2) {
    tips.push({
      priority: 'medium',
      title:
        '识别到多组照明相关目标，建议结合照度与作息做分区调光或人走灯灭，降低电器用电与峰时负荷。',
      expected_effect: '照明节电',
      source: 'vision',
    })
  }
  if (furn >= 5 && people <= 1 && modelBoxes.length >= 10) {
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
  if (modelBoxes.length >= 10 && people === 0 && applianceAttn === 0) {
    tips.push({
      priority: 'low',
      title: '场景中目标较密集，建议结合分项计量与电器用电分解预测，细化分区用能。',
      expected_effect: '分项计量',
      source: 'vision',
    })
  }
  return tips
}

function sceneTips(metrics, forecastStats) {
  const demoLoad = Number(metrics.twinDemoLoadTotalKwh)
  const forecastMean = Number(forecastStats.mean ?? 0)
  const volumeLoad = Number(metrics.twinVolumeHeuristicKwh)
  const applianceLoad = Number(metrics.twinApplianceExtraKwh)
  const sceneRatio = forecastMean > 1e-6 ? demoLoad / forecastMean : 0
  const tips = []

  if (forecastMean > 0) {
    if (sceneRatio <= 0.02) {
      tips.push({
        priority: 'info',
        title: `场景示意负荷约 ${demoLoad.toFixed(3)} kWh/h（占预测均值 ${(sceneRatio * 100).toFixed(2)}%），当前高基荷更可能来自未入镜设备或公共系统。`,
        expected_effect: '建议补充分项计量与公区负荷排查',
        source: 'scene',
      })
    } else if (sceneRatio <= 0.08) {
      tips.push({
        priority: 'low',
        title: `场景示意负荷约 ${demoLoad.toFixed(3)} kWh/h（占预测均值 ${(sceneRatio * 100).toFixed(2)}%），可先优化场景内设备调度，再联动建筑策略。`,
        expected_effect: '场景+建筑联合优化',
        source: 'scene',
      })
    } else {
      tips.push({
        priority: 'medium',
        title: `场景示意负荷占比较高（${(sceneRatio * 100).toFixed(2)}%），建议优先治理当前场景设备启停与待机策略。`,
        expected_effect: '场景侧削峰与节电',
        source: 'scene',
      })
    }
  }

  if (applianceLoad >= 0.5) {
    tips.push({
      priority: 'medium',
      title: `电器示意附加约 ${applianceLoad.toFixed(3)} kWh/h，建议优先核查识别到的电器回路与待机负载。`,
      expected_effect: '电器回路优化',
      source: 'scene',
    })
  }

  if (volumeLoad > 0 && applianceLoad > volumeLoad * 3.5) {
    tips.push({
      priority: 'info',
      title: '当前示意负荷主要来自电器检出而非体量，建议重点排查电器开关策略与待机用电。',
      expected_effect: '电器侧精细化控制',
      source: 'scene',
    })
  }
  return tips
}

function sourceLabel(source) {
  if (source === 'vision') return '视觉'
  if (source === 'scene') return '场景'
  if (source === 'energy') return '能耗'
  return source || '—'
}

function sourceTagType(source) {
  if (source === 'vision') return 'success'
  if (source === 'scene') return 'warning'
  return 'primary'
}

function mergedOpsRows(uploadResult, modelBoxes, metrics, forecastStats, opsSuggestions, buildingId) {
  const visionTips = visionDerivedTips(uploadResult, modelBoxes, metrics, forecastStats)
  const scenes = sceneTips(metrics, forecastStats)
  const apiItems = buildingId
    ? (opsSuggestions?.items ?? []).map((r) => ({ ...r, source: 'energy' }))
    : []
  const rows = [...scenes, ...visionTips, ...apiItems]

  const seen = new Set()
  const dedup = []
  for (const row of rows) {
    const t = String(row.title || '').trim()
    if (!t || seen.has(t)) continue
    seen.add(t)
    const pm = priorityMeta(row.priority)
    dedup.push({
      ...row,
      priorityLabel: pm.label,
      priorityType: pm.type,
      sourceLabel: sourceLabel(row.source),
      sourceTagType: sourceTagType(row.source),
      expectedText: fmtSuggestionExpected(row),
    })
  }
  return dedup
}

/** @param {object|null} buildingId 默认 null：不关联建筑，与 TwinView 未选建筑时一致 */
function buildTwinReport(uploadResult, forecastRaw, opsSuggestions, buildingId = null) {
  const modelBoxes = parseModelBoxes(uploadResult)
  const metrics = computeVolumeMetrics(uploadResult, modelBoxes)
  const forecast = computeForecastStats(forecastRaw)
  const asset = buildAssetView(uploadResult?.asset_health)
  const opsRows = mergedOpsRows(uploadResult, modelBoxes, metrics, forecast, opsSuggestions, buildingId)

  return {
    modelBoxes,
    modelBoxCount: modelBoxes.length,
    metrics,
    forecast,
    asset,
    opsRows,
    noBuildingNote: buildingId
      ? ''
      : '未选择建筑：当前仅展示基于上传图的场景/视觉建议；预测基于全局样本。',
  }
}

module.exports = {
  buildTwinReport,
  modelLabelTwin,
  priorityMeta,
  fmtSuggestionExpected,
}
