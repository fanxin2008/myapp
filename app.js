// app.js
const api = require('./utils/api.js')

App({
  globalData: {
    user: null,
  },

  onLaunch() {
    const logs = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs)

    api.initCloud()
    this.ensureLogin()
  },

  ensureLogin(force) {
    if (!this.globalData.loginPromise || force) {
      this.globalData.loginPromise = api.ensureLogin({ force }).then((session) => {
        this.globalData.user = session && session.user
        return session
      })
    }
    return this.globalData.loginPromise
  },
})
