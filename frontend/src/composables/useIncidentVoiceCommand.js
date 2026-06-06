/**
 * 解析中文语音指令，驱动工单增删改查。
 * 支持阿拉伯数字与汉字数字（如「三号工单」「第二十三条」）。
 */

const CN_DIGIT = {
  零: 0,
  〇: 0,
  一: 1,
  二: 2,
  两: 2,
  俩: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
}

const STATUS_MAP = {
  待处理: 'open',
  未处理: 'open',
  open: 'open',
  进行中: 'in_progress',
  处理中: 'in_progress',
  受理: 'in_progress',
  in_progress: 'in_progress',
  已解决: 'resolved',
  解决: 'resolved',
  resolved: 'resolved',
  已关闭: 'closed',
  关闭: 'closed',
  closed: 'closed',
}

const SEVERITY_MAP = {
  低: 'low',
  low: 'low',
  中: 'medium',
  普通: 'medium',
  medium: 'medium',
  高: 'high',
  high: 'high',
  紧急: 'critical',
  严重: 'critical',
  critical: 'critical',
}

const CN_NUM = '[零〇一二两俩三四五六七八九十百千]+'

/** @param {string} str */
export function chineseNumeralToInt(str) {
  if (str == null || str === '') return null
  const s = String(str).trim()
  if (/^\d+$/.test(s)) return parseInt(s, 10)

  if (s === '十') return 10

  let section = 0
  let num = 0
  for (const ch of s) {
    if (CN_DIGIT[ch] !== undefined) {
      num = CN_DIGIT[ch]
    } else if (ch === '十') {
      section += (num || 1) * 10
      num = 0
    } else if (ch === '百') {
      section += (num || 1) * 100
      num = 0
    } else if (ch === '千') {
      section += (num || 1) * 1000
      num = 0
    } else {
      return null
    }
  }
  const result = section + num
  return result > 0 ? result : null
}

/** @param {string} token */
function parseNumToken(token) {
  if (!token) return null
  if (/^\d+$/.test(token)) return parseInt(token, 10)
  return chineseNumeralToInt(token)
}

/** @param {string} text */
function replaceChineseNumeralsInText(text) {
  return text
    .replace(new RegExp(`第\\s*(${CN_NUM})\\s*([条个项号])`, 'g'), (_, n, suf) => {
      const v = chineseNumeralToInt(n)
      return v != null ? `第${v}${suf}` : `第${n}${suf}`
    })
    .replace(new RegExp(`(?:工单|编号)\\s*(${CN_NUM})\\s*号`, 'g'), (_, n) => {
      const v = chineseNumeralToInt(n)
      return v != null ? `工单${v}号` : `工单${n}号`
    })
    .replace(new RegExp(`(${CN_NUM})\\s*号\\s*工单`, 'g'), (_, n) => {
      const v = chineseNumeralToInt(n)
      return v != null ? `${v}号工单` : `${n}号工单`
    })
    .replace(new RegExp(`把\\s*(${CN_NUM})\\s*号`, 'g'), (_, n) => {
      const v = chineseNumeralToInt(n)
      return v != null ? `把${v}号` : `把${n}号`
    })
}

/** @param {string} text */
function normalize(text) {
  return replaceChineseNumeralsInText(
    text
      .trim()
      .replace(/[，,。.！!？?；;：:、]/g, ' ')
      .replace(/\s+/g, ' '),
  )
}

/** @param {string} text */
function extractId(text) {
  const numPat = `(\\d+|${CN_NUM})`
  const patterns = [
    new RegExp(`(?:工单|编号|第)\\s*${numPat}\\s*(?:号|条|个|项)?`),
    new RegExp(`(?:id|ID)\\s*${numPat}`),
    new RegExp(`^${numPat}\\s*号?$`),
    new RegExp(`把\\s*${numPat}\\s*号?\\s*工单`),
    new RegExp(`${numPat}\\s*号\\s*工单`),
    new RegExp(`(?:第)?${numPat}(?:条|个|项|号)(?:工单)?`),
  ]
  for (const re of patterns) {
    const m = text.match(re)
    if (m) {
      const id = parseNumToken(m[1])
      if (id != null && id > 0) return id
    }
  }
  return null
}

/** @param {string} text @param {string} key */
function extractAfter(text, key) {
  const re = new RegExp(`${key}\\s*[:：是为]?\\s*(.+?)(?=\\s+(?:建筑|级别|状态|详情|描述|$))`, 'i')
  const m = text.match(re)
  return m ? m[1].trim() : null
}

