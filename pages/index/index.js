// index.js
const api = require('../../utils/api.js')

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
    forcePercent: 0,
    remainCount: 10,
    buttonText: '开始挑战',
    needleAngle: -90,

    resultVisible: false,
    result: {},
    nickname: '',
    nicknameError: '',
    submitted: false,
    ipLocation: '自动识别',
    bestRecordText: '暂无纪录',
    hasBestRecord: false,
    quotaReady: false,
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
  sessionId: null,
  lastAttemptId: null,
  pendingRequestId: null,
  starting: false,

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

    api.initCloud()

    try {
      const session = await api.ensureLogin()
      const user = (session && session.user) || {}
      if (user.nickname) {
        this.setData({ nickname: user.nickname })
      }
    } catch (err) {
      console.error('login failed', err)
    }

    this.detectIpLocation()
    this.refreshProfile()
    this.refreshQuota()
    this.refreshBest()
    this.restoreLastResult()
  },

  async refreshProfile() {
    try {
      const res = await api.getMe()
      if (res && res.nickname) {
        this.setData({ nickname: res.nickname })
      }
    } catch (err) {
      console.error('refresh profile failed', err)
    }
  },

  onUnload() {
    this.stopLoop()
  },

  goRank() {
    if(this.data.resultVisible) return;
    wx.navigateTo({
      url: '/pages/rank/rank',
    })
  },

  detectIpLocation() {
    const cached = wx.getStorageSync('ip_location')
    this.setData({
      ipLocation: cached || '自动识别',
    })
  },

  async refreshQuota() {
    try {
      const res = await api.getQuota()
      if (res && typeof res.remainingCount === 'number') {
        this.setData({
          remainCount: res.remainingCount,
          quotaReady: true,
        })
      }
    } catch (err) {
      console.error('refresh quota failed', err)
    }
  },

  async refreshBest() {
    try {
      const res = await api.getMyBest()
      if (res && res.hasRecord && res.bestRecord) {
        const best = res.bestRecord
        this.setData({
          hasBestRecord: true,
          bestRecordText: best.totalTimeMs ? this.formatMsText(best.totalTimeMs) : '暂无纪录',
        })
      }
    } catch (err) {
      console.error('refresh best failed', err)
    }
  },

  async restoreLastResult() {
    const attemptId = wx.getStorageSync('brake_last_attempt_id')
    if (!attemptId) {
      return
    }
    try {
      const res = await api.getResult(attemptId)
      if (!res || !res.result) {
        return
      }
      this.lastAttemptId = res.attemptId || attemptId
      const result = this.buildRestoredResult(res)

      if (res.publishStatus === 'PENDING') {
        result.canPublish = true
        result.submitted = false
      } else if (res.publishStatus === 'PUBLISHED') {
        result.canPublish = false
        result.submitted = true
        this.setData({ hasBestRecord: true })
      } else {
        return
      }

      this.setData({
        remainCount: typeof res.remainingCount === 'number' ? res.remainingCount : this.data.remainCount,
        resultVisible: true,
        result,
        submitted: result.submitted,
      })
    } catch (err) {
      console.error('restore result failed', err)
    }
  },

  buildRestoredResult(res) {
    const r = res.result || {}
    const bestMs = res.personalBestTimeMs
    let bestRecordText = bestMs ? `个人最佳 ${this.formatMsText(bestMs)}` : '暂无纪录'

    if (res.publishStatus === 'PENDING') {
      const candidate = this.formatMsText(r.totalTimeMs)
      bestRecordText = bestMs
        ? `新纪录 ${candidate} · 原最佳 ${this.formatMsText(bestMs)}`
        : `新纪录 ${candidate}`
    }

    return {
      type: 'success',
      title: r.title || '安全刹停',
      desc: '',
      bigValue: r.totalTimeMs ? (r.totalTimeMs / 1000).toFixed(3) : '',
      bigLabel: '总用时',
      stats: [
        { label: '反应时间', value: this.formatMsText(r.reactionTimeMs) },
        { label: '入刹速度', value: r.entrySpeedMilliKmh ? `${Math.round(r.entrySpeedMilliKmh / 1000)}km/h` : '-km/h' },
        { label: '峰值力度', value: r.maxBrakeForceN ? `${Math.round(r.maxBrakeForceN)}N` : '0N' },
      ],
      publishStatus: res.publishStatus,
      canPublish: false,
      saving: false,
      submitted: false,
      bestRecordText,
      rankingText: this.buildRankingText(res.rankingSnapshot),
      attemptId: res.attemptId,
      firstRecordTip: false,
    }
  },

  handleStartTap() {
    if (this.status !== 'idle') {
      return
    }
    this.startChallenge()
  },

  async startChallenge() {
    if (this.status !== 'idle' || this.starting) {
      return
    }
    if (this.data.remainCount <= 0) {
      this.showExhausted()
      return
    }

    this.starting = true
    if (!this.pendingRequestId) {
      this.pendingRequestId = this.genRequestId()
    }

    try {
      const res = await api.startChallenge(this.pendingRequestId)
      this.pendingRequestId = null
      this.sessionId = res.sessionId
      if (typeof res.remainingCount === 'number') {
        this.setData({ remainCount: res.remainingCount })
      }
      this.beginGame()
    } catch (err) {
      if (err && err.code === 'QUOTA_EXHAUSTED') {
        this.pendingRequestId = null
        this.setData({ remainCount: 0 })
        this.showExhausted()
      } else {
        wx.showToast({
          title: (err && err.message) || '开始挑战失败',
          icon: 'none',
        })
      }
    } finally {
      this.starting = false
    }
  },

  beginGame() {
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
      speed: '000',
      brakeForce: '0N',
      forcePercent: 100,
      brakeOn: false,
      buttonText: '踩下刹车',
      reactionTime: '0.00s',
      totalTime: '0.00s',
      brakeDistance: '0.0m',
      needleAngle: -90,
      nicknameError: '',
      submitted: false,
    })

    this.startLoop()
  },

  startBrake() {
    if(this.data.resultVisible) return;
    if (this.status === 'idle') {
      this.startChallenge()
      return
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
    if(this.data.resultVisible) return;
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
    const now = Date.now()
    const totalMs = now - this.hundredAt
    this.totalValue = totalMs / 1000
    const reactionMs = Math.max(0, this.brakeStartedAt ? this.brakeStartedAt - this.hundredAt : Math.round(this.reactionValue * 1000))
    const brakeDurationMs = Math.max(0, totalMs - reactionMs)

    this.lastResult = {
      totalMs,
      reactionMs,
      brakeDurationMs,
      entrySpeedMilliKmh: Math.round(this.brakeSpeedValue * 1000),
      maxBrakeForceN: Math.round(this.peakForceValue),
      brakingDistanceMm: Math.round(this.distanceValue * 1000),
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
      publishStatus: 'SUBMITTING',
      canPublish: false,
      saving: true,
      submitted: false,
      bestRecordText: this.data.bestRecordText,
      rankingText: '',
      firstRecordTip: false,
    })

    this.submitAttempt()
  },

  async submitAttempt(retried = false) {
    const attempt = this.lastResult
    if (!attempt || !this.sessionId) {
      this.setData({ 'result.saving': false })
      return
    }

    try {
      const res = await api.submitChallenge(this.sessionId, {
        totalTimeMs: attempt.totalMs,
        reactionTimeMs: attempt.reactionMs,
        brakeDurationMs: attempt.brakeDurationMs,
        entrySpeedMilliKmh: attempt.entrySpeedMilliKmh,
        maxBrakeForceN: attempt.maxBrakeForceN,
        brakingDistanceMm: attempt.brakingDistanceMm,
      })
      this.lastAttemptId = res.attemptId
      wx.setStorageSync('brake_last_attempt_id', res.attemptId)
      this.applySubmitResult(res)
    } catch (err) {
      if (err && err.code === 'NETWORK_ERROR' && !retried) {
        this.submitAttempt(true)
        return
      }
      console.error('submit failed', err)
      wx.showToast({
        title: (err && err.message) || '成绩保存失败',
        icon: 'none',
      })
      this.setData({
        'result.saving': false,
        'result.canPublish': false,
      })
    }
  },

  applySubmitResult(res) {
    const personalBest = (res && res.personalBest) || {}
    const canPublish = personalBest.publishStatus === 'PENDING'

    this.setData({
      remainCount: typeof res.remainingCount === 'number' ? res.remainingCount : this.data.remainCount,
      'result.saving': false,
      'result.publishStatus': personalBest.publishStatus || 'NOT_ELIGIBLE',
      'result.canPublish': canPublish,
      'result.submitted': false,
      'result.bestRecordText': this.buildSubmitBestText(personalBest),
      'result.firstRecordTip': !this.data.hasBestRecord && canPublish,
      'result.attemptId': res.attemptId,
    })
  },

  buildSubmitBestText(personalBest) {
    if (!personalBest || !personalBest.isCandidate) {
      if (personalBest && personalBest.publishedBestTimeMs) {
        return `个人最佳 ${this.formatMsText(personalBest.publishedBestTimeMs)}`
      }
      return this.data.bestRecordText || '暂无纪录'
    }

    const candidate = this.formatMsText(personalBest.candidateBestTimeMs)
    if (personalBest.publishedBestTimeMs) {
      return `新纪录 ${candidate} · 原最佳 ${this.formatMsText(personalBest.publishedBestTimeMs)}`
    }
    return `新纪录 ${candidate}`
  },

  showResult(result) {
    if (result && result.type === 'success') {
      result.bestRecordText = result.bestRecordText || this.data.bestRecordText || '暂无纪录'
    }
    this.resetGame()
    this.setData({
      result,
      resultVisible: true,
      submitted: !!(result && result.submitted),
    })
  },

  showExhausted() {
    this.showResult({
      type: 'exhausted',
      title: '挑战次数已用完',
      desc: '北京时间每日 00:00 自动刷新次数',
      bigValue: '',
      bigLabel: '',
      stats: [],
      saving: false,
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
      forcePercent: 0,
      brakeOn: false,
      buttonText: '开始挑战',
      reactionTime: '0.00s',
      totalTime: '0.00s',
      brakeDistance: '0.0m',
      needleAngle: -90,
      resultVisible: false

    })
  },

  noop() {},

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

  async submitRecord(retried = false) {
    if (this.data.submitted || this.data.result.submitted) {
      return
    }

    const nickname = (this.data.nickname || '').trim()
    if (!nickname) {
      this.setData({ nicknameError: '请输入昵称' })
      return
    }
    if ([...nickname].length > 16) {
      this.setData({ nicknameError: '昵称最多 16 个字符' })
      return
    }

    const attemptId = this.lastAttemptId || this.data.result.attemptId
    if (!attemptId) {
      wx.showToast({ title: '成绩尚未保存', icon: 'none' })
      return
    }

    this.setData({ nicknameError: '' })
    try {
      const res = await api.publishRecord(attemptId, nickname)
      this.applyPublishResult(res, nickname)
    } catch (err) {
      if (err && err.code === 'NETWORK_ERROR' && !retried) {
        this.submitRecord(true)
        return
      }
      if (err && err.code === 'NOT_A_NEW_BEST') {
        wx.showToast({ title: '已有更快的个人纪录', icon: 'none' })
        this.setData({
          'result.canPublish': false,
          'result.publishStatus': 'DECLINED',
          'result.submitted': true,
        })
        this.refreshBest()
      } else {
        wx.showToast({
          title: (err && err.message) || '提交失败',
          icon: 'none',
        })
      }
    }
  },

  applyPublishResult(res, nickname) {
    const page = (res && res.pageData) || {}
    const bestMs = page.personalBestTimeMs
    const rankingText = page.displayMessage || this.buildRankingText(page.ranking)

    this.setData({
      submitted: true,
      nickname,
      nicknameError: '',
      hasBestRecord: true,
      bestRecordText: bestMs ? this.formatMsText(bestMs) : this.data.bestRecordText,
      remainCount: typeof page.remainingCount === 'number' ? page.remainingCount : this.data.remainCount,
      'result.submitted': true,
      'result.canPublish': false,
      'result.publishStatus': 'PUBLISHED',
      'result.bestRecordText': bestMs ? `个人最佳 ${this.formatMsText(bestMs)}` : this.data['result.bestRecordText'],
      'result.rankingText': rankingText,
    })
    wx.setStorageSync('brake_last_attempt_id', res.attemptId || this.lastAttemptId)
  },

  buildRankingText(ranking) {
    if (!ranking) {
      return ''
    }
    const parts = []
    if (ranking.nationalRank != null) {
      parts.push(`全国第 ${ranking.nationalRank} 名`)
    }
    if (ranking.provinceRank != null) {
      parts.push(`省第 ${ranking.provinceRank} 名`)
    }
    if (ranking.cityRank != null) {
      parts.push(`市第 ${ranking.cityRank} 名`)
    }
    return parts.join(' · ')
  },

  formatMsText(ms) {
    const value = Number(ms)
    if (!isFinite(value)) {
      return '--'
    }
    return `${(value / 1000).toFixed(3)}s`
  },

  genRequestId() {
    const s = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'
    return s.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0
      const v = c === 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })
  },

  updateDisplay() {
    const totalTime = this.hundredAt
      ? this.formatTime((Date.now() - this.hundredAt) / 1000)
      : '0.00s'
    let forcePercent = Math.min(100, Math.max(0, (this.forceValue / this.BREAK_LIMIT) * 100))
    if(this.forceValue == 0) {
      forcePercent = 0;
    }
    this.setData({
      speed: this.formatSpeed(this.speedValue),
      brakeForce: `${Math.round(this.forceValue)}N`,
      forcePercent,
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
