import { useAuth } from './lib/useAuth'
import { PinPad } from './components/PinPad'
import { CrewDashboard } from './components/CrewDashboard'
import { ManagerDashboard } from './components/ManagerDashboard'

export default function App() {
  const { state, loginWithPin, logout } = useAuth()

  if (state.status === 'unauthenticated') {
    return (
      <PinPad
        title="Cornerstone LLC"
        subtitle="Time Clock — Enter Your PIN"
        onSubmit={loginWithPin}
      />
    )
  }

  if (state.status === 'crew') {
    return <CrewDashboard crew={state.crew} onLogout={logout} />
  }

  if (state.status === 'manager') {
    return <ManagerDashboard onLogout={logout} />
  }

  return null
}
