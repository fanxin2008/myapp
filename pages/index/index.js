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

    resultVisible: false,
    result: {},
    nickname: '',
    nicknameError: '',
    submitted: false,
    ipLocation: '未知',
    bestRecordText: '暂无纪录',
    hasBestRecord: false,
  },

  timer: null,
  status: 'idle',
  speedValue: 0,
  forceValue: 0,
  distanceValue: 0,
  reactionValue: 0,
  totalValue: 0,
  startAt: 0,
  hundredAt: 0,
  brakeStartedAt: 0,
  brakeSpeedValue: 0,
  peakForceValue: 0,
  isPressing: false,
  reached100: false,
  lastResult: null,

  OVERSPEED_LIMIT: 200,
  BREAK_LIMIT: 1600,
  GREEN_LIGHT_SPEED: 100,
  ACCELERATION: 2.4,
  FORCE_GAIN: 80,
  FORCE_RELEASE: 60,
  DECEL_FACTOR: 0.002,

  async onLoad() {
    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    this.setData({
      statusBarHeight: windowInfo.statusBarHeight || 20,
    })
    wx.cloud.init({
      // 此处请填入环境 ID, 环境 ID 可打开云控制台查看
      env: 'prod-d7gy3mlkhe17e35f1',
      traceUser: true,
    })
    try {
      const res = await wx.cloud.callContainer({
        "config": {
          "env": "prod-d7gy3mlkhe17e35f1"
        },
        "path": "/api/auth/login",
        "header": {
          "X-WX-SERVICE": "express-b7m1"
        },
        "method": "POST",
        "data": {
          "action": "inc"
        }
      })
      console.log(res)
    } catch (err) {
      console.error('callContainer /auth/login failed', err)
    }

    const best = wx.getStorageSync('brake_best_record')
    if (best && typeof best.total === 'number') {
      this.setData({
        hasBestRecord: true,
        bestRecordText: `${best.nickname} ${best.total.toFixed(3)}s`,
        nickname: best.nickname || '',
      })
    }

    this.detectIpLocation()
  },

  onUnload() {
    this.stopLoop()
  },

  goRank() {
    wx.navigateTo({
      url: '/pages/rank/rank',
    })
  },


  detectIpLocation() {
    const cached = wx.getStorageSync('ip_location')
    this.setData({
      ipLocation: cached || '北京',
    })
  },

  handleStartTap() {
    if (this.status !== 'idle') {
      return
    }
    this.startChallenge()
  },

  startChallenge() {
    if (this.data.remainCount <= 0) {
      this.showResult({
        type: 'exhausted',
        title: '挑战次数已用完',
        desc: '',
        bigValue: '',
        bigLabel: '',
        stats: [],
      })
      return
    }

    this.stopLoop()
    this.speedValue = 0
    this.forceValue = 0
    this.distanceValue = 0
    this.reactionValue = 0
    this.totalValue = 0
    this.startAt = Date.now()
    this.hundredAt = 0
    this.brakeStartedAt = 0
    this.brakeSpeedValue = 0
    this.peakForceValue = 0
    this.isPressing = false
    this.reached100 = false
    this.lastResult = null
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
      resultVisible: false,
      nicknameError: '',
      submitted: false,
    })

    this.startLoop()
  },

  startBrake() {
    if (this.status == 'idle') {
        this.startChallenge()
        return;
    }
    if (this.status !== 'accelerating' && this.status !== 'braking') {
      return
    }

    if (this.status === 'accelerating') {
      if (!this.reached100) {
        this.showResult({
          type: 'early',
          title: '刹车过早',
          desc: '还没到 100 km/h！等绿灯亮起后再踩下。',
          bigValue: `${Math.round(this.speedValue)} km/h`,
          bigLabel: '首次达到 100 km/h 后才可刹车',
          stats: [
            { label: '反应时间', value: '-' },
            { label: '入刹速度', value: '-km/h' },
            { label: '峰值力度', value: '0N' },
          ],
        })
        return
      }

      this.status = 'braking'
      this.reactionValue = (Date.now() - this.hundredAt) / 1000
      this.brakeStartedAt = Date.now()
      this.brakeSpeedValue = this.speedValue
    }

    this.isPressing = true
    this.setData({
      brakeOn: true,
      buttonText: '持续踩加力',
    })
  },

  stopBrake() {
    if (!this.isPressing) {
      return
    }
    this.isPressing = false
    this.setData({
      brakeOn: false,
      buttonText: '踩下刹车',
    })
  },

  startLoop() {
    this.stopLoop()
    this.timer = setInterval(() => {
      this.tick()
    }, 80)
  },

  stopLoop() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  },

  tick() {
    if (this.status === 'accelerating') {
      this.speedValue += this.ACCELERATION

      if (!this.reached100 && this.speedValue >= this.GREEN_LIGHT_SPEED) {
        this.reached100 = true
        this.hundredAt = Date.now()
      }

      this.distanceValue += (this.speedValue / 3.6) * 0.05

      if (this.speedValue > this.OVERSPEED_LIMIT) {
        this.showResult({
          type: 'overspeed',
          title: '错过刹车时机',
          desc: '车速已经太高。注意绿灯，及时踩下刹车。',
          bigValue: '200 km/h',
          bigLabel: '达到 100 km/h 后立即开始刹车',
          stats: [
            { label: '反应时间', value: '-' },
            { label: '入刹速度', value: '-km/h' },
            { label: '峰值力度', value: '0N' },
          ],
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
      this.forceValue += this.FORCE_GAIN
      if (this.forceValue > this.peakForceValue) {
        this.peakForceValue = this.forceValue
      }
      if (this.forceValue > this.BREAK_LIMIT) {
        this.showResult({
          type: 'broken',
          title: '踏板断裂',
          desc: '提前松开按压区，给踏板惯性留出余量。',
          bigValue: '1600N',
          bigLabel: '峰值力度 • 踏板承受极限 1600 N',
          stats: [
            { label: '反应时间', value: this.formatTime(this.reactionValue) },
            { label: '入刹速度', value: `${Math.round(this.brakeSpeedValue)}km/h` },
            { label: '峰值力度', value: '1600N' },
          ],
        })
        return
      }
    } else {
      this.forceValue = Math.max(0, this.forceValue - this.FORCE_RELEASE)
    }

    const deceleration = this.forceValue * this.DECEL_FACTOR
    this.speedValue = Math.max(0, this.speedValue - deceleration)
    this.distanceValue += (this.speedValue / 3.6) * 0.05

    if (this.speedValue <= 0) {
      this.succeed()
      return
    }

    this.updateDisplay()
  },

  succeed() {
    this.totalValue = (Date.now() - this.hundredAt) / 1000
    this.lastResult = {
      total: this.totalValue,
      speed: this.brakeSpeedValue,
      reaction: this.reactionValue,
      peak: this.peakForceValue,
    }

    this.showResult({
      type: 'success',
      title: '安全刹停',
      desc: '',
      bigValue: this.totalValue.toFixed(3),
      bigLabel: '总用时 • 从首次达到 100 km/h 开始',
      stats: [
        { label: '反应时间', value: this.formatTime(this.reactionValue) },
        { label: '入刹速度', value: `${Math.round(this.brakeSpeedValue)}km/h` },
        { label: '峰值力度', value: `${Math.round(this.peakForceValue)}N` },
      ],
    })
  },

  showResult(result) {
    this.resetGame()
    this.setData({
      result,
      resultVisible: true,
      submitted: false,
    })
  },

  resetGame() {
    this.stopLoop()
    this.status = 'idle'
    this.speedValue = 0
    this.forceValue = 0
    this.distanceValue = 0
    this.reactionValue = 0
    this.totalValue = 0
    this.startAt = 0
    this.hundredAt = 0
    this.brakeStartedAt = 0
    this.brakeSpeedValue = 0
    this.peakForceValue = 0
    this.isPressing = false
    this.reached100 = false

    this.setData({
      speed: '000',
      brakeForce: '0N',
      brakeOn: false,
      buttonText: '开始挑战',
      reactionTime: '0.00s',
      totalTime: '0.00s',
      brakeDistance: '0.0m',
      needleAngle: -90,
    })
  },

  noop() {},

  closeResult() {
    this.setData({
      resultVisible: false,
    })
  },

  goHome() {
    this.setData({
      resultVisible: false,
    })
  },

  retry() {
    this.setData({
      resultVisible: false,
    })
    this.startChallenge()
  },

  onNicknameInput(e) {
    this.setData({
      nickname: e.detail.value,
      nicknameError: '',
    })
  },

  submitRecord() {
    const nickname = (this.data.nickname || '').trim()
    if (!nickname) {
      this.setData({
        nicknameError: '请输入昵称',
      })
      return
    }

    const current = this.lastResult
    if (!current) {
      return
    }

    const record = {
      nickname,
      total: current.total,
      speed: current.speed,
      reaction: current.reaction,
      peak: current.peak,
    }

    wx.setStorageSync('brake_best_record', record)
    this.setData({
      hasBestRecord: true,
      bestRecordText: `${nickname} ${current.total.toFixed(3)}s`,
      nickname,
      nicknameError: '',
      submitted: true,
    })
  },

  updateDisplay() {
    const totalTime = this.hundredAt
      ? this.formatTime((Date.now() - this.hundredAt) / 1000)
      : '0.00s'

    this.setData({
      speed: this.formatSpeed(this.speedValue),
      brakeForce: `${Math.round(this.forceValue)}N`,
      brakeDistance: `${this.distanceValue.toFixed(1)}m`,
      reactionTime: this.formatTime(this.reactionValue),
      totalTime,
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
