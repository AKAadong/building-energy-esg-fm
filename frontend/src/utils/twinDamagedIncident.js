/**
 * 视觉识别结果中「需关注/破损」电器 → 自动运维工单 payload。
 * 规则与后端 assess_appliance_health_from_yolo 对齐：完好度 < 73 或破损等级为中度/偏高。
 */

const DAMAGE_LEVELS_TICKET = new Set(['中度', '偏高'])

/** @param {Record<string, unknown> | null | undefined} assetHealth */
export function getDamagedApplianceItems(assetHealth) {
  if (!assetHealth?.available) return []
  const items = assetHealth.items
  if (!Array.isArray(items)) return []
  return items.filter((it) => {
    const level = String(it.damage_level ?? '')
    if (DAMAGE_LEVELS_TICKET.has(level)) return true
    const integrity = Number(it.integrity_score)
    return Number.isFinite(integrity) && integrity < 73
  })
}

/**
 * @param {Array<Record<string, unknown>>} damagedItems
 * @param {string} [buildingId]
 */
export function buildIncidentPayloadFromDamaged(damagedItems, buildingId = '') {
  if (!damagedItems.length) return null

  const labels = damagedItems.map((it) => it.category_zh || it.label || '电器')
  const unique = [...new Set(labels)]
  const title =
    unique.length === 1
      ? `视觉巡检：${unique[0]}设备需检修`
      : `视觉巡检：${unique.slice(0, 2).join('、')}${unique.length > 2 ? '等' : ''} ${damagedItems.length} 台设备需关注`

  const lines = damagedItems.map((it) => {
    const name = it.category_zh || it.label || '电器'
    return [
      `· ${name}（${it.label ?? '—'}）`,
      `  完好度 ${it.integrity_score ?? '—'}，破损度 ${it.damage_index ?? '—'}（${it.damage_level ?? '—'}）`,
      `  建议：${it.replace_recommendation ?? '现场核查'}`,
      it.electricity_risk_note ? `  用电提示：${it.electricity_risk_note}` : '',
    ]
      .filter(Boolean)
      .join('\n')
  })

  const detail = [
    '来源：孪生与视觉 · 图片识别后自动生成（演示级评估，请结合现场巡检确认）。',
    '',
    ...lines,
  ].join('\n')

  const critical = damagedItems.some(
    (it) => it.damage_level === '偏高' || Number(it.integrity_score) < 58,
  )

  return {
    title: title.slice(0, 120),
    building_id: buildingId || null,
    severity: critical ? 'high' : 'medium',
    status: 'open',
    detail,
  }
}
