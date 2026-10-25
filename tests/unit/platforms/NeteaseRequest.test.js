jest.mock('axios', () => ({
  default: jest.fn()
}))

jest.mock('../../../platforms/netease/util/crypto', () => ({
  eapi: jest.fn(() => ({ params: 'encrypted-request' })),
  eapiResDecrypt: jest.fn(() => {
    throw new Error('ArrayBuffer must not use the hex-string fallback')
  }),
  eapiResDecryptBuffer: jest.fn(() => ({
    code: 200,
    unikey: 'cloudflare-qr-token'
  })),
  xeapiSign: jest.fn(() => 'valid-signature'),
  xeapiDecryptPublicKey: jest.fn(() => ({ publicKey: 'public-key', sk: 'sk', version: '1' })),
  xeapi: jest.fn(() => ({ C: 'encrypted-body', S: 'sealed-key', R: 'key-version' })),
  xeapiResDecrypt: jest.fn(() => ({ code: 200, data: [{ url: 'https://audio.example/song' }] }))
}))

const { default: axios } = require('axios')
const vm = require('node:vm')
const encrypt = require('../../../platforms/netease/util/crypto')
const createRequest = require('../../../platforms/netease/util/request')

describe('NetEase request transport', () => {
  beforeEach(() => {
    encrypt.eapi.mockReturnValue({ params: 'encrypted-request' })
    encrypt.eapiResDecrypt.mockImplementation(() => {
      throw new Error('ArrayBuffer must not use the hex-string fallback')
    })
    encrypt.eapiResDecryptBuffer.mockReturnValue({
      code: 200,
      unikey: 'cloudflare-qr-token'
    })
    encrypt.xeapiSign.mockReturnValue('valid-signature')
    encrypt.xeapiDecryptPublicKey.mockReturnValue({ publicKey: 'public-key', sk: 'sk', version: '1' })
    encrypt.xeapi.mockReturnValue({ C: 'encrypted-body', S: 'sealed-key', R: 'key-version' })
    encrypt.xeapiResDecrypt.mockReturnValue({ code: 200, data: [{ url: 'https://audio.example/song' }] })
  })

  test('Cloudflare ArrayBuffer EAPI 响应会先转换为 Buffer 再解密', async () => {
    const encryptedResponse = vm.runInNewContext('Uint8Array.from([1, 2, 3, 4]).buffer')
    axios.mockResolvedValue({
      status: 200,
      data: encryptedResponse,
      headers: {}
    })

    const result = await createRequest('/api/login/qrcode/unikey', { type: 3 }, {
      crypto: 'eapi',
      useCheckToken: false,
      MUSIC_U: ''
    })

    expect(result.body).toEqual({ code: 200, unikey: 'cloudflare-qr-token' })
    expect(encrypt.eapiResDecryptBuffer).toHaveBeenCalledTimes(1)
    expect(Buffer.isBuffer(encrypt.eapiResDecryptBuffer.mock.calls[0][0])).toBe(true)
    expect([...encrypt.eapiResDecryptBuffer.mock.calls[0][0]]).toEqual([1, 2, 3, 4])
  })

  test('XEAPI 先获取公钥并用 Android 身份请求歌曲链接', async () => {
    axios.mockImplementation(async (settings) => settings.url.includes('/bsr/sk/get')
      ? {
          status: 200,
          data: { code: 200, data: { encryptedData: 'encrypted-key', signature: 'valid-signature', timestamp: '123' } }
        }
      : { status: 200, data: Uint8Array.from([1, 2, 3]).buffer, headers: {
          'x-encr-ssid': 'session-id', 'x-encr-sskey': 'session-key-1234'
        } })

    const result = await createRequest('/api/song/enhance/player/url/v1', {
      ids: '[123]', level: 'sky', encodeType: 'flac', immerseType: 'c51'
    }, {
      crypto: 'xeapi', MUSIC_U: 'music-u', deviceId: 'device-id'
    })

    expect(result.body.data[0].url).toBe('https://audio.example/song')
    expect(axios).toHaveBeenCalledTimes(2)
    const keyRequest = axios.mock.calls[0][0]
    expect(keyRequest.url).toContain('/api/bsr/sk/get')
    expect(keyRequest.data).toContain('deviceId=device-id')
    const songRequest = axios.mock.calls[1][0]
    expect(songRequest.url).toBe('https://interface3.music.163.com/xeapi/song/enhance/player/url/v1')
    expect(songRequest.headers).toMatchObject({
      'x-os': 'android', 'x-appver': '9.1.65', 'x-deviceid': 'device-id', 'x-music-u': 'music-u'
    })
    expect(new URLSearchParams(songRequest.data).get('C')).toBe('encrypted-body')
    expect(encrypt.xeapi).toHaveBeenCalledWith('/api/song/enhance/player/url/v1', {
      ids: '[123]', level: 'sky', encodeType: 'flac', immerseType: 'c51'
    }, {
      publicKeyState: { publicKey: 'public-key', sk: 'sk', version: '1' },
      sessionId: '', sessionKey: '', os: 'android'
    })
    expect(Buffer.isBuffer(encrypt.xeapiResDecrypt.mock.calls[0][0])).toBe(true)

    await createRequest('/api/song/enhance/player/url/v1', { ids: '[456]', level: 'lossless' }, {
      crypto: 'xeapi', MUSIC_U: 'music-u', deviceId: 'device-id'
    })
    expect(encrypt.xeapi.mock.calls[1][2]).toMatchObject({
      sessionId: 'session-id', sessionKey: 'session-key-1234'
    })
  })
})
