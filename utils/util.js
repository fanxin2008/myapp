const formatTime = date => {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hour = date.getHours()
  const minute = date.getMinutes()
  const second = date.getSeconds()

  return `${[year, month, day].map(formatNumber).join('/')} ${[hour, minute, second].map(formatNumber).join(':')}`
}

const formatNumber = n => {
  n = n.toString()
  return n[1] ? n : `0${n}`
}

const formatMs = ms => {
  const value = Number(ms)
  if (!isFinite(value)) {
    return '--'
  }
  return `${(value / 1000).toFixed(3)}s`
}

const formatSpeedKmh = milliKmh => {
  const value = Number(milliKmh)
  if (!isFinite(value)) {
    return '-km/h'
  }
  return `${Math.round(value / 1000)}km/h`
}

module.exports = {
  formatTime,
  formatMs,
  formatSpeedKmh,
}
