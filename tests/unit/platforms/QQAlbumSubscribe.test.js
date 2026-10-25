jest.mock('../../../platforms/qqmusic/module/album', () => jest.fn())

const albumDetail = require('../../../platforms/qqmusic/module/album')
const albumSubscribe = require('../../../platforms/qqmusic/module/album_sub')

test('QQ 专辑取消收藏接受 t=0 并使用详情返回的 mid', async () => {
  albumDetail.mockResolvedValue({ id: 123, mid: 'album-mid' })
  const request = jest.fn().mockResolvedValue({ body: { retCode: 0 } })

  await albumSubscribe({ id: '123', t: 0, uin: '42', qm_keyst: 'key' }, request)

  expect(request).toHaveBeenCalledWith(
    'music.musicasset.AlbumFavWrite',
    'CancelFavAlbum',
    { uin: '42', v_albumMid: ['album-mid'] },
    { uin: '42', qm_keyst: 'key' }
  )
})
