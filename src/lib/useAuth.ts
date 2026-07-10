import { useState, useEffect, useRef } from 'react'
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth'
import { auth } from './firebase'
import { CREW, MANAGER_PIN, CrewMember } from './data'

export type AuthState =
  | { status: 'loading' }
  | { status: 'unauthenticated' }
  | { status: 'crew'; crew: CrewMember; firebaseUid: string }
  | { status: 'manager'; firebaseUid: string }

// PIN → crew/manager session stored in sessionStorage so a page
// refresh keeps you logged in for the session but a new tab starts fresh
const SESSION_KEY = 'tc_session'

function readSession(): AuthState | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    return JSON.parse(raw) as AuthState
  } catch {
    return null
  }
}

function writeSession(s: AuthState) {
  if (s.status === 'loading' || s.status === 'unauthenticated') {
    sessionStorage.removeItem(SESSION_KEY)
  } else {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(s))
  }
}

export function useAuth() {
  const [state, setState] = useState<AuthState>(() => {
    // Restore session immediately — avoids the loading flash on refresh
    const saved = readSession()
    return saved ?? { status: 'loading' }
  })
  const isSigningIn = useRef(false)
  const resolved = useRef(state.status !== 'loading')

  useEffect(() => {
    // If we already restored from session, nothing to do
    if (resolved.current) return

    // Hard timeout: if Firebase hasn't resolved in 4s, go to unauthenticated
    const timeout = setTimeout(() => {
      if (!resolved.current) {
        resolved.current = true
        setState({ status: 'unauthenticated' })
      }
    }, 4000)

    const unsub = onAuthStateChanged(auth, (user) => {
      // Skip the very first null that fires before persistence resolves
      // but only if we're not actively signing in
      if (resolved.current) return

      if (isSigningIn.current) return

      // Firebase resolved — user is null (no prior session) or has a uid
      clearTimeout(timeout)
      resolved.current = true

      if (!user) {
        setState({ status: 'unauthenticated' })
      }
      // If user exists but we have no PIN context → still unauthenticated
      // (anonymous uid alone doesn't tell us which crew member)
      else {
        setState({ status: 'unauthenticated' })
      }
    })

    return () => {
      clearTimeout(timeout)
      unsub()
    }
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

      const next: AuthState = isManager
        ? { status: 'manager', firebaseUid: uid! }
        : { status: 'crew', crew: crew!, firebaseUid: uid! }

      resolved.current = true
      setState(next)
      writeSession(next)
      return 'ok'
    } catch {
      return 'wrong_pin'
    } finally {
      isSigningIn.current = false
    }
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY)
    resolved.current = false
    setState({ status: 'unauthenticated' })
  }

  return { state, loginWithPin, logout }
}
