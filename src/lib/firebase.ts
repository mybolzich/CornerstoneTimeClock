import { initializeApp } from 'firebase/app'
import { getAuth, browserLocalPersistence, setPersistence } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyDSIcTiBswVGF2oCSzUocAPEN3qi_muYls",
  authDomain: "serviroute-3ec0d.firebaseapp.com",
  projectId: "serviroute-3ec0d",
  storageBucket: "serviroute-3ec0d.firebasestorage.app",
  messagingSenderId: "203389465925",
  appId: "1:203389465925:web:31658625175d7a5ac53a2c"
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)

setPersistence(auth, browserLocalPersistence).catch(console.error)
