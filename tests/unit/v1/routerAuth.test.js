const express = require('express')
const request = require('supertest')
const { createWowRouter } = require('aduoer-wow-sdk')
const { createWowContextResolver } = require('../../../dist/adapter')

function createApp() {
  const app = express()
  const registry = {
    sessions: [],
    byAccessKey: new Map([
      ['key-1', {
        platform: 'qq',
        name: 'QQ',
        cookie: 'uin=o123; qm_keyst=abc',
        apiAccessKey: 'key-1',
        stateless: false,
        favoriteTrackIds: new Set(),
        favoriteArtistIds: new Set(),
        favoriteAlbumIds: new Set(),
        favoriteArtistsLoaded: false,
        favoriteAlbumsLoaded: false
      }]
    ])
  }
  app.use(createWowRouter({ resolveContext: createWowContextResolver(registry) }))
  return app
}

describe('v1 router auth', () => {
  afterEach(() => { delete global.__musicPlatformFactory__ })

  test('/v1/status 缺少 Authorization 返回 401', async () => {
    const response = await request(createApp())
      .get('/v1/status')
      .expect(401)

    expect(response.body).toMatchObject({ code: 401, data: null })
    expect(response.body.message).toContain('Authorization token')
  })

  test('/v1/status 支持 Bearer token', async () => {
    const response = await request(createApp())
      .get('/v1/status')
      .set('Authorization', 'Bearer key-1')
      .expect(200)

    expect(response.body).toMatchObject({
      code: 200,
      data: {
        type: 'wow',
        version: require('aduoer-wow-sdk').sdkVersion
      }
    })
  })

  test('未预加载时，详情请求先初始化收藏 ID 并在后续请求复用', async () => {
    const callModule = jest.fn((route) => {
      if (route === 'artist/sublist') return Promise.resolve({ code: 200, data: [{ id: 'artist-mid', name: '艺人' }], more: false })
      if (route === 'artist/detail') return Promise.resolve({ code: 200, data: { artist: { id: 'artist-mid', name: '艺人' } } })
      throw new Error(`unexpected route: ${route}`)
    })
    global.__musicPlatformFactory__ = { getPlatform: () => ({ callModule }) }
    const app = createApp()

    const first = await request(app).get('/v1/artist/detail?id=artist-mid&trackLimit=0').set('Authorization', 'Bearer key-1').expect(200)
    const second = await request(app).get('/v1/artist/detail?id=artist-mid&trackLimit=0').set('Authorization', 'Bearer key-1').expect(200)

    expect(first.body.data.favorite).toBe(true)
    expect(second.body.data.favorite).toBe(true)
    expect(callModule.mock.calls.map(([route]) => route)).toEqual(['artist/sublist', 'artist/detail', 'artist/detail'])
  })
})
