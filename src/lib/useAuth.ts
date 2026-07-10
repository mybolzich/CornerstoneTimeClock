import { useState } from 'react'
import { CREW, MANAGER_PIN, CrewMember } from './data'

export type AuthState =
  | { status: 'unauthenticated' }
  | { status: 'crew'; crew: CrewMember }
  | { status: 'manager' }

const SESSION_KEY = 'tc_session'

function readSession(): AuthState {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return { status: 'unauthenticated' }
    return JSON.parse(raw) as AuthState
  } catch {
    return { status: 'unauthenticated' }
  }
}

export function useAuth() {
  const [state, setState] = useState<AuthState>(readSession)

  async function loginWithPin(pin: string): Promise<'ok' | 'wrong_pin'> {
    const crew = CREW.find(c => c.pin === pin)
    const isManager = pin === MANAGER_PIN

    if (!crew && !isManager) return 'wrong_pin'

    const next: AuthState = isManager
      ? { status: 'manager' }
      : { status: 'crew', crew: crew! }

    sessionStorage.setItem(SESSION_KEY, JSON.stringify(next))
    setState(next)
    return 'ok'
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY)
    setState({ status: 'unauthenticated' })
  }

  return { state, loginWithPin, logout }
}