/** @param {string} text */
function parseCreatePayload(text) {
  let body = text
    .replace(/^(创建|新建|添加|增加|录入)\s*工单\s*/i, '')
    .replace(/^工单\s*/i, '')
    .trim()

  const titleFromKey = extractAfter(text, '标题')
  const detailFromKey = extractAfter(text, '详情') || extractAfter(text, '描述')
  const buildingMatch = text.match(/建筑\s*[:：]?\s*([A-Za-z0-9_-]+)/i)
  const severityMatch = text.match(/级别\s*[:：]?\s*(低|中|高|紧急|严重|普通|low|medium|high|critical)/i)
  const statusMatch = text.match(/状态\s*[:：]?\s*(待处理|进行中|已解决|已关闭|open|in_progress|resolved|closed)/i)

  let title = titleFromKey
  if (!title) {
    body = body
      .replace(/建筑\s*[:：]?\s*[A-Za-z0-9_-]+/gi, '')
      .replace(/级别\s*[:：]?\s*(低|中|高|紧急|严重|普通|low|medium|high|critical)/gi, '')
      .replace(/状态\s*[:：]?\s*(待处理|进行中|已解决|已关闭|open|in_progress|resolved|closed)/gi, '')
      .replace(/详情\s*[:：]?\s*.+/gi, '')
      .replace(/描述\s*[:：]?\s*.+/gi, '')
      .trim()
    title = body || null
  }

  if (!title || title.length < 2) return null

  return {
    title,
    building_id: buildingMatch ? buildingMatch[1] : null,
    severity: severityMatch ? SEVERITY_MAP[severityMatch[1]] ?? 'medium' : 'medium',
    status: statusMatch ? STATUS_MAP[statusMatch[1]] ?? 'open' : 'open',
    detail: detailFromKey,
  }
}

/** @param {string} text */
function parseUpdatePayload(text) {
  const id = extractId(text)
  if (!id) return null

  const title = extractAfter(text, '标题')
  const detail = extractAfter(text, '详情') || extractAfter(text, '描述')
  const buildingMatch = text.match(/建筑\s*[:：]?\s*([A-Za-z0-9_-]+)/i)
  const severityMatch = text.match(/级别\s*[:：]?\s*(低|中|高|紧急|严重|普通|low|medium|high|critical)/i)
  const statusMatch = text.match(/状态\s*[:：]?\s*(待处理|进行中|已解决|已关闭|open|in_progress|resolved|closed)/i)

  const patch = {}
  if (title) patch.title = title
  if (detail) patch.detail = detail
  if (buildingMatch) patch.building_id = buildingMatch[1]
  if (severityMatch) patch.severity = SEVERITY_MAP[severityMatch[1]]
  if (statusMatch) patch.status = STATUS_MAP[statusMatch[1]]

  if (!Object.keys(patch).length) return null
  return { id, patch }
}

/** @param {string} raw */
function parseSeverityOnlyUpdate(raw) {
  const id = extractId(raw)
  if (!id || !/工单/.test(raw)) return null
  if (!/(设为|改为|改成|设置为|调整)/.test(raw)) return null
  if (/紧急|严重/.test(raw)) return { id, patch: { severity: 'critical' } }
  if (/高级|高/.test(raw)) return { id, patch: { severity: 'high' } }
  if (/中级|中等|普通/.test(raw)) return { id, patch: { severity: 'medium' } }
  if (/低级|低/.test(raw)) return { id, patch: { severity: 'low' } }
  return null
}

/**
 * @param {string} text 语音识别文本
 * @returns {{ action: string, payload?: Record<string, unknown>, hint?: string } | null}
 */
