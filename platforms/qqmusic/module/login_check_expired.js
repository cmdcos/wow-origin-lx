const { checkExpired } = require('./login_cookie')

module.exports = async (query) => ({ expired: await checkExpired(query) })
