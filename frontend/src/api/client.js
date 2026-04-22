import axios from 'axios'

/** 空字符串时使用相对路径，配合 Vite 代理同源访问 /api */
const baseURL = import.meta.env.VITE_API_BASE ?? ''

export const http = axios.create({
  baseURL: baseURL.replace(/\/$/, '') || undefined,
  timeout: 120_000,
  headers: { 'Content-Type': 'application/json' },
})

http.interceptors.response.use(
  (res) => res,
  (err) => {
    const msg =
      err.response?.data?.detail ??
      err.response?.data?.error ??
      err.message ??
      '请求失败'
    return Promise.reject(new Error(typeof msg === 'string' ? msg : JSON.stringify(msg)))
  },
)

export function apiUrl(path) {
  const b = baseURL.replace(/\/$/, '')
  const p = path.startsWith('/') ? path : `/${path}`
  return b ? `${b}${p}` : p
}