export function parseIncidentVoiceCommand(text) {
  const raw = normalize(text)
  if (!raw) return null

  if (/^(帮助|指令|命令|怎么说|语音帮助|能说什么)/.test(raw)) {
    return { action: 'help' }
  }

  if (/^(刷新|重新加载|更新列表|同步)/.test(raw)) {
    return { action: 'refresh' }
  }

  if (
    /^(打开|显示)\s*(新建|创建)\s*(工单)?(对话框|窗口|页面)?/.test(raw) ||
    /^(新建|创建)\s*工单\s*(对话框|窗口)?$/.test(raw) ||
    raw === '新建' ||
    raw === '创建工单'
  ) {
    return { action: 'open_create' }
  }

  if (/^(取消|清除)\s*(筛选|过滤)|^(全部|所有)\s*工单|显示全部工单/.test(raw)) {
    return { action: 'list', payload: { status: null, keyword: null } }
  }

  if (/^(统计|概况|汇总)/.test(raw) || /工单\s*(有多少|几条|总数)/.test(raw) || /^有多少\s*工单/.test(raw)) {
    return { action: 'summary' }
  }

  const searchMatch = raw.match(/^(搜索|查找|找)(?:一下)?(?:标题)?(?:包含|含|有)?\s*(.+?)(?:的工单|$)/)
  if (searchMatch && searchMatch[1].length >= 1) {
    return { action: 'search', payload: { keyword: searchMatch[1].trim() } }
  }

  if (/^((最)?新|第一|最新一)\s*(条|个)?\s*工单/.test(raw)) {
    return { action: 'view_index', payload: { fromEnd: false, index: 0 } }
  }
  if (/^最后(一)?(条|个)?\s*工单/.test(raw)) {
    return { action: 'view_index', payload: { fromEnd: true, index: 0 } }
  }

  const sevOnly = parseSeverityOnlyUpdate(raw)
  if (sevOnly) return { action: 'update', payload: sevOnly }

  if (/^(创建|新建|添加|增加|录入)\s*工单/.test(raw) || /^工单\s*标题/.test(raw)) {
    const payload = parseCreatePayload(raw)
    if (payload) return { action: 'create', payload }
    return { action: 'unknown', hint: '请说：新建工单 空调故障，或 新建工单 标题 空调故障 建筑 B001 级别高' }
  }

  if (/^删除/.test(raw) && /工单/.test(raw)) {
    const id = extractId(raw)
    const titleMatch = raw.match(/标题(?:包含|含|是)?\s*(.+?)(?:\s*的?\s*工单|$)/)
    if (id) return { action: 'delete', payload: { id } }
    if (titleMatch) return { action: 'delete', payload: { titleKeyword: titleMatch[1].trim() } }
    return { action: 'unknown', hint: '请说：删除三号工单，或 删除工单 3' }
  }

  if (/^删除\s*(工单)?/.test(raw)) {
    const id = extractId(raw)
    if (id) return { action: 'delete', payload: { id } }
  }

  if (/^(修改|更新|编辑)\s*工单/.test(raw)) {
    const parsed = parseUpdatePayload(raw)
    if (parsed) return { action: 'update', payload: parsed }
    return { action: 'unknown', hint: '请说：修改三号工单 状态为已解决，或 修改工单 3 标题为 xxx' }
  }

  if (/^(受理|解决|关闭)\s*(工单)?/.test(raw)) {
    const id = extractId(raw)
    if (!id) return { action: 'unknown', hint: '请说：受理三号工单 / 解决工单 3 / 关闭第二号工单' }
    if (/受理/.test(raw)) return { action: 'patch_status', payload: { id, status: 'in_progress' } }
    if (/解决/.test(raw)) return { action: 'patch_status', payload: { id, status: 'resolved' } }
    return { action: 'patch_status', payload: { id, status: 'closed' } }
  }

  if (/^(查看|打开|显示)\s*(工单)?/.test(raw) || (/工单/.test(raw) && /详情/.test(raw))) {
    const id = extractId(raw)
    if (id) return { action: 'view', payload: { id } }
    return { action: 'unknown', hint: '请说：查看三号工单 / 打开工单 3' }
  }

  if (/工单/.test(raw) && /(设为|改为|改成|设置为)/.test(raw)) {
    const parsed = parseUpdatePayload(raw)
    if (parsed) return { action: 'update', payload: parsed }
  }

  if (/工单/.test(raw) && /(查询|列出|显示|筛选|有哪些|看看)/.test(raw)) {
    let status = null
    if (/待处理|未处理/.test(raw)) status = 'open'
    else if (/进行中|处理中/.test(raw)) status = 'in_progress'
    else if (/已解决/.test(raw)) status = 'resolved'
    else if (/已关闭/.test(raw)) status = 'closed'
    return { action: 'list', payload: { status } }
  }

  if (/^(查询|列出|显示|筛选)?/.test(raw) && /工单/.test(raw)) {
    let status = null
    if (/待处理|未处理/.test(raw)) status = 'open'
    else if (/进行中|处理中/.test(raw)) status = 'in_progress'
    else if (/已解决/.test(raw)) status = 'resolved'
    else if (/已关闭/.test(raw)) status = 'closed'
    return { action: 'list', payload: { status } }
  }

  return null
}

export const VOICE_COMMAND_HINTS = [
  '新建工单 空调故障',
  '查看三号工单',
  '受理第二号工单',
  '修改工单 5 状态为已解决',
  '删除标题包含 空调 的工单',
  '查询待处理工单',
  '搜索包含 基荷',
  '最新一条工单',
  '打开新建工单',
  '刷新',
]

export const VOICE_COMMAND_HELP = [
  '【创建】新建工单 xxx / 打开新建工单',
  '【查询】查询待处理工单 / 全部工单 / 搜索包含 空调',
  '【查看】查看三号工单 / 最新一条工单 / 最后一条工单',
  '【更新】修改三号工单 状态为已解决 / 设为紧急',
  '【状态】受理三号 / 解决工单 2 / 关闭工单 1',
  '【删除】删除三号工单 / 删除标题包含 xxx 的工单',
  '【其他】刷新 / 统计 / 帮助',
  '编号支持汉字：一、二、三…十、二十三 等',
]
