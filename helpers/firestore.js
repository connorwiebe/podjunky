
const admin = require('firebase-admin')
const firebase = admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_AUTH)),
  databaseURL: 'https://podjunky1.firebaseio.com'
})
module.exports = () => firebase.firestore()
