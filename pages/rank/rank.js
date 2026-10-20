const LISTS = {
  nation: {
    text: '全国',
    count: 12345,
    list: [
      { rank: 1, name: 'lh', city: '北京市', time: '3.487s' },
      { rank: 2, name: '123', city: '北京市', time: '3.495s' },
      { rank: 3, name: '下面都是给醉如痴', city: '北京市', time: '3.495s' },
      { rank: 4, name: 'Kz', city: '北京市', time: '3.495s' },
      { rank: 5, name: 'NPS', city: '北京市', time: '3.499s' },
      { rank: 6, name: 'A*', city: '北京市', time: '3.499s' },
      { rank: 7, name: '雷军', city: '北京市', time: '3.508s' },
      { rank: 8, name: '上面的是给jagerc', city: '北京市', time: '3.524s' },
    ],
  },
  province: {
    text: '全省',
    count: 678,
    list: [
      { rank: 1, name: 'lh', city: '北京市', time: '3.487s' },
      { rank: 2, name: 'Kz', city: '北京市', time: '3.495s' },
      { rank: 3, name: 'NPS', city: '北京市', time: '3.499s' },
      { rank: 4, name: '雷军', city: '北京市', time: '3.508s' },
      { rank: 5, name: 'A*', city: '北京市', time: '3.524s' },
    ],
  },
  city: {
    text: '全市',
    count: 201,
    list: [
      { rank: 1, name: 'lh', city: '北京市', time: '3.487s' },
      { rank: 2, name: '123', city: '北京市', time: '3.495s' },
      { rank: 3, name: '下面都是给醉如痴', city: '北京市', time: '3.495s' },
      { rank: 4, name: 'Kz', city: '北京市', time: '3.495s' },
      { rank: 5, name: 'NPS', city: '北京市', time: '3.499s' },
      { rank: 6, name: 'A*', city: '北京市', time: '3.499s' },
      { rank: 7, name: '雷军', city: '北京市', time: '3.508s' },
      { rank: 8, name: '上面的是给jagerc', city: '北京市', time: '3.524s' },
    ],
  },
}

Page({
  data: {
    scope: 'city',
    scopeText: '全市',
    count: 201,
    list: LISTS.city.list,
  },

  switchScope(e) {
    const scope = e.currentTarget.dataset.scope
    const conf = LISTS[scope]
    this.setData({
      scope,
      scopeText: conf.text,
      count: conf.count,
      list: conf.list,
    })
  },

  goBack() {
    wx.navigateBack()
  },
})
