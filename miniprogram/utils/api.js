/** 与 TwinView 预设「无」一致：mode=world、imgsz=1280、iou=0.42，不传 prompt/conf（走后端内置类名，含 refrigerator） */

const DEFAULT_MODE = 'world'
const DEFAULT_IMGSZ = 1280
const DEFAULT_IOU = 0.42
const DEFAULT_FORECAST_HORIZON = 48

function getAppBase() {
  const app = getApp()
  return (app && app.getApiBase && app.getApiBase()) || wx.getStorageSync('apiBase') || ''
}

function ensureBase() {
  const base = getAppBase().replace(/\/$/, '')
  if (!base) throw new Error('请先配置后端地址（设置页）')
  return base
}

function request(path, options = {}) {
  const base = ensureBase()
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: options.method || 'GET',
      data: options.data,
      header: { 'Content-Type': 'application/json', ...(options.header || {}) },
      timeout: options.timeout || 120000,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
          return
        }
        const detail = res.data && (res.data.detail || res.data.error || res.data.message)
        reject(new Error(detail || `HTTP ${res.statusCode}`))
      },
      fail(err) {
        reject(new Error(err.errMsg || '网络请求失败'))
      },
    })
  })
}

function healthCheck() {
  const base = ensureBase()
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${base}/health`,
      timeout: 8000,
      success(res) {
        if (res.statusCode === 200 && res.data && res.data.status === 'ok') resolve(true)
        else if (res.statusCode === 502 && /10\.|192\.168\.|172\./.test(base)) {
          reject(
            new Error(
              'HTTP 502：开发者工具请改用 http://127.0.0.1:8765；局域网 IP 仅在真机预览时使用',
            ),
          )
        } else reject(new Error(`后端不可达（HTTP ${res.statusCode}）`))
      },
      fail(err) {
        reject(new Error(err.errMsg || '无法连接后端'))
      },
    })
  })
}

/** 默认不关联建筑；horizon 与 TwinView 默认 48h 一致 */
function getForecastEnergy(horizonHours = DEFAULT_FORECAST_HORIZON, buildingId = null) {
  let q = `?horizon_hours=${horizonHours}`
  if (buildingId) q += `&building_id=${encodeURIComponent(buildingId)}`
  return request(`/api/v2/forecast/energy${q}`)
}

function getOpsSuggestions(buildingId = null) {
  const q = buildingId ? `?building_id=${encodeURIComponent(buildingId)}` : ''
  return request(`/api/v2/ops/suggestions${q}`)
}

/** 识别预设「无」：不传 prompt/conf，使用后端内置室内类别（含 refrigerator） */
function uploadVision(filePath) {
  const base = ensureBase()
  const url =
    `${base}/api/v2/vision/upload` +
    `?mode=${DEFAULT_MODE}&iou=${DEFAULT_IOU}&imgsz=${DEFAULT_IMGSZ}`

  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url,
      filePath,
      name: 'file',
      timeout: 120000,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(typeof res.data === 'string' ? JSON.parse(res.data) : res.data)
          } catch (_) {
            reject(new Error('响应解析失败'))
          }
          return
        }
        let msg = `上传失败 HTTP ${res.statusCode}`
        try {
          const errObj = JSON.parse(res.data)
          msg = errObj.detail || errObj.error || msg
        } catch (_) {
          /* ignore */
        }
        reject(new Error(msg))
      },
      fail(err) {
        reject(new Error(err.errMsg || '上传失败'))
      },
    })
  })
}

module.exports = {
  DEFAULT_MODE,
  DEFAULT_IMGSZ,
  DEFAULT_IOU,
  DEFAULT_FORECAST_HORIZON,
  getAppBase,
  ensureBase,
  request,
  healthCheck,
  getForecastEnergy,
  getOpsSuggestions,
  uploadVision,
}
