const { loginFetch, cookieHeader } = require('../util/login-http')
const { hash33 } = require('../util/qq-login')

async function getProfile(query) {
  const uin = String(query.uin || query.musicid || '').replace(/^o/, '')
  const qmKeyst = query.qm_keyst || query.musickey
  if (!uin || !qmKeyst) throw new Error('QQ 登录凭证不完整')
  const url = new URL('https://c6.y.qq.com/rsc/fcgi-bin/fcg_get_profile_homepage.fcg')
  url.search = new URLSearchParams({
    g_tk: String(hash33(qmKeyst, 5381)), format: 'json', inCharset: 'utf-8', outCharset: 'utf-8',
    notice: '0', cid: '205360838', needNewCode: '0', loginUin: uin, hostUin: '0', userid: uin, reqfrom: '1',
  })
  const response = await loginFetch(url, {
    headers: { Cookie: cookieHeader({ uin, qm_keyst: qmKeyst }) },
  }, 'QQ Cookie 验证')
  const result = await response.json().catch(() => null)
  if (typeof result?.code !== 'number') throw new Error('QQ Cookie 验证返回无效响应')
  return result
}

module.exports = async (query) => {
  const result = await getProfile(query)
  if (result?.code !== 0) throw new Error('QQ Cookie 无效或已过期')
  return { body: { nickname: String(result.data?.creator?.nick || '') } }
}

module.exports.checkExpired = async (query) => (await getProfile(query)).code !== 0
