// load env variables
if (process.env.NODE_ENV === 'development') require('dotenv').config()

// modules
const express = require('express')
const app = express()
const bodyParser = require('body-parser')
const path = require('path')
const favicon = require('serve-favicon')
const fs = require('fs')
const status = require('statuses')
const client = require('./helpers/client')
const start = require('./helpers/start')
const locals = require('./helpers/locals')
const logout = require('./helpers/logout')
const err = require('./helpers/err')
const rp = require('request-promise')
const qs = require('querystring')
const Promise = require('bluebird')
const parseXML = Promise.promisify(require('xml2js').parseString)
const moment = require('moment')
const url = require('url')
const compression = require('compression')
const db = require('./helpers/firestore')()

// misc config
app.listen(process.env.PORT || 4343)
const dev = process.env.NODE_ENV === 'development' ? true : false
const prod = process.env.NODE_ENV === 'production' ? true : false
if (prod) app.use(compression({threshold:0}))
if (prod) app.set('trust proxy', 1)
app.locals.min = prod ? '.min' : ''
app.set('view engine', 'pug')
app.set('views', path.join(__dirname, 'views'))
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: false }))

// static resources
app.use(express.static(path.join(__dirname, 'public'), { maxAge: prod ? 2628002880 : 0 }))
app.use(favicon(path.join(__dirname, 'public/images/syringe.png')))

// sessions
const expressSession = require('express-session')
const RedisStore = require('connect-redis')(expressSession)
const redisOptions = () => {
  return {
    client,
    url: prod ? process.env.REDIS_URL : null
  }
}
const store = new RedisStore(redisOptions())
app.use(expressSession({
  secret: process.env.SESSION_SECRET,
  resave: false,
  secure: prod ? true : false,
  saveUninitialized: true,
  cookie: { maxAge: 2628002880 }, // 1 month
  store
}))

// middleware
app.post('/logout', logout)
app.post('/start', start.redirect)
app.get('/callback', start.callback)
app.get('/*', locals)

// routes
app.get('/', async (req, res, next) => {
  const username = req.session.username
  const { latest, all, explore } = req.query
  if (username && !explore) {
    if (all) {
      const subscriptions = await db.collection('subscriptions').where('username', '==', username).get()
      const podcasts = []
      subscriptions.forEach(document => podcasts.push(document.data()))
      res.locals.all = true
      res.locals.podcasts = podcasts
    } else {
      const subscriptions = await db.collection('subscriptions').where('username', '==', username).get()
      let episodes = []
      subscriptions.forEach(document => episodes.push(document.data()))
      episodes = await Promise.map(episodes, async sub => {
        let podcast = await rp({ uri: `https://itunes.apple.com/lookup?id=${sub.collectionId}&limit=1`, json: true });podcast = podcast.results[0]
        const feed = await rp({ uri: podcast.feedUrl, json: true })
        const json = await parseXML(feed, { trim: true })
        const episode = json.rss.channel[0].item[0]
        const author = sub.trackName
        const title = episode.title[0]
        let duration = episode['itunes:duration'][0]
        if (!duration.includes(':')) duration = moment().startOf('day').seconds(duration).format('H:mm:ss')
        const link = episode.enclosure[0]['$'].url ? episode.enclosure[0]['$'].url : ''
        const date = moment(episode.pubDate[0]).valueOf()
        return { author, title, duration, link, date }
      }, {concurrency: 3})
      if (episodes.length > 1) episodes.sort((a, b) => a.date - b.date)
      episodes = episodes.map(episode => {
        episode.date = moment(episode.date).utc().format('MMM DD, YYYY')
        return episode
      })
      res.locals.latest = true
      res.locals.episodes = episodes
    }
  } else {
    const podcasts = await rp({ uri: `https://rss.itunes.apple.com/api/v1/us/podcasts/top-podcasts/all/24/explicit.json`, json: true })
    res.locals.rss = true
    res.locals.podcasts = podcasts.feed.results
  }
  res.render('app')
})

app.get(['/search', '/lookup'], async (req, res, next) => {
  const username = req.session.username
  const { id } = req.query
  res.locals.podcast = false
  let podcast
  if (!id) {
    podcast = await rp({ uri: `https://itunes.apple.com/search?${qs.stringify(req.query)}&media=podcast&limit=1`, json: true });podcast = podcast.results[0]
  } else {
    podcast = await rp({ uri: `https://itunes.apple.com/lookup?id=${id}&limit=1`, json: true });podcast = podcast.results[0]
  }
  if (podcast) {
    res.locals.podcast = podcast
    const feed = await rp({ uri: podcast.feedUrl, json: true })
    const json = await parseXML(feed, { trim: true })
    var episodes = json.rss.channel[0].item
    episodes = episodes.map(episode => {
      const title = episode.title[0]
      let duration = episode['itunes:duration'][0]
      if (!duration.includes(':')) duration = moment().startOf('day').seconds(duration).format('H:mm:ss')
      const link = episode.enclosure[0]['$'].url ? episode.enclosure[0]['$'].url : ''
      const date = moment(episode.pubDate[0]).utc().format('MMM DD, YYYY')
      return { title, duration, link, date }
    })
    res.locals.episodes = episodes
    if (username) {
      const subscriptions = await db.collection('subscriptions').where('username', '==', username).where('collectionId', '==', podcast.collectionId).get()
      subscriptions.forEach(doc => {
        if (doc.data()) res.locals.subbed = true
      })
    }
  } else {
    return next(err(404, 'Podcast not found.'))
  }
  res.render('app')
})

app.post('/subscribe', async (req, res, next) => {
  const username = req.session.username
  const { id, unsub } = req.body
  const subscriptions = await db.collection('subscriptions')
  let result = await rp({ uri: `https://itunes.apple.com/lookup?id=${id}&limit=1`, json: true });result = result.results[0]
  if (!unsub) {
    const podcast = { collectionId: result.collectionId, artworkUrl100: result.artworkUrl100, trackName: result.trackName, artistName: result.artistName, username }
    await subscriptions.add(podcast)
    return res.end()
  }
  const podcast = await subscriptions.where('username', '==', username).where('collectionId', '==', result.collectionId).get()
  podcast.forEach(doc => {
    doc.ref.delete()
  })
  res.end()
})

// error handling
app.use((req,res,next) => next({code: 404}))
app.use(async (err, req, res, next) => {

  if (dev) console.error(err)
  if (err.statusCode) err.code = err.statusCode
  if (!err.code || typeof err.code !== 'number') err.code = 500
  res.status(err.code)

  res.render('err', {
    title: `${err.code} | podjunky`,
    msg: err.code,
    submsg: status[err.code]
  })
})

// TODO: paginate top podcasts
// TODO: setex cache api results w/ redis
// TODO: better error handling
