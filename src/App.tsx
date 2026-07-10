import { useState } from 'react'
import { useAuth } from './lib/useAuth'
import { PinPad } from './components/PinPad'
import { CrewDashboard } from './components/CrewDashboard'
import { ManagerDashboard } from './components/ManagerDashboard'
import { Dispatcher } from './components/Dispatcher'
import { Map } from 'lucide-react'

export default function App() {
  const { state, loginWithPin, logout } = useAuth()
  const [managerView, setManagerView] = useState<'dashboard' | 'dispatch'>('dashboard')

  if (state.status === 'unauthenticated') {
    return <PinPad title="Cornerstone LLC" subtitle="Time Clock — Enter Your PIN" onSubmit={loginWithPin} />
  }

  if (state.status === 'crew') {
    return <CrewDashboard crew={state.crew} onLogout={logout} />
  }

  if (state.status === 'manager') {
    return (
      <div className="min-h-screen flex flex-col">
        {/* Manager tab bar */}
        <div className="fixed bottom-0 inset-x-0 z-30 bg-white border-t border-gray-200 flex pb-safe" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 8px)' }}>
          <button
            onClick={() => setManagerView('dashboard')}
            className={`flex-1 flex flex-col items-center justify-center py-2 text-xs font-semibold gap-1 touch-manipulation ${managerView === 'dashboard' ? 'text-blue-600' : 'text-gray-400'}`}>
            <span className="text-lg">📊</span>
            Dashboard
          </button>
          <button
            onClick={() => setManagerView('dispatch')}
            className={`flex-1 flex flex-col items-center justify-center py-2 text-xs font-semibold gap-1 touch-manipulation ${managerView === 'dispatch' ? 'text-blue-600' : 'text-gray-400'}`}>
            <Map size={20} />
            Dispatch
          </button>
        </div>

        <div className="flex-1 pb-16">
          {managerView === 'dashboard'
            ? <ManagerDashboard onLogout={logout} />
            : <Dispatcher onLogout={logout} />
          }
        </div>
      </div>
    )
  }

  return null
}
