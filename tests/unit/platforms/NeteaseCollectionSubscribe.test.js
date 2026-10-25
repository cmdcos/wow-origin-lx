const artistSubscribe = require('../../../platforms/netease/module/artist_sub')
const albumSubscribe = require('../../../platforms/netease/module/album_sub')

test.each([
  ['artist', artistSubscribe],
  ['album', albumSubscribe]
])('%s 重复收藏 501 返回可识别的失败状态', async (_name, subscribe) => {
  const request = jest.fn().mockRejectedValue({ status: 501, body: { code: 501 } })

  await expect(subscribe({ id: '123', t: 1, MUSIC_U: 'music-u' }, request))
    .resolves.toEqual({ data: { code: 501 } })
})
