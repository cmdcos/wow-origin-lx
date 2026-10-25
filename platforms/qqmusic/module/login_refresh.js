const { credentialCookies, loginError } = require('../util/login-http')
const { getAndroidLoginContext, encodeIdentity } = require('../util/android-login')
const validateCookie = require('./login_cookie')

module.exports = async (query) => {
  const musicid = String(query.musicid || query.uin || '').replace(/^o/, '')
  const musickey = query.musickey || query.qm_keyst
  if (!/^[1-9]\d*$/.test(musicid) || !musickey) throw new Error('QQ 登录凭证不完整')
  // Browser cookies usually lack refresh credentials. Validate without attempting OAuth refresh.
  if (!query.refresh_key && !query.refresh_token) {
    await validateCookie({ uin: musicid, qm_keyst: musickey })
    return { refreshed: false }
  }
  const loginType = Number(query.loginType ?? 2)
  if (![0, 1, 2, 6].includes(loginType)) throw new Error('不支持的 QQ 登录凭证类型')
  const shared = {
    openid: query.openid || '', refresh_token: query.refresh_token || '',
    refresh_key: query.refresh_key || '', musickey, loginMode: 2,
  }
  const param = loginType === 1
    ? { ...shared, str_musicid: musicid, unionid: query.unionid || '' }
    : loginType === 2
      ? { ...shared, access_token: query.access_token || '', expired_in: Number(query.expired_at) || 0, musicid: Number(musicid) }
      : {
          ...shared, access_token: query.access_token || '', expired_in: Number(query.expired_at) || 0,
          musicid: Number(musicid), str_musicid: musicid, unionid: query.unionid || '',
        }
  const android = getAndroidLoginContext(musicid, query.qq_android_identity, { requireExisting: true })
  const result = await android.androidLoginCgi('music.login.LoginServer', 'Login', param, {
    musicid, musickey, loginType,
  }, { tmeLoginType: loginType })
  if (result.code !== 0) {
    // Some valid sessions cannot refresh yet. Check the old credential before retaining it.
    if (result.code !== 20279) throw loginError(result.code)
    await validateCookie({ uin: musicid, qm_keyst: musickey })
    return { refreshed: false }
  }
  return { cookie: credentialCookies({ loginType, ...result.data }), androidIdentity: encodeIdentity(android), refreshed: true }
}
