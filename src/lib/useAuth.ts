import { useState, useEffect, useRef } from 'react'
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth'
import { auth } from './firebase'
import { CREW, MANAGER_PIN, CrewMember } from './data'

export type AuthState =
  | { status: 'loading' }
  | { status: 'unauthenticated' }
  | { status: 'crew'; crew: CrewMember; firebaseUid: string }
  | { status: 'manager'; firebaseUid: string }

export function useAuth() {
  const [state, setState] = useState<AuthState>({ status: 'loading' })
  const initialCheckDone = useRef(false)
  const isSigningIn = useRef(false)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!initialCheckDone.current) {
        initialCheckDone.current = true
        if (!user && !isSigningIn.current) {
          setState({ status: 'unauthenticated' })
        }
      }
    })
    return unsub
  }, [])

  async function loginWithPin(pin: string): Promise<'ok' | 'wrong_pin'> {
    const crew = CREW.find(c => c.pin === pin)
    const isManager = pin === MANAGER_PIN

    if (!crew && !isManager) return 'wrong_pin'

    isSigningIn.current = true
    try {
      let uid = auth.currentUser?.uid
      if (!uid) {
        const cred = await signInAnonymously(auth)
        uid = cred.user.uid
      }
      if (isManager) {
        setState({ status: 'manager', firebaseUid: uid! })
      } else {
        setState({ status: 'crew', crew: crew!, firebaseUid: uid! })
      }
      return 'ok'
    } finally {
      isSigningIn.current = false
    }
  }

  function logout() {
    setState({ status: 'unauthenticated' })
  }

  return { state, loginWithPin, logout }
}
