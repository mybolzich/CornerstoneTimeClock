import { initializeApp } from 'firebase/app'
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore'

const firebaseConfig = {
  apiKey:            "AIzaSyDSIcTiBswVGF2oCSzUocAPEN3qi_muYls",
  authDomain:        "serviroute-3ec0d.firebaseapp.com",
  projectId:         "serviroute-3ec0d",
  storageBucket:     "serviroute-3ec0d.firebasestorage.app",
  messagingSenderId: "203389465925",
  appId:             "1:203389465925:web:31658625175d7a5ac53a2c"
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)

// Enable offline persistence so writes queue when there's no signal
enableIndexedDbPersistence(db).catch(err => {
  if (err.code === 'failed-precondition') {
    // Multiple tabs open — persistence only works in one tab at a time
    console.warn('Firestore offline persistence: multiple tabs open')
  } else if (err.code === 'unimplemented') {
    console.warn('Firestore offline persistence: not supported in this browser')
  }
})
