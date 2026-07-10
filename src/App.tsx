import { useAuth } from './lib/useAuth'
import { PinPad } from './components/PinPad'
import { CrewDashboard } from './components/CrewDashboard'
import { ManagerDashboard } from './components/ManagerDashboard'

export default function App() {
  const { state, loginWithPin, logout } = useAuth()

  if (state.status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: 'linear-gradient(135deg, #0d1f3a 0%, #081428 100%)' }}>
        <div className="text-white text-lg opacity-60">Loading…</div>
      </div>
    )
  }

  if (state.status === 'unauthenticated') {
    return (
      <PinPad
        title="Cornerstone LLC"
        subtitle="Time Clock — Enter Your PIN"
        onSubmit={loginWithPin}
      />
    )
  }

  if (state.status === 'manager') {
    return <ManagerDashboard onLogout={logout} />
  }

  if (state.status === 'crew') {
    return <CrewDashboard crew={state.crew} onLogout={logout} />
  }

  return null
}
