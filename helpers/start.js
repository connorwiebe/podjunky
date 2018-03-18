const oauth = require('./oauth')
const err = require('./err')
const db = require('./firestore')()

// redirect to twitter
const redirect = async (req, res) => {
  req.session.redirect = req.body.url ? req.body.url : '/'
  await oauth.twitterRedirect(req, res, false)
}

// login success
const callback = async (req, res, next) => {

  // validation
  if (!req.session.tokens) return next(err(400,`User without tokens attempted to access Twitter callback.`))

  const twitter = await oauth.twitterCallback(req, res, next)

  // user data
  const user = {
    twitter_id: twitter.id_str,
    username: twitter.screen_name,
    name: twitter.name,
    email: twitter.email,
    verified: twitter.verified,
    avatar: twitter.profile_image_url_https.replace('_normal',''),
    followers: twitter.followers_count,
    tweets: twitter.statuses_count
  }

  // create or update user
  await db.collection('users').doc(user.username).set(user)

  // set session properties
  const { username, name, avatar } = user
  req.session.user = { name, avatar }
  req.session.username = username

  // clean up and redirect
  const redirect = req.session.redirect
  delete req.session.redirect
  delete req.session.tokens
  req.session.save(() => res.redirect(redirect))

}

exports.redirect = redirect
exports.callback = callback
