import { useState, useEffect } from 'react'
import { LogOut, MapPin, Navigation, Coffee, AlertTriangle, CheckCircle, Clock3, ChevronDown, Camera } from 'lucide-react'
import {
  CrewMember, ALL_PROPERTIES, getScheduledProperty, parseStops,
  formatTime, formatDuration, fmtSecs, PROPERTY_COORDS,
  getNavigateUrl, isIos, todayStr
} from '../lib/data'
import { useCrewShifts, useLiveLocation } from '../lib/useShifts'

interface Props {
  crew: CrewMember
  onLogout: () => void
}

// ─── Navigate bottom sheet ────────────────────────────────────────────────────
function NavigateSheet({ property, onClose }: { property: string; onClose: () => void }) {
  const ios = isIos()
  const options = [
    { label: '🗺 Google Maps', url: getNavigateUrl(property, 'google') },
    { label: '🔵 Waze',        url: getNavigateUrl(property, 'waze')   },
    ...(ios ? [{ label: '🍎 Apple Maps', url: getNavigateUrl(property, 'apple') }] : []),
  ]
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative bg-white rounded-t-3xl p-5 pb-safe space-y-3 animate-slide-up"
        onClick={e => e.stopPropagation()}>
        <div className="mx-auto w-10 h-1 rounded-full bg-gray-300 mb-4" />
        <p className="font-bold text-gray-800 text-center text-sm">Navigate to {property}</p>
        {options.map(o => (
          <a key={o.label} href={o.url} target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center w-full py-4 rounded-2xl bg-gray-50 font-semibold text-gray-800 text-base active:bg-gray-100 transition"
            onClick={onClose}>
            {o.label}
          </a>
        ))}
        <button onClick={onClose} className="w-full py-4 rounded-2xl text-gray-400 font-semibold text-sm">
          Cancel
        </button>
      </div>
    </div>
  )
}

