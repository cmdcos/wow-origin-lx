//关注歌手列表

module.exports = (query, request) => {

  const data = {
    "From": Number(query.offset) || 0,
    "Size": Number(query.limit) || 100
  }

  if ( !query.uin || !query.qm_keyst) {
    throw new Error('Auth is required')
  }

  return request("music.concern.RelationList", "GetFollowSingerList", data, {
    uin: query.uin,
    qm_keyst: query.qm_keyst
  }).then(res => {
    return formatFollowSingerList(res.body, data.Size)
  })
}

function formatFollowSingerList(data, limit) {
  const list = data.List || []
  return {
    data: list.map((ar) => ({
      id: ar.MID,
      name: ar.Name || ar.title,
      picUrl: ar.MID ? `https://y.gtimg.cn/music/photo_new/T001R300x300M000${ar.MID}.jpg` : '',
      platform: "qqmusic"
    })),
    more: list.length === limit
  }
}
