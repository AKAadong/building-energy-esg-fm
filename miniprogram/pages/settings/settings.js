const api = require('../../utils/api')

Page({
  data: {
    apiBase: '',
    testing: false,
    testOk: false,
    testMsg: '',
  },

  onShow() {
    const saved = api.getAppBase()
    this.setData({
      apiBase: saved || 'http://127.0.0.1:8765',
    })
  },

  onInput(e) {
    this.setData({ apiBase: e.detail.value, testOk: false, testMsg: '' })
  },

  /** 微信开发者工具（电脑模拟器）推荐 */
  fillLocalDev() {
    this.setData({ apiBase: 'http://127.0.0.1:8765', testOk: false, testMsg: '' })
  },

  /** 手机真机预览 / 扫码 */
  fillPhonePreview() {
    this.setData({ apiBase: 'http://10.200.83.168:8765', testOk: false, testMsg: '' })
  },

  save() {
    const url = (this.data.apiBase || '').trim().replace(/\/$/, '')
    if (!url) {
      wx.showToast({ title: '请输入地址', icon: 'none' })
      return
    }
    if (!/^https?:\/\//i.test(url)) {
      wx.showToast({ title: '需以 http:// 或 https:// 开头', icon: 'none' })
      return
    }
    getApp().setApiBase(url)
    wx.showToast({ title: '已保存', icon: 'success' })
  },

  async testConnection() {
    const url = (this.data.apiBase || '').trim().replace(/\/$/, '')
    if (!url) {
      wx.showToast({ title: '请先输入地址', icon: 'none' })
      return
    }
    getApp().setApiBase(url)
    this.setData({ testing: true, testOk: false, testMsg: '' })
    try {
      await api.healthCheck()
      this.setData({ testOk: true, testMsg: '连接成功，可返回首页开始分析' })
    } catch (e) {
      const msg = String(e.message || '连接失败')
      const isLan =
        url.includes('10.') || url.includes('192.168.') || url.includes('172.')
      let hint = msg
      if (msg.includes('502') && isLan) {
        hint =
          '502：开发者工具内访问局域网 IP 常失败。请点「本机调试」改用 http://127.0.0.1:8765 再测。真机预览时才用局域网 IP。'
      } else if (msg.includes('502')) {
        hint = '502：后端未启动或端口不对。请确认 uvicorn 正在运行且 --host 0.0.0.0 --port 8765'
      } else if (msg.includes('REFUSED') || msg.includes('fail')) {
        hint = `${msg}。请确认后端已启动：python -m uvicorn app.main:app --host 0.0.0.0 --port 8765`
      }
      this.setData({ testOk: false, testMsg: hint })
    } finally {
      this.setData({ testing: false })
    }
  },
})
