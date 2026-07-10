import { useState, useEffect } from 'react'
import { LogOut, MapPin, Clock, Coffee, Zap, AlertTriangle } from 'lucide-react'
import { CrewMember, ALL_PROPERTIES, getScheduledProperty, formatTime, formatDuration, PROPERTY_COORDS } from '../lib/data'
import { useCrewShifts } from '../lib/useShifts'

interface Props {
  crew: CrewMember
  onLogout: () => void
}

export function CrewDashboard({ crew, onLogout }: Props) {
  const { todayShifts, activeShift, activeBreak, loading, clockIn, clockOut, startBreak, endBreak, totalMinutes } = useCrewShifts(crew.pin)
  const [elapsed, setElapsed] = useState(0)
  const [breakElapsed, setBreakElapsed] = useState(0)
  const [selectedProperty, setSelectedProperty] = useState<string>(getScheduledProperty(crew.name) ?? ALL_PROPERTIES[0])
  const [note, setNote] = useState('')
  const [showClockOut, setShowClockOut] = useState(false)
  const [showBreakMenu, setShowBreakMenu] = useState(false)
  const [gpsWarning, setGpsWarning] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Live timer
  useEffect(() => {
    if (!activeShift || activeBreak) return
    const iv = setInterval(() => {
      setElapsed(Math.floor((Date.now() - activeShift.clockIn.getTime()) / 1000) - activeShift.breakMinutes * 60)
    }, 1000)
    return () => clearInterval(iv)
  }, [activeShift, activeBreak])

  useEffect(() => {
    if (!activeBreak) return
    const iv = setInterval(() => {
      setBreakElapsed(Math.floor((Date.now() - activeBreak.breakStart.getTime()) / 1000))
    }, 1000)
    return () => clearInterval(iv)
  }, [activeBreak])

  function fmtSecs(s: number) {
    const h = Math.floor(s / 3600).toString().padStart(2, '0')
    const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0')
    const sec = (s % 60).toString().padStart(2, '0')
    return `${h}:${m}:${sec}`
  }

  async function handleClockIn() {
    if (busy) return
    setBusy(true)
    setGpsWarning(null)
    await clockIn(crew.name, crew.lm, selectedProperty)
    // GPS distance warning shown after snapshot updates activeShift
    setBusy(false)
  }

  useEffect(() => {
    if (!activeShift) return
    const dist = activeShift.distanceFromProperty
    const coords = PROPERTY_COORDS[activeShift.property]
    if (dist !== null && coords) {
      if (dist > 500 && dist <= 2000) setGpsWarning(`⚠️ You appear to be ${dist}m from ${activeShift.property}`)
      else if (dist > 2000) setGpsWarning(`🔴 You are ${dist}m from ${activeShift.property} — contact manager`)
    }
  }, [activeShift?.id])

  async function handleClockOut() {
    if (busy) return
    setBusy(true)
    await clockOut(note)
    setNote('')
    setShowClockOut(false)
    setBusy(false)
  }

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const scheduledProp = getScheduledProperty(crew.name)

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#f5f5f0' }}>
      <div className="text-gray-500">Loading...</div>
    </div>
  )

  return (
    <div className="min-h-screen" style={{ background: '#f5f5f0' }}>
      {/* Header */}
      <div className="text-white px-5 pt-12 pb-6" style={{ backgroundColor: crew.color }}>
        <div className="flex justify-between items-start">
          <div>
            <div className="text-white/70 text-sm font-medium">{crew.lm}</div>
            <div className="text-3xl font-bold">{crew.name}</div>
            <div className="text-white/80 text-sm mt-1">{today}</div>
          </div>
          <button onClick={onLogout} className="p-2 rounded-lg bg-white/20 active:bg-white/30">
            <LogOut size={20} color="white" />
          </button>
        </div>

        {scheduledProp && (
          <div className="mt-4 bg-white/20 rounded-xl px-4 py-2 flex items-center gap-2">
            <MapPin size={16} className="text-white/80" />
            <span className="text-white text-sm font-medium">Today: {scheduledProp}</span>
          </div>
        )}
      </div>

      <div className="max-w-md mx-auto px-4 pb-10 space-y-4 mt-4">

        {/* GPS Warning */}
        {gpsWarning && (
          <div className="bg-yellow-50 border border-yellow-300 rounded-xl px-4 py-3 flex gap-2 items-start">
            <AlertTriangle size={18} className="text-yellow-600 mt-0.5 shrink-0" />
            <p className="text-yellow-800 text-sm">{gpsWarning}</p>
          </div>
        )}

        {/* CLOCKED IN STATE */}
        {activeShift && !showClockOut && (
          <div className="rounded-2xl p-5 text-white" style={{ backgroundColor: activeBreak ? '#d97706' : '#16a34a' }}>
            <div className="text-sm font-medium opacity-80 mb-1">
              {activeBreak ? `On Break (${activeBreak.breakType})` : 'Currently Clocked In'}
            </div>
            <div className="text-5xl font-mono font-bold tracking-wider my-3">
              {activeBreak ? fmtSecs(breakElapsed) : fmtSecs(elapsed)}
            </div>
            <div className="text-sm opacity-80 flex items-center gap-1">
              <Clock size={14} />
              Clocked in {formatTime(activeShift.clockIn)} · {activeShift.property}
            </div>
            {activeShift.breakMinutes > 0 && (
              <div className="text-sm opacity-70 mt-1">Break taken: {activeShift.breakMinutes}m</div>
            )}

            <div className="mt-4 space-y-2">
              {activeBreak ? (
                <button onClick={endBreak} disabled={busy}
                  className="w-full py-4 rounded-xl bg-white font-bold text-amber-700 text-lg active:scale-95 transition-transform disabled:opacity-50">
                  End Break
                </button>
              ) : (
                <>
                  <button onClick={() => setShowBreakMenu(!showBreakMenu)}
                    className="w-full py-3 rounded-xl bg-white/20 font-semibold text-white flex items-center justify-center gap-2 active:scale-95 transition-transform">
                    <Coffee size={18} /> Start Break
                  </button>
                  {showBreakMenu && (
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => { startBreak('lunch'); setShowBreakMenu(false) }}
                        className="py-3 rounded-xl bg-white/20 text-white font-semibold text-sm active:scale-95">
                        🍽 Lunch (30m)
                      </button>
                      <button onClick={() => { startBreak('rest'); setShowBreakMenu(false) }}
                        className="py-3 rounded-xl bg-white/20 text-white font-semibold text-sm active:scale-95">
                        ☕ Rest (15m)
                      </button>
                    </div>
                  )}
                  <button onClick={() => setShowClockOut(true)} disabled={!!activeBreak || busy}
                    className="w-full py-4 rounded-xl bg-red-600 font-bold text-white text-lg active:scale-95 transition-transform disabled:opacity-50">
                    CLOCK OUT
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* CLOCK OUT CONFIRMATION */}
        {activeShift && showClockOut && (
          <div className="bg-white rounded-2xl p-5 shadow-sm space-y-4">
            <h2 className="font-bold text-gray-800 text-lg">Clock Out</h2>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Optional note (gate codes, issues, etc.)"
              rows={3}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-300"
            />
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setShowClockOut(false)}
                className="py-4 rounded-xl border border-gray-200 font-semibold text-gray-600 active:scale-95">
                Cancel
              </button>
              <button onClick={handleClockOut} disabled={busy}
                className="py-4 rounded-xl bg-red-600 font-bold text-white active:scale-95 disabled:opacity-50">
                {busy ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </div>
        )}

        {/* NOT CLOCKED IN */}
        {!activeShift && (
          <div className="bg-white rounded-2xl p-5 shadow-sm space-y-4">
            <h2 className="font-semibold text-gray-700">Select Property</h2>
            <select value={selectedProperty} onChange={e => setSelectedProperty(e.target.value)}
              className="w-full px-3 py-3 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-300">
              {scheduledProp && (
                <option value={scheduledProp}>★ {scheduledProp} (Today's Route)</option>
              )}
              {ALL_PROPERTIES.filter(p => p !== scheduledProp).map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <button onClick={handleClockIn} disabled={busy}
              className="w-full py-5 rounded-2xl bg-green-600 font-bold text-white text-xl active:scale-95 transition-transform disabled:opacity-50 pulse-green">
              {busy ? 'Clocking In…' : '✓ CLOCK IN'}
            </button>
          </div>
        )}

        {/* Today's Hours Summary */}
        <div className="bg-white rounded-2xl px-5 py-4 shadow-sm flex justify-between items-center">
          <div className="flex items-center gap-2 text-gray-600">
            <Zap size={16} className="text-green-600" />
            <span className="text-sm font-medium">Today's Total</span>
          </div>
          <span className="font-bold text-gray-800">{formatDuration(totalMinutes)}</span>
        </div>

        {/* Shift History */}
        {todayShifts.length > 0 && (
          <div className="bg-white rounded-2xl p-5 shadow-sm space-y-3">
            <h3 className="font-semibold text-gray-700 text-sm">Today's Shifts</h3>
            {todayShifts.map(s => (
              <div key={s.id} className="border-l-4 pl-3 py-1" style={{ borderColor: crew.color }}>
                <div className="text-sm font-semibold text-gray-800">{s.property}</div>
                <div className="text-xs text-gray-500">
                  {formatTime(s.clockIn)} → {s.clockOut ? formatTime(s.clockOut) : 'In progress'}
                  {s.durationMinutes !== null && ` · ${formatDuration(s.durationMinutes)}`}
                  {s.breakMinutes > 0 && ` · ${s.breakMinutes}m break`}
                </div>
                {s.note && <div className="text-xs text-gray-400 mt-0.5">"{s.note}"</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