// ─── Clock-out bottom sheet ───────────────────────────────────────────────────
function ClockOutSheet({ onConfirm, onClose, busy }: {
  onConfirm: (note: string) => void
  onClose: () => void
  busy: boolean
}) {
  const [note, setNote] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative bg-white rounded-t-3xl p-5 pb-safe space-y-4 animate-slide-up"
        onClick={e => e.stopPropagation()}>
        <div className="mx-auto w-10 h-1 rounded-full bg-gray-300" />
        <h2 className="font-bold text-gray-800 text-lg">Clock Out</h2>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Notes — gate codes, issues, anything to flag..."
          rows={3}
          className="w-full px-4 py-3 border border-gray-200 rounded-2xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-300 touch-manipulation"
        />
        <div className="grid grid-cols-2 gap-3">
          <button onClick={onClose}
            className="h-14 rounded-2xl border-2 border-gray-200 font-semibold text-gray-600 active:bg-gray-50 transition touch-manipulation">
            Cancel
          </button>
          <button onClick={() => onConfirm(note)} disabled={busy}
            className="h-14 rounded-2xl bg-red-600 font-bold text-white text-lg active:bg-red-700 disabled:opacity-50 transition touch-manipulation">
            {busy ? 'Saving…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Break bottom sheet ───────────────────────────────────────────────────────
function BreakSheet({ onStart, onClose }: {
  onStart: (type: 'lunch' | 'rest') => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative bg-white rounded-t-3xl p-5 pb-safe space-y-3 animate-slide-up"
        onClick={e => e.stopPropagation()}>
        <div className="mx-auto w-10 h-1 rounded-full bg-gray-300 mb-2" />
        <p className="font-bold text-gray-800 text-center text-sm">Start Break</p>
        <button onClick={() => { onStart('lunch'); onClose() }}
          className="w-full h-16 rounded-2xl bg-amber-50 font-bold text-amber-700 text-lg active:bg-amber-100 transition touch-manipulation">
          🍽 Lunch Break (30 min)
        </button>
        <button onClick={() => { onStart('rest'); onClose() }}
          className="w-full h-16 rounded-2xl bg-blue-50 font-bold text-blue-700 text-lg active:bg-blue-100 transition touch-manipulation">
          ☕ Rest Break (15 min)
        </button>
        <button onClick={onClose} className="w-full py-4 text-gray-400 font-semibold text-sm">Cancel</button>
      </div>
    </div>
  )
}

// ─── Main dashboard ───────────────────────────────────────────────────────────
export function CrewDashboard({ crew, onLogout }: Props) {
  const {
    todayShifts, activeShift, activeBreak, loading,
    clockIn, clockOut, startBreak, endBreak,
    totalMinutes, clockInStatus,
  } = useCrewShifts(crew.pin)

  const [elapsed,      setElapsed]      = useState(0)
  const [breakElapsed, setBreakElapsed] = useState(0)
  const [selectedProp, setSelectedProp] = useState<string>(
    getScheduledProperty(crew.name) ?? ALL_PROPERTIES[0]
  )
  const [sheet, setSheet] = useState<'none' | 'navigate' | 'clockout' | 'break'>('none')
  const [gpsWarning, setGpsWarning] = useState<string | null>(null)
  const [clockOutBusy, setClockOutBusy] = useState(false)

  // Live location while clocked in
  useLiveLocation(
    crew.pin,
    crew.name,
    crew.lm,
    crew.color,
    !!activeShift,
    activeShift?.property ?? null,
    activeShift?.clockIn ?? null
  )

  // Live elapsed timer (from stored clockIn — survives re-renders)
  useEffect(() => {
    if (!activeShift || activeBreak) return
    const tick = () => setElapsed(
      Math.max(0, Math.floor((Date.now() - activeShift.clockIn.getTime()) / 1000) - activeShift.breakMinutes * 60)
    )
    tick()
    const iv = setInterval(tick, 1000)
    return () => clearInterval(iv)
  }, [activeShift?.id, activeBreak])

  // Break timer
  useEffect(() => {
    if (!activeBreak) return
    const tick = () => setBreakElapsed(
      Math.floor((Date.now() - activeBreak.breakStart.getTime()) / 1000)
    )
    tick()
    const iv = setInterval(tick, 1000)
    return () => clearInterval(iv)
  }, [activeBreak?.id])

  // GPS proximity warning after clock-in
  useEffect(() => {
    if (!activeShift) { setGpsWarning(null); return }
    const dist   = activeShift.distanceFromProperty
    const coords = PROPERTY_COORDS[activeShift.property]
    if (dist !== null && coords) {
      if      (dist > 2000) setGpsWarning(`🔴 ${dist}m from ${activeShift.property} — contact manager`)
      else if (dist > 500)  setGpsWarning(`⚠️ ${dist}m from ${activeShift.property}`)
      else                  setGpsWarning(null)
    }
  }, [activeShift?.id])

  async function handleClockIn() {
    if (clockInStatus === 'loading') return
    await clockIn(crew.name, crew.lm, selectedProp)
  }

  async function handleClockOut(note: string) {
    setClockOutBusy(true)
    await clockOut(note)
    setClockOutBusy(false)
    setSheet('none')
  }

  const scheduledProp  = getScheduledProperty(crew.name)
  const scheduledStops = scheduledProp ? parseStops(scheduledProp) : []
  const today          = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#f5f5f0' }}>
      <div className="text-gray-400 text-sm animate-pulse">Loading…</div>
    </div>
  )

  const isOnBreak   = !!activeBreak
  const isClockedIn = !!activeShift && !activeShift.clockOut
  const cardBg      = isOnBreak ? '#d97706' : '#16a34a'

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#f5f5f0' }}>
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="text-white px-5 pt-safe-top pb-5 shrink-0" style={{ backgroundColor: crew.color }}>
        <div className="pt-4 flex justify-between items-start">
          <div>
            <div className="text-white/70 text-xs font-semibold tracking-wider uppercase">{crew.lm}</div>
            <div className="text-3xl font-bold leading-tight">{crew.name}</div>
            <div className="text-white/70 text-xs mt-0.5">{today}</div>
          </div>
          <button onClick={onLogout}
            className="h-11 w-11 flex items-center justify-center rounded-xl bg-white/20 active:bg-white/30 touch-manipulation">
            <LogOut size={20} color="white" />
          </button>
        </div>

        {/* Today's route stops */}
        {scheduledStops.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {scheduledStops.map((stop, i) => {
              const doneShift = todayShifts.find(s => s.property === stop && s.clockOut !== null)
              const activeHere = activeShift?.property === stop
              return (
                <div key={i}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${
                    doneShift
                      ? 'bg-white/30 text-white line-through opacity-60'
                      : activeHere
                        ? 'bg-white text-gray-800'
                        : 'bg-white/20 text-white'
                  }`}>
                  {doneShift ? '✓' : <MapPin size={10} />}
                  {stop}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Scrollable body ─────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-6">

        {/* GPS warning */}
        {gpsWarning && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-2xl px-4 py-3 flex gap-2 items-start">
            <AlertTriangle size={18} className="text-yellow-600 mt-0.5 shrink-0" />
            <p className="text-yellow-800 text-sm">{gpsWarning}</p>
          </div>
        )}

        {/* ── CLOCKED IN ────────────────────────────────────────────── */}
        {isClockedIn && (
          <div className="rounded-3xl p-5 text-white" style={{ backgroundColor: cardBg }}>
            <div className="text-xs font-semibold opacity-70 uppercase tracking-wider mb-1">
              {isOnBreak ? `On ${activeBreak!.breakType} break` : 'Clocked In'}
            </div>

            {/* Big timer */}
            <div className="font-mono text-5xl font-bold tracking-tight my-3">
              {isOnBreak ? fmtSecs(breakElapsed) : fmtSecs(elapsed)}
            </div>

            <div className="flex items-center gap-1.5 text-white/80 text-sm">
              <Clock3 size={14} />
              <span>Since {formatTime(activeShift!.clockIn)} · {activeShift!.property}</span>
            </div>
            {activeShift!.breakMinutes > 0 && (
              <div className="text-white/60 text-xs mt-1">{activeShift!.breakMinutes}m break taken</div>
            )}

            {/* Navigate button */}
            <button
              onClick={() => setSheet('navigate')}
              className="mt-4 w-full h-12 rounded-2xl bg-white/20 flex items-center justify-center gap-2 font-semibold text-white active:bg-white/30 transition touch-manipulation">
              <Navigation size={18} /> Navigate to Property
            </button>

            {/* Break / Clock Out */}
            {isOnBreak ? (
              <button onClick={endBreak}
                className="mt-3 w-full h-14 rounded-2xl bg-white font-bold text-amber-700 text-lg active:bg-white/90 transition touch-manipulation">
                End Break
              </button>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <button onClick={() => setSheet('break')}
                  className="h-14 rounded-2xl bg-white/20 font-semibold text-white flex items-center justify-center gap-2 active:bg-white/30 transition touch-manipulation">
                  <Coffee size={18} /> Break
                </button>
                <button onClick={() => setSheet('clockout')}
                  className="h-14 rounded-2xl bg-red-600 font-bold text-white text-lg active:bg-red-700 transition touch-manipulation">
                  Clock Out
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── NOT CLOCKED IN ────────────────────────────────────────── */}
        {!isClockedIn && (
          <div className="bg-white rounded-3xl p-5 shadow-sm space-y-4">
            <div className="font-semibold text-gray-700 text-sm">Select Property</div>

            {/* Property cards */}
            <div className="space-y-2">
              {ALL_PROPERTIES.slice(0, 6).map(p => {
                const isScheduled = p === scheduledProp || (scheduledProp && parseStops(scheduledProp).includes(p))
                const isSelected  = p === selectedProp
                return (
                  <button key={p} onClick={() => setSelectedProp(p)}
                    className={`w-full text-left px-4 py-3.5 rounded-2xl border-2 font-medium text-sm transition touch-manipulation ${
                      isSelected
                        ? 'border-green-500 bg-green-50 text-green-800'
                        : 'border-gray-100 bg-gray-50 text-gray-700 active:border-gray-300'
                    }`}>
                    {isScheduled && <span className="text-xs font-bold text-green-600 mr-2">★ TODAY</span>}
                    {p}
                  </button>
                )
              })}
            </div>

            {/* More properties */}
            <details className="group">
              <summary className="flex items-center gap-1 text-xs text-gray-400 font-semibold cursor-pointer list-none touch-manipulation">
                <ChevronDown size={14} className="group-open:rotate-180 transition-transform" />
                More properties
              </summary>
              <div className="mt-2 space-y-2">
                {ALL_PROPERTIES.slice(6).map(p => (
                  <button key={p} onClick={() => setSelectedProp(p)}
                    className={`w-full text-left px-4 py-3.5 rounded-2xl border-2 font-medium text-sm transition touch-manipulation ${
                      selectedProp === p
                        ? 'border-green-500 bg-green-50 text-green-800'
                        : 'border-gray-100 bg-gray-50 text-gray-700 active:border-gray-300'
                    }`}>
                    {p}
                  </button>
                ))}
              </div>
            </details>

            {/* Navigate to selected property before clock-in */}
            <button onClick={() => setSheet('navigate')}
              className="w-full h-12 rounded-2xl border-2 border-gray-100 flex items-center justify-center gap-2 text-gray-600 font-semibold text-sm active:bg-gray-50 transition touch-manipulation">
              <Navigation size={16} /> Navigate to {selectedProp}
            </button>

            {/* CLOCK IN button — state machine */}
            <button
              onClick={handleClockIn}
              disabled={clockInStatus === 'loading'}
              className={`w-full h-16 rounded-2xl font-bold text-xl transition touch-manipulation ${
                clockInStatus === 'loading'  ? 'bg-green-400 text-white opacity-80'    :
                clockInStatus === 'success'  ? 'bg-green-600 text-white'               :
                clockInStatus === 'offline'  ? 'bg-amber-500 text-white'              :
                clockInStatus === 'error'    ? 'bg-red-600 text-white'                :
                'bg-green-600 text-white active:bg-green-700'
              }`}
              style={clockInStatus === 'idle' ? { boxShadow: '0 0 0 0 rgba(22,163,74,0.4)' } : {}}>
              {clockInStatus === 'loading' ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-5 h-5 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                  Clocking In…
                </span>
              ) : clockInStatus === 'success' ? '✓ Clocked In!' :
                clockInStatus === 'offline'  ? '📶 Saved — will sync' :
                clockInStatus === 'error'    ? 'Tap to Retry' :
                `✓ Clock In at ${selectedProp}`
              }
            </button>
          </div>
        )}

        {/* ── Today's hours ──────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl px-5 py-4 shadow-sm flex justify-between items-center">
          <span className="text-sm font-semibold text-gray-600">Today's Total</span>
          <span className="font-bold text-gray-800 text-lg">{formatDuration(totalMinutes)}</span>
        </div>

        {/* ── Shift history ──────────────────────────────────────────── */}
        {todayShifts.length > 0 && (
          <div className="bg-white rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="font-bold text-gray-700 text-sm">Today's Shifts</h3>
            {todayShifts.map(s => (
              <div key={s.id} className="border-l-4 pl-4 py-1 space-y-0.5" style={{ borderColor: crew.color }}>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-800 text-sm">{s.property}</span>
                  {s.clockOut ? (
                    <CheckCircle size={14} className="text-green-500" />
                  ) : (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">Active</span>
                  )}
                </div>
                <div className="text-xs text-gray-500">
                  {formatTime(s.clockIn)} → {s.clockOut ? formatTime(s.clockOut) : 'now'}
                  {s.durationMinutes !== null && ` · ${formatDuration(s.durationMinutes)}`}
                  {s.breakMinutes > 0 && ` · ${s.breakMinutes}m break`}
                </div>
                {s.distanceFromProperty !== null && s.distanceFromProperty > 500 && (
                  <div className="text-xs text-orange-500">📍 {s.distanceFromProperty}m from property</div>
                )}
                {s.note ? <div className="text-xs text-gray-400 italic">"{s.note}"</div> : null}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Bottom sheets ──────────────────────────────────────────── */}
      {sheet === 'navigate' && (
        <NavigateSheet
          property={activeShift?.property ?? selectedProp}
          onClose={() => setSheet('none')}
        />
      )}
      {sheet === 'clockout' && (
        <ClockOutSheet
          onConfirm={handleClockOut}
          onClose={() => setSheet('none')}
          busy={clockOutBusy}
        />
      )}
      {sheet === 'break' && (
        <BreakSheet
          onStart={startBreak}
          onClose={() => setSheet('none')}
        />
      )}
    </div>
  )
}
