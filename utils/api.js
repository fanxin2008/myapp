// utils/api.js
// 统一封装微信云托管 HTTP 接口调用，遵循后端 API 契约 V1.0。
const ENV_ID = 'prod-d7gy3mlkhe17e35f1'
const SERVICE_NAME = 'express-b7m1'
const API_PREFIX = '/api'

const TOKEN_KEY = 'brake_access_token'
const TOKEN_EXPIRES_AT_KEY = 'brake_access_token_expires_at'
const USER_KEY = 'brake_user'

class ApiError extends Error {
  constructor(code, message, statusCode) {
    super(message || code || '请求失败')
    this.name = 'ApiError'
    this.code = code || 'UNKNOWN'
    this.statusCode = statusCode || 0
  }
}

let loginPromise = null

function initCloud() {
  if (!wx.cloud) {
    return
  }
  wx.cloud.init({
    env: ENV_ID,
    traceUser: true,
  })
}

function getToken() {
  const token = wx.getStorageSync(TOKEN_KEY)
  const expiresAt = wx.getStorageSync(TOKEN_EXPIRES_AT_KEY) || 0
  if (!token || expiresAt <= Date.now()) {
    return ''
  }
  return token
}

function setSession(session) {
  if (!session) {
    return
  }
  wx.setStorageSync(TOKEN_KEY, session.accessToken)
  const expiresInSeconds = Number(session.expiresInSeconds) || 7200
  wx.setStorageSync(TOKEN_EXPIRES_AT_KEY, Date.now() + expiresInSeconds * 1000 - 60 * 1000)
  if (session.user) {
    wx.setStorageSync(USER_KEY, session.user)
  }
}

function getCachedUser() {
  return wx.getStorageSync(USER_KEY) || null
}

function getLoginCode() {
  return new Promise((resolve, reject) => {
    wx.login({
      success: (res) => {
        if (res && res.code) {
          resolve(res.code)
        } else {
          reject(new ApiError('WX_LOGIN_FAILED', '微信登录失败'))
        }
      },
      fail: (err) => reject(new ApiError('WX_LOGIN_FAILED', (err && err.errMsg) || '微信登录失败')),
    })
  })
}

function normalizeResponse(res) {
  let statusCode = res && res.statusCode ? res.statusCode : 200
  let body = res && res.data !== undefined ? res.data : res
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch (e) {
      // 保留原始字符串
    }
  }
  return { statusCode, body }
}

function callContainer({ path, method = 'GET', data, header }) {
  const finalHeader = Object.assign({}, header)
  return wx.cloud.callContainer({
    config: {
      env: ENV_ID,
    },
    path,
    method,
    header: finalHeader,
    data,
  })
}

async function request({ path, method = 'GET', data, auth = true, retry = true }) {
  const header = {
    'X-WX-SERVICE': SERVICE_NAME,
  }
  if (auth) {
    const token = getToken()
    if (token) {
      header.Authorization = `Bearer ${token}`
    }
  }

  let res
  try {
    res = await callContainer({
      path: API_PREFIX + path,
      method,
      data,
      header,
    })
  } catch (err) {
    throw new ApiError('NETWORK_ERROR', (err && err.errMsg) || '网络异常，请稍后重试', 0)
  }

  const { statusCode, body } = normalizeResponse(res)

  if (statusCode >= 200 && statusCode < 300) {
    return body
  }

  if (statusCode === 401 && auth && retry) {
    await login()
    return request({ path, method, data, auth, retry: false })
  }

  const code = (body && body.code) || `HTTP_${statusCode}`
  const message = (body && body.message) || '请求失败'
  throw new ApiError(code, message, statusCode)
}

async function login() {
  if (loginPromise) {
    return loginPromise
  }
  loginPromise = (async () => {
    const code = await getLoginCode()
    const session = await request({
      path: '/auth/wechat-login',
      method: 'POST',
      data: { code },
      auth: false,
    })
    setSession(session)
    return session
  })().finally(() => {
    loginPromise = null
  })
  return loginPromise
}

async function ensureLogin(options = {}) {
  const force = !!(options && options.force)
  if (!force && getToken()) {
    const cached = getCachedUser()
    if (cached) {
      return { user: cached }
    }
  }
  return login()
}

function getMe() {
  return request({ path: '/users/me' })
}

function updateNickname(nickname) {
  return request({ path: '/users/me', method: 'PATCH', data: { nickname } })
}

function getQuota() {
  return request({ path: '/challenges/quota' })
}

function startChallenge(requestId) {
  return request({
    path: '/challenges/start',
    method: 'POST',
    data: { requestId },
  })
}

function submitChallenge(sessionId, payload) {
  return request({
    path: '/challenges/submit',
    method: 'POST',
    data: Object.assign({ sessionId }, payload),
  })
}

function publishRecord(attemptId, nickname) {
  const data = { attemptId }
  if (nickname) {
    data.nickname = nickname
  }
  return request({
    path: '/records/publish',
    method: 'POST',
    data,
  })
}

function getMyBest() {
  return request({ path: '/records/me/best' })
}

function getResult(attemptId) {
  return request({ path: `/challenges/${attemptId}/result` })
}

function getLeaderboard(scope, limit = 20, offset = 0) {
  return request({
    path: `/leaderboards?scope=${scope}&limit=${limit}&offset=${offset}`,
  })
}

function getMyRank(scope) {
  return request({ path: `/leaderboards/me?scope=${scope}` })
}

module.exports = {
  ApiError,
  initCloud,
  ensureLogin,
  login,
  getMe,
  updateNickname,
  getQuota,
  startChallenge,
  submitChallenge,
  publishRecord,
  getMyBest,
  getResult,
  getLeaderboard,
  getMyRank,
}
