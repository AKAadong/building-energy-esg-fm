const api = require('../../utils/api')
const { buildTwinReport } = require('../../utils/twinReport')

Page({
  data: {
    apiConfigured: false,
    analyzing: false,
    imagePath: '',
    errorMsg: '',
    hasResult: false,
    modelBoxCount: 0,
    metrics: null,
    forecast: null,
    asset: null,
    opsRows: [],
    noBuildingNote: '',
  },

  onShow() {
    this.setData({ apiConfigured: !!api.getAppBase() })
  },

  goSettings() {
    wx.navigateTo({ url: '/pages/settings/settings' })
  },

  chooseCamera() {
    this._chooseImage(['camera'])
  },

  chooseAlbum() {
    this._chooseImage(['album'])
  },

  _chooseImage(sourceType) {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType,
      sizeType: ['compressed'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0]
        if (!file || !file.tempFilePath) return
        this.setData({
          imagePath: file.tempFilePath,
          errorMsg: '',
          hasResult: false,
          modelBoxCount: 0,
          metrics: null,
          forecast: null,
          asset: null,
          opsRows: [],
          noBuildingNote: '',
        })
      },
    })
  },

  async runAnalyze() {
    if (!this.data.imagePath || this.data.analyzing) return
    if (!this.data.apiConfigured) {
      wx.showToast({ title: '请先配置后端', icon: 'none' })
      return
    }

    this.setData({ analyzing: true, errorMsg: '' })
    let loadingShown = false
    try {
      wx.showLoading({ title: '识别与建模分析…', mask: true })
      loadingShown = true

      const vision = await api.uploadVision(this.data.imagePath)
      const forecastRaw = await api.getForecastEnergy(api.DEFAULT_FORECAST_HORIZON)
      const report = buildTwinReport(vision, forecastRaw, null, null)

      this.setData({
        hasResult: true,
        modelBoxCount: report.modelBoxCount,
        metrics: report.metrics,
        forecast: report.forecast,
        asset: report.asset,
        opsRows: report.opsRows,
        noBuildingNote: report.noBuildingNote,
      })
    } catch (e) {
      this.setData({ errorMsg: e.message || String(e), hasResult: false })
      wx.showToast({ title: '分析失败', icon: 'none' })
    } finally {
      if (loadingShown) wx.hideLoading()
      this.setData({ analyzing: false })
    }
  },
})
