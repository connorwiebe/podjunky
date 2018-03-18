const Promise = require('bluebird')
const redis = Promise.promisifyAll(require('redis'))
const options = process.env.NODE_ENV === 'development' ? {db:2} : { url: process.env.REDIS_URL }
module.exports = redis.createClient(options)
