// set default locals for every get request
module.exports = (req, res, next) => {
  res.locals.username = req.session.username
  res.locals.user = req.session.user
  res.locals.url = req.url
  next()
}
