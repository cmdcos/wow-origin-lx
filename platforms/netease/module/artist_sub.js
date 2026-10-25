// 收藏与取消收藏歌手

module.exports = (query, request) => {
  if (!query.MUSIC_U) {
    throw new Error('need MUSIC_U')
  }
  query.t = query.t == 1 ? 'sub' : 'unsub'
  const data = {
    artistId: query.id,
    artistIds: '[' + query.id + ']',
  }
  return request(`/api/artist/${query.t}`, data, {
    crypto: "weapi",
    useCheckToken: false,
    MUSIC_U: query.MUSIC_U
  }).then(res => {
    return res.body
  }).catch(error => {
    if (Number(error?.status) === 501 || Number(error?.body?.code) === 501) {
      return { data: { code: 501 } }
    }
    throw error
  })
}
