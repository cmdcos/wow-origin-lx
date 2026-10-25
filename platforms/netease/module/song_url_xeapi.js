// 网易云 Android XEAPI 歌曲链接。音质参数与上游 song_url_v1 保持一致。
module.exports = async (query, request) => {
  const level = query.level === 'master' ? 'jymaster' : (query.level || 'exhigh')
  const data = {
    ids: `[${String(query.id)}]`,
    level,
    encodeType: 'flac'
  }
  if (level === 'sky') data.immerseType = query.immerseType || 'c51'

  const response = await request('/api/song/enhance/player/url/v1', data, {
    crypto: 'xeapi',
    MUSIC_U: query.MUSIC_U || '',
  })
  const body = response.body
  if (Array.isArray(body?.data)) {
    body.data = body.data.map(item => ({
      ...item,
      level: item.level === 'jymaster' ? 'master' : item.level,
      url: typeof item.url === 'string' ? item.url.replace(/^http:\/\//, 'https://') : item.url
    }))
  }
  return body
}
