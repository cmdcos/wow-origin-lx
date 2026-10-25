jest.mock('axios', () => ({ default: { get: jest.fn() } }))

const { default: axios } = require('axios')
const albumSublist = require('../../../platforms/qqmusic/module/album_sublist')

const credentials = { uin: '123', qm_keyst: 'test' }

describe('QQMusic favorite albums', () => {
  test('空专辑收藏返回空页', async () => {
    axios.get.mockResolvedValue({ data: { code: 0, data: { totalalbum: 0, albumlist: [] } } })

    await expect(albumSublist(credentials)).resolves.toEqual({ data: [], more: false, total: 0 })
  })

  test('上游业务错误不能被误判为空收藏', async () => {
    axios.get.mockResolvedValue({ data: { code: 4000, data: {} } })

    await expect(albumSublist(credentials)).rejects.toThrow('code 4000')
  })
})
