// rank.js
const api = require('../../utils/api.js')
const util = require('../../utils/util.js')

const SCOPES = {
  nation: { label: '全国', value: 'national' },
  province: { label: '全省', value: 'province' },
  city: { label: '全市', value: 'city' },
}

Page({
  data: {
    scope: 'city',
    scopeText: '全市',
    count: 0,
    list: [],
    loading: false,
    hasMore: false,
    myRankText: '',
  },

  offset: 0,
  limit: 20,

  onLoad() {
    api.initCloud()
    this.load()
  },

  async load(reset = true) {
    if (this.data.loading) {
      return
    }
    this.setData({ loading: true })
    if (reset) {
      this.offset = 0
    }

    try {
      await api.ensureLogin()
      const conf = SCOPES[this.data.scope]
      const board = await api.getLeaderboard(conf.value, this.limit, this.offset)
      const items = (board.items || []).map(item => ({
        rank: item.rank,
        userId: item.userId,
        nickname: item.nickname || '匿名车手',
        cityName: item.cityName || '未知地区',
        bestTimeMs: item.bestTimeMs,
        timeText: util.formatMs(item.bestTimeMs),
      }))

      const list = reset ? items : this.data.list.concat(items)
      this.offset += items.length
      this.setData({
        scopeText: conf.label,
        count: board.totalPlayers || 0,
        list,
        hasMore: this.offset < (board.totalPlayers || 0),
      })
      this.loadMyRank()
    } catch (err) {
      wx.showToast({
        title: (err && err.message) || '排行榜加载失败',
        icon: 'none',
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  async loadMyRank() {
    try {
      const conf = SCOPES[this.data.scope]
      const res = await api.getMyRank(conf.value)
      if (!res) {
        return
      }
      if (res.hasRecord && res.rank != null) {
        this.setData({
          myRankText: `我的排名：第 ${res.rank} 名 / ${res.totalPlayers} 人 · 最好 ${util.formatMs(res.bestTimeMs)}`,
        })
      } else if (res.hasRecord) {
        this.setData({ myRankText: '暂未参与该榜单排名' })
      } else {
        this.setData({ myRankText: '暂无个人纪录' })
      }
    } catch (err) {
      console.error('load my rank failed', err)
    }
  },

  switchScope(e) {
    const scope = e.currentTarget.dataset.scope
    if (scope === this.data.scope) {
      return
    }
    this.setData({
      scope,
      list: [],
      count: 0,
      myRankText: '',
    })
    this.load()
  },

  onReachBottom() {
    if (this.data.hasMore) {
      this.load(false)
    }
  },

  onPullDownRefresh() {
    this.load().finally(() => {
      wx.stopPullDownRefresh()
    })
  },
})
