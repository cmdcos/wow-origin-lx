describe('QQ Cookie validation and credential refresh', () => {
  let http, login, refresh, checkExpired, androidLoginCgi, getAndroidLoginContext
  beforeEach(() => {
    jest.resetModules()
    androidLoginCgi = jest.fn()
    getAndroidLoginContext = jest.fn(() => ({ androidLoginCgi }))
    jest.doMock('../../../platforms/qqmusic/util/android-login', () => ({ getAndroidLoginContext, encodeIdentity: () => 'device-state' }))
    login = require('../../../platforms/qqmusic/module/login_cookie')
    refresh = require('../../../platforms/qqmusic/module/login_refresh')
    checkExpired = require('../../../platforms/qqmusic/module/login_check_expired')
    http = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Unmocked request'))
  })
  afterEach(() => {
    jest.restoreAllMocks()
    jest.dontMock('../../../platforms/qqmusic/util/android-login')
  })

  test('validates Cookie with the authenticated profile endpoint', async () => {
    http.mockResolvedValueOnce(Response.json({ code: 0, data: { creator: { nick: '音乐用户' } } }))
    expect(await login({ uin: '123', qm_keyst: 'secret' })).toMatchObject({ body: { nickname: '音乐用户' } })
    const [url, options] = http.mock.calls[0]
    expect(url.searchParams.get('hostUin')).toBe('0')
    expect(options.headers.Cookie).toContain('qm_keyst=secret')
  })
  test('rejects expired cookies', async () => {
    http.mockResolvedValueOnce(Response.json({ code: 1000 }))
    await expect(login({ uin: '123', qm_keyst: 'expired' })).rejects.toThrow('Cookie 无效或已过期')
  })
  test('checks QQ credential expiry without refreshing a valid cookie', async () => {
    http.mockResolvedValueOnce(Response.json({ code: 0 }))
    expect(await checkExpired({ uin: 'o123', qm_keyst: 'secret' })).toEqual({ expired: false })
    const [url] = http.mock.calls[0]
    expect(url.searchParams.get('loginUin')).toBe('123')
  })
  test('marks an invalid QQ credential as expired', async () => {
    http.mockResolvedValueOnce(Response.json({ code: 1000 }))
    expect(await checkExpired({ uin: '123', qm_keyst: 'expired' })).toEqual({ expired: true })
  })
  test('rejects an invalid expiry-check response', async () => {
    http.mockResolvedValueOnce(Response.json({ unexpected: true }))
    await expect(checkExpired({ uin: '123', qm_keyst: 'secret' })).rejects.toThrow('无效响应')
  })
  test('a valid Cookie need not include a profile nickname', async () => {
    http.mockResolvedValueOnce(Response.json({ code: 0 }))
    expect(await login({ uin: '123', qm_keyst: 'secret' })).toEqual({ body: { nickname: '' } })
  })
  test('refreshes a phone credential without QQ OAuth tokens', async () => {
    androidLoginCgi.mockResolvedValueOnce({ code: 0, data: { musicid: 123, musickey: 'new' } })
    expect(await refresh({ uin: '123', qm_keyst: 'old', loginType: '0', refresh_key: 'refresh' })).toMatchObject({ cookie: { uin: '123', qm_keyst: 'new', loginType: '0' } })
    expect(androidLoginCgi.mock.calls[0][2]).toMatchObject({ loginMode: 2, musickey: 'old', refresh_key: 'refresh' })
    expect(androidLoginCgi.mock.calls[0][4]).toEqual({ tmeLoginType: 0 })
  })
  test.each([
    [1, ['loginMode', 'musickey', 'openid', 'refresh_key', 'refresh_token', 'str_musicid', 'unionid']],
    [2, ['access_token', 'expired_in', 'loginMode', 'musicid', 'musickey', 'openid', 'refresh_key', 'refresh_token']],
    [0, ['access_token', 'expired_in', 'loginMode', 'musicid', 'musickey', 'openid', 'refresh_key', 'refresh_token', 'str_musicid', 'unionid']],
    [6, ['access_token', 'expired_in', 'loginMode', 'musicid', 'musickey', 'openid', 'refresh_key', 'refresh_token', 'str_musicid', 'unionid']],
  ])('uses the upstream refresh fields for loginType %s', async (loginType, expectedKeys) => {
    androidLoginCgi.mockResolvedValueOnce({ code: 0, data: { musicid: 123, musickey: 'new' } })
    await refresh({
      uin: '123', qm_keyst: 'old', loginType: String(loginType), openid: 'openid', unionid: 'unionid',
      access_token: 'access', refresh_token: 'refresh-token', refresh_key: 'refresh-key', expired_at: '12345',
    })
    const [module, method, param, credential, additions] = androidLoginCgi.mock.calls[0]
    expect(module).toBe('music.login.LoginServer')
    expect(method).toBe('Login')
    expect(Object.keys(param).sort()).toEqual(expectedKeys)
    expect(param.loginMode).toBe(2)
    expect(getAndroidLoginContext).toHaveBeenCalledWith('123', undefined, { requireExisting: true })
    expect(credential).toEqual({ musicid: '123', musickey: 'old', loginType })
    expect(additions).toEqual({ tmeLoginType: loginType })
  })
  test('a manually pasted cookie without refresh fields is validated, not discarded', async () => {
    http.mockResolvedValueOnce(Response.json({ code: 0, data: { creator: { nick: '用户' } } }))
    expect(await refresh({ uin: '123', qm_keyst: 'manual' })).toMatchObject({ refreshed: false })
    expect(http).toHaveBeenCalledTimes(1)
  })
})
