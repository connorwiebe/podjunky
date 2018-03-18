module.exports = (req, res) => {
  const redirect = req.body.url ? req.body.url : '/'
  if (req.session.username) {
    return req.session.destroy(() => res.redirect(redirect))
  }
  res.redirect(redirect)
}
