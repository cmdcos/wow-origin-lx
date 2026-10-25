// 关注或取消关注歌手

function hash33(value) {
  let hash = 5381
  for (const char of value) hash = (hash * 33 + char.charCodeAt(0)) & 0x7fffffff
  return hash
}

module.exports = (query, request) => {
  if(!query.uin || !query.qm_keyst){
    throw new Error("need uin and qm_keyst")
  } else if(!query.id){
    throw new Error("need id")
  } else if(query.t === undefined || query.t === null){
    throw new Error("need t")
  }

  const data = {
    "bussinesstype": "",
    "source": 137,
    "opertype": query.t == 1 ? 0 : 1,
    "bussinessid": "",
    "userinfo": {
      "usertype": 1,
      "userid": query.id
    }
  }

  return request("music.concern.ConcernSystem", "cgi_concern_user_v2", data, {
    uin: query.uin,
    qm_keyst: query.qm_keyst,
    transport: 'plain',
    keepEnvelope: true,
    webCgiKey: 'cgi_concern_user_v2',
    comm: {
      g_tk: hash33(query.qm_keyst),
      ct: 23,
      cv: 0,
      platform: 'h5',
      mesh_devops: 'DevopsBase'
    }
  }).then(({ body }) => {
    const requestCode = body?.req_0?.code
    const dataCode = body?.req_0?.data?.retCode ?? body?.req_0?.data?.RetCode ?? body?.req_0?.data?.code
    const success = Number(body?.code) === 0 && Number(requestCode) === 0 &&
      (dataCode === undefined || Number(dataCode) === 0)
    const failureCode = Number(
      Number(requestCode) !== 0 ? requestCode : dataCode ?? body?.code ?? -1
    )
    return { retCode: success ? 0 : failureCode || -1 }
  })
}
