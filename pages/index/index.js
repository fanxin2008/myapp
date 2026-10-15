// index.js
Page({
  data: {
    statusBarHeight: 20,
    speed: '000',
    unit: 'KM/H',
    reactionTime: '0.00s',
    totalTime: '0.00s',
    brakeDistance: '0.0m',
    brakeForce: '0N',
    brakeOn: false,
    remainCount: 10,
    buttonText: '开始挑战',
    needleAngle: -90,
  },

  timer: null,
  status: 'idle',
  speedValue: 0,
  forceValue: 0,
  distanceValue: 0,
  reactionValue: 0,
  totalValue: 0,
  brakeTimeValue: 0,
  startAt: 0,
  brakeStartedAt: 0,
  isPressing: false,

  onLoad() {
    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    this.setData({
      statusBarHeight: windowInfo.statusBarHeight || 20,
    })
  },

  onUnload() {
    this.stopLoop()
  },

  goRank() {
    wx.navigateTo({
      url: '/pages/rank/rank',
    })
  },

  handleStartTap() {
    if (this.status === 'accelerating' || this.status === 'braking') {
      return
    }
    this.startChallenge()
  },

  startChallenge() {
    if (this.data.remainCount <= 0) {
      wx.showToast({
        title: '挑战次数已用完',
        icon: 'none',
      })
      return
    }

    this.stopLoop()
    this.speedValue = 0
    this.forceValue = 0
    this.distanceValue = 0
    this.reactionValue = 0
    this.totalValue = 0
    this.brakeTimeValue = 0
    this.startAt = Date.now()
    this.brakeStartedAt = 0
    this.isPressing = false
    this.status = 'accelerating'

    this.setData({
      remainCount: this.data.remainCount - 1,
      speed: '000',
      brakeForce: '0N',
      brakeOn: false,
      buttonText: '踩下刹车',
      reactionTime: '0.00s',
      totalTime: '0.00s',
      brakeDistance: '0.0m',
      needleAngle: -90,
    })

    this.startLoop()
  },

  startBrake() {
    if (this.status !== 'accelerating' && this.status !== 'braking') {
      return
    }

    if (this.status === 'accelerating') {
      this.status = 'braking'
      this.reactionValue = (Date.now() - this.startAt) / 1000
      this.brakeStartedAt = Date.now()
    }

    this.isPressing = true
    this.setData({
      brakeOn: true,
    })
  },

  stopBrake() {
    if (!this.isPressing) {
      return
    }

    this.isPressing = false
    this.setData({
      brakeOn: false,
    })
  },

  startLoop() {
    this.stopLoop()
    this.timer = setInterval(() => {
      this.tick()
    }, 50)
  },

  stopLoop() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  },

  tick() {
    if (this.status === 'accelerating') {
      this.speedValue += 2.4
      this.distanceValue += (this.speedValue / 3.6) * 0.05

      if (this.speedValue > 220) {
        this.speedValue = 220
        this.status = 'overspeed'
        this.stopLoop()
        this.setData({
          speed: this.formatSpeed(this.speedValue),
          needleAngle: this.getNeedleAngle(this.speedValue),
          buttonText: '再挑战',
        })
        wx.showToast({
          title: '错误刹车时机，已超速',
          icon: 'none',
        })
        return
      }

      this.updateDisplay()
      return
    }

    if (this.status !== 'braking') {
      return
    }

    if (this.isPressing) {
      this.forceValue += 110
      if (this.forceValue >= 1600) {
        this.forceValue = 1600
        this.status = 'broken'
        this.isPressing = false
        this.stopLoop()
        this.setData({
          brakeForce: '1600N',
          brakeOn: false,
          buttonText: '再挑战',
        })
        wx.showToast({
          title: '刹车失败，踏板断裂',
          icon: 'none',
        })
        return
      }
    } else {
      this.forceValue = Math.max(0, this.forceValue - 90)
    }

    const deceleration = this.forceValue * 0.002
    this.speedValue = Math.max(0, this.speedValue - deceleration)
    this.distanceValue += (this.speedValue / 3.6) * 0.05

    if (this.speedValue <= 0) {
      this.speedValue = 0
      this.totalValue = (Date.now() - this.startAt) / 1000
      this.brakeTimeValue = (Date.now() - this.brakeStartedAt) / 1000
      this.status = 'finished'
      this.isPressing = false
      this.stopLoop()
      this.setData({
        speed: '000',
        needleAngle: -90,
        brakeForce: `${Math.round(this.forceValue)}N`,
        brakeOn: false,
        totalTime: this.formatTime(this.totalValue),
        buttonText: '再挑战',
      })
      wx.showModal({
        title: '挑战成功',
        content: `刹停用时：${this.formatTime(this.brakeTimeValue)}\n总用时：${this.formatTime(this.totalValue)}\n反应时间：${this.formatTime(this.reactionValue)}\n制动距离：${this.distanceValue.toFixed(1)}m`,
        showCancel: false,
      })
      return
    }

    this.updateDisplay()
  },

  updateDisplay() {
    this.setData({
      speed: this.formatSpeed(this.speedValue),
      brakeForce: `${Math.round(this.forceValue)}N`,
      brakeDistance: `${this.distanceValue.toFixed(1)}m`,
      reactionTime: this.formatTime(this.reactionValue),
      totalTime: this.formatTime(this.totalValue),
      needleAngle: this.getNeedleAngle(this.speedValue),
      brakeOn: this.isPressing,
    })
  },

  formatSpeed(value) {
    const rounded = Math.round(value)
    if (rounded < 10) {
      return `00${rounded}`
    }
    if (rounded < 100) {
      return `0${rounded}`
    }
    return String(rounded)
  },

  formatTime(value) {
    return `${value.toFixed(2)}s`
  },

  getNeedleAngle(speed) {
    const angle = speed * 0.9 - 90
    return Math.max(-90, Math.min(90, angle))
  },
})
