const nodeCrypto = require('node:crypto')
const { xeapi } = require('../../../platforms/netease/util/crypto')

const staticKey = Buffer.from('ab1d5a430f6bb04a3f01e81ddd72bd916d5ce591248ac128714806d7f8fb1b84', 'hex')
const x25519SpkiPrefix = Buffer.from('302a300506032b656e032100', 'hex')

function decryptEcb(key, input) {
  const cipher = nodeCrypto.createDecipheriv(`aes-${key.length * 8}-ecb`, key, Buffer.alloc(0))
  return Buffer.concat([cipher.update(input), cipher.final()])
}

test('XEAPI 请求可按参考协议还原 C、S、R 和表单内容', () => {
  const peer = nodeCrypto.generateKeyPairSync('x25519')
  const publicKeyState = {
    publicKey: Buffer.from(peer.publicKey.export({ format: 'der', type: 'spki' })).subarray(-32).toString('base64'),
    sk: 'test-sk',
    version: '1'
  }
  const encrypted = xeapi('/api/song/enhance/player/url/v1', {
    ids: '[123]', level: 'master', encodeType: 'flac'
  }, { publicKeyState, os: 'android' })

  expect(Object.keys(encrypted)).toEqual(['C', 'S', 'R'])
  expect(encrypted.C).toMatch(/^[A-Za-z0-9_-]+$/)
  expect(decryptEcb(staticKey, Buffer.from(encrypted.R, 'base64')).toString()).toBe('1|')

  const sealedKey = Buffer.from(encrypted.S, 'base64')
  const ephemeral = sealedKey.subarray(0, 32)
  const ephemeralPublicKey = nodeCrypto.createPublicKey({
    key: Buffer.concat([x25519SpkiPrefix, ephemeral]), format: 'der', type: 'spki'
  })
  const shared = nodeCrypto.diffieHellman({ privateKey: peer.privateKey, publicKey: ephemeralPublicKey })
  const prk = nodeCrypto.createHmac('sha256', Buffer.alloc(32)).update(shared).digest()
  const aesKey = nodeCrypto.createHmac('sha256', prk)
    .update(Buffer.concat([ephemeral, Buffer.from([1])])).digest().subarray(0, 16)
  const unseal = nodeCrypto.createDecipheriv('aes-128-gcm', aesKey, sealedKey.subarray(32, 44))
  unseal.setAuthTag(sealedKey.subarray(-16))
  const sealedPlaintext = Buffer.concat([
    unseal.update(sealedKey.subarray(44, -16)), unseal.final()
  ]).toString()
  const [dynamicKeyBase64, os, sk] = sealedPlaintext.split('|')
  expect([os, sk]).toEqual(['android', 'test-sk'])

  const middle = decryptEcb(Buffer.from(dynamicKeyBase64, 'base64'), Buffer.from(encrypted.C, 'base64url'))
  const random = middle.subarray(0, 16)
  const rotated = middle.subarray(16)
  const rotation = (random[0] & 15) % rotated.length
  const xored = rotation
    ? Buffer.concat([rotated.subarray(-rotation), rotated.subarray(0, -rotation)])
    : rotated
  const first = Buffer.from(xored.map((byte, index) => byte ^ random[index & 15]))
  const plaintext = JSON.parse(decryptEcb(staticKey, first).toString())
  expect(plaintext).toEqual({
    content: 'ids=%5B123%5D&level=master&encodeType=flac',
    queryString: 'e_r=true'
  })
})

test('XEAPI 会话请求在 R 中携带会话 ID', () => {
  const peer = nodeCrypto.generateKeyPairSync('x25519')
  const encrypted = xeapi('/api/song/enhance/player/url/v1', { ids: '[123]' }, {
    publicKeyState: {
      publicKey: Buffer.from(peer.publicKey.export({ format: 'der', type: 'spki' })).subarray(-32).toString('base64'),
      sk: 'test-sk', version: '1'
    },
    sessionId: 'session-id', sessionKey: 'session-key-1234', os: 'android'
  })
  expect(decryptEcb(staticKey, Buffer.from(encrypted.R, 'base64')).toString()).toBe('1|session-id')
})
