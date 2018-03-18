const $ = require('jquery')
const shave = require('shave')
shave('.podcast-title,.podcast-artist', 32)

// search
const searchForm = $('.search-form')
const searchInput = $('.input')
let submitted = false
searchForm.on('submit', e => {
  if (searchInput.val() === '') {
    e.preventDefault()
  } else {
    if (!submitted) {
      submitted = true
      $(e.target).submit()
    }
  }
})

// subscribe
const subscribe = $('.subscribe')
if (subscribe.hasClass('subscribed')) subscribe.text('subscribed')
let canFetch = true
subscribe.on('click', async e => {
  const target = $(e.target)
  if (canFetch) {
    canFetch = false
    const id = target.parent('.podcast').attr('data-id')
    let unsub
    if (target.hasClass('subscribed')) {
      unsub = true
      target.removeClass('subscribed').text('subscribe')
    } else {
      unsub = false
      target.addClass('subscribed').text('subscribed')
    }
    try {
      const response = await window.fetch('/subscribe', {
        headers: new Headers({ 'content-type': 'application/json' }),
        body: JSON.stringify({ id, unsub }),
        method: 'post',
        credentials: 'include'
      })
      if (response.ok) canFetch = true
    } catch (err) {
      canFetch = true
    }
  }
})
