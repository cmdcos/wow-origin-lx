describe('shared QQ phone login', () => {
  let phone, androidLoginCgi, ensureSession, bindAndroidLoginContext
  const envelope = (code, data = {}) => ({ code, data })

  beforeEach(() => {
    jest.resetModules()
    androidLoginCgi = jest.fn()
    ensureSession = jest.fn().mockResolvedValue({ uid: 'device-uid', sid: 'device-sid' })
    bindAndroidLoginContext = jest.fn()
    jest.doMock('../../../platforms/qqmusic/util/android-login', () => ({
      createAndroidLoginContextFromIdentity: () => ({ androidLoginCgi, ensureSession }), bindAndroidLoginContext
    }))
    phone = require('../../../platforms/qqmusic/util/phone-login')
  })
  afterEach(() => jest.dontMock('../../../platforms/qqmusic/util/android-login'))

  async function send(code = 0, data) {
    androidLoginCgi.mockResolvedValueOnce(envelope(code, data))
    return phone.sendPhoneCode('13800000000')
  }

  test('reuses the device session while sending and verifying a phone code', async () => {
    const sent = await send()
    expect(sent).toMatchObject({ status: 'sent', retryAfter: 60 })
    androidLoginCgi.mockResolvedValueOnce(envelope(20271))
    await expect(phone.phoneLogin(sent.token, '123456')).rejects.toThrow('验证码错误')
    androidLoginCgi.mockResolvedValueOnce(envelope(0, { musicid: 123, musickey: 'phone-key' }))
    expect(await phone.phoneLogin(sent.token, '654321')).toMatchObject({ uin: '123', qm_keyst: 'phone-key', loginType: '0' })
    expect(ensureSession).toHaveBeenCalledTimes(1)
    expect(bindAndroidLoginContext).toHaveBeenCalledWith('123', expect.objectContaining({ androidLoginCgi }))
    expect(androidLoginCgi.mock.calls[0]).toEqual([
      'music.login.LoginServer', 'SendPhoneAuthCode',
      { tmeAppid: 'qqmusic', areaCode: '86', phoneNo: '13800000000' },
      {}, { tmeLoginMethod: 3 }
    ])
    expect(androidLoginCgi.mock.calls[2]).toEqual([
      'music.login.LoginServer', 'Login',
      { phoneNo: '13800000000', code: '654321', loginMode: 1 },
      {}, { tmeLoginMethod: 3, tmeLoginType: 0 }
    ])
    await expect(phone.phoneLogin(sent.token, '654321')).rejects.toThrow('会话已失效')
  })

  test('prevents duplicate sends during cooldown and retains token', async () => {
    const sent = await send()
    expect(await phone.sendPhoneCode('13800000000', '86', sent.token)).toMatchObject({ status: 'frequency', token: sent.token })
    expect(androidLoginCgi).toHaveBeenCalledTimes(1)
  })

  test('CAPTCHA requires verification and resend with the same session', async () => {
    const sent = await send(20276, { securityURL: 'https://example.com/verify' })
    expect(sent).toMatchObject({ status: 'captcha', retryAfter: 0 })
    await expect(phone.phoneLogin(sent.token, '123456')).rejects.toThrow('会话已失效')
    androidLoginCgi.mockResolvedValueOnce(envelope(0))
    const resent = await phone.sendPhoneCode('13800000000', '86', sent.token)
    expect(resent).toMatchObject({ token: sent.token, status: 'sent' })
    expect(androidLoginCgi).toHaveBeenCalledTimes(2)
    expect(ensureSession).toHaveBeenCalledTimes(1)
  })

  test('an expired resend token must not silently create a different device session', async () => {
    await expect(phone.sendPhoneCode('13800000000', '86', 'expired-token')).rejects.toThrow('会话已失效')
    expect(androidLoginCgi).not.toHaveBeenCalled()
  })

  test('rejects changed phone and expired session without login request', async () => {
    const sent = await send()
    await expect(phone.sendPhoneCode('13900000000', '86', sent.token)).rejects.toThrow('手机号已改变')
    const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 601000)
    try {
      await expect(phone.phoneLogin(sent.token, '123456')).rejects.toThrow('会话已失效')
      expect(androidLoginCgi).toHaveBeenCalledTimes(1)
    } finally {
      clock.mockRestore()
    }
  })

  test.each(['', '+1234', 'abc', '123'])('rejects malformed phone %s', async number => {
    await expect(phone.sendPhoneCode(number)).rejects.toThrow('有效的手机号')
    expect(androidLoginCgi).not.toHaveBeenCalled()
  })
})
