App({
  globalData: {
    apiBase: '',
  },

  onLaunch() {
    const saved = wx.getStorageSync('apiBase')
    if (saved) {
      this.globalData.apiBase = saved
    }
  },

  setApiBase(url) {
    const u = (url || '').trim().replace(/\/$/, '')
    this.globalData.apiBase = u
    wx.setStorageSync('apiBase', u)
  },

  getApiBase() {
    return this.globalData.apiBase || wx.getStorageSync('apiBase') || ''
  },
})
