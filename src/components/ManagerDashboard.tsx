import { useState } from 'react'
import { LogOut, Download, Map, RefreshCw, Clock } from 'lucide-react'
import { CREW } from '../lib/data'
import { useManagerShifts, useLiveLocations, Shift } from '../lib/useShifts'
import { formatTime, formatDuration, todayStr } from '../lib/data'
import { RouteMap } from './RouteMap'

interface Props { onLogout: () => void }

export function ManagerDashboard({ onLogout }: Props) {
  const [date,    setDate]    = useState(todayStr())
  const [showMap, setShowMap] = useState(false)
  const { shifts, loading }   = useManagerShifts(date)
  const liveLocations         = useLiveLocations()

  // KPIs
  const onClock    = shifts.filter(s => s.clockOut === null).length
  const totalHours = shifts.filter(s => s.durationMinutes !== null)
    .reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0) / 60

  function statusForCrew(name: string) {
    const live = liveLocations.find(l => l.userName === name)
    const open = shifts.find(s => s.crewName === name && s.clockOut === null)
    if (live && live.active) return { label: 'On Clock', color: '#16a34a', property: live.currentProperty }
    if (open)                return { label: 'On Clock', color: '#16a34a', property: open.property }
    if (shifts.some(s => s.crewName === name)) return { label: 'Done', color: '#6b7280', property: null }
    return { label: 'Not In', color: '#dc2626', property: null }
  }

  function hoursToday(name: string) {
    const mins = shifts
      .filter(s => s.crewName === name)
      .reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0)
    return mins > 0 ? formatDuration(mins) : '—'
  }

  function exportCSV() {
    const rows = [['Date','Crew','LM','Property','Clock In','Clock Out','Break (min)','Total Hours','GPS (m)','Note']]
    shifts.forEach(s => rows.push([
      s.date, s.crewName, s.lm, s.property,
      formatTime(s.clockIn),
      s.clockOut ? formatTime(s.clockOut) : '',
      s.breakMinutes.toString(),
      s.durationMinutes !== null ? (s.durationMinutes / 60).toFixed(2) : '',
      s.distanceFromProperty?.toString() ?? '',
      s.note,
    ]))
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const a   = document.createElement('a')
    a.href    = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
    a.download = `timeclock-${date}.csv`
    a.click()
  }

  const late = date === todayStr()
    ? CREW.filter(c => {
        const day = new Date().getDay()
        if (day === 0 || day === 5 || day === 6) return false
        const cutoff = new Date(); cutoff.setHours(7, 30, 0, 0)
        if (new Date() < cutoff) return false
        return !shifts.some(s => s.crewName === c.name)
      })
    : []

  if (showMap) return <RouteMap onClose={() => setShowMap(false)} liveLocations={liveLocations} />

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#f5f5f0' }}>
      {/* Header */}
      <div className="text-white px-5 pt-safe-top pb-5 shrink-0" style={{ backgroundColor: '#0d1f3a' }}>
        <div className="pt-4 flex justify-between items-center">
          <div>
            <div className="text-white/60 text-xs font-semibold uppercase tracking-wider">Manager</div>
            <div className="text-2xl font-bold">Cornerstone LLC</div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowMap(true)}
              className="h-11 px-4 rounded-xl bg-white/20 active:bg-white/30 flex items-center gap-1.5 font-semibold text-sm touch-manipulation">
              <Map size={16} color="white" />
              <span className="text-white">Map</span>
            </button>
            <button onClick={onLogout}
              className="h-11 w-11 flex items-center justify-center rounded-xl bg-white/20 active:bg-white/30 touch-manipulation">
              <LogOut size={18} color="white" />
            </button>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          {[
            { label: 'On Clock',    value: `${onClock}/5`,           color: '#4ade80' },
            { label: 'Hours Today', value: `${totalHours.toFixed(1)}h`, color: '#60a5fa' },
            { label: 'Late',        value: `${late.length}`,          color: late.length > 0 ? '#f87171' : '#9ca3af' },
          ].map(k => (
            <div key={k.label} className="bg-white/10 rounded-2xl px-3 py-3 text-center">
              <div className="text-2xl font-bold" style={{ color: k.color }}>{k.value}</div>
              <div className="text-white/50 text-xs mt-0.5">{k.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-6">

        {/* Late alert */}
        {late.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
            <div className="font-bold text-red-700 text-sm mb-1">⚠️ Not clocked in after 7:30 AM</div>
            <div className="text-red-600 text-sm">{late.map(c => c.name).join(', ')}</div>
          </div>
        )}

        {/* Live crew status */}
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-1">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-gray-800">Crew Status</h2>
            <button onClick={() => setShowMap(true)}
              className="text-xs text-blue-600 font-semibold flex items-center gap-1 touch-manipulation">
              <Map size={12} /> Live Map
            </button>
          </div>
          {CREW.map(c => {
            const s    = statusForCrew(c.name)
            const live = liveLocations.find(l => l.userName === c.name)
            const staleSec = live ? Math.round((Date.now() - live.updatedAt.getTime()) / 1000) : null
            return (
              <div key={c.pin} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0"
                  style={{ backgroundColor: c.color, color: c.textColor ?? '#fff' }}>
                  {c.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-800 text-sm">{c.name}</span>
                    <span className="text-gray-400 text-xs">{c.lm}</span>
                    {staleSec !== null && staleSec < 120 && (
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" title="Live" />
                    )}
                  </div>
                  {s.property && <div className="text-xs text-gray-500 truncate">{s.property}</div>}
                  <div className="text-xs text-gray-400">{hoursToday(c.name)}</div>
                </div>
                <div className="text-xs font-semibold px-2.5 py-1 rounded-full shrink-0"
                  style={{ backgroundColor: s.color + '20', color: s.color }}>
                  {s.label}
                </div>
              </div>
            )
          })}
        </div>

        {/* Date + export */}
        <div className="bg-white rounded-2xl p-4 shadow-sm flex gap-3 items-center">
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 touch-manipulation" />
          <button onClick={exportCSV} title="Export CSV"
            className="h-11 w-11 flex items-center justify-center rounded-xl bg-blue-50 text-blue-600 active:bg-blue-100 transition touch-manipulation">
            <Download size={20} />
          </button>
        </div>

        {/* Shifts */}
        {loading ? (
          <div className="bg-white rounded-2xl p-6 flex items-center justify-center gap-2 text-gray-400">
            <RefreshCw size={16} className="animate-spin" /> Loading…
          </div>
        ) : shifts.length === 0 ? (
          <div className="bg-white rounded-2xl p-6 text-center text-gray-400 text-sm">
            No shifts for {date}
          </div>
        ) : (
          <div className="space-y-3">
            {CREW.map(c => {
              const crewShifts = shifts.filter(s => s.crewName === c.name)
              if (!crewShifts.length) return null
              return (
                <div key={c.pin} className="bg-white rounded-2xl p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                      style={{ backgroundColor: c.color, color: c.textColor ?? '#fff' }}>
                      {c.name[0]}
                    </div>
                    <span className="font-bold text-gray-800">{c.name}</span>
                    <span className="text-gray-400 text-xs">{c.lm}</span>
                    <span className="ml-auto text-xs text-gray-400 flex items-center gap-1">
                      <Clock size={11} /> {hoursToday(c.name)}
                    </span>
                  </div>
                  {crewShifts.map((s: Shift) => (
                    <div key={s.id} className="border-l-2 pl-3 pb-3 mb-3 last:mb-0 last:pb-0"
                      style={{ borderColor: c.color }}>
                      <div className="font-semibold text-sm text-gray-800">{s.property}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {formatTime(s.clockIn)} → {s.clockOut ? formatTime(s.clockOut) : <span className="text-green-600 font-semibold">Active ●</span>}
                        {s.durationMinutes !== null && ` · ${formatDuration(s.durationMinutes)}`}
                        {s.breakMinutes > 0 && ` · ${s.breakMinutes}m break`}
                      </div>
                      {s.distanceFromProperty !== null && (
                        <div className={`text-xs mt-0.5 ${s.distanceFromProperty > 500 ? 'text-orange-500' : 'text-gray-400'}`}>
                          📍 {s.distanceFromProperty}m from property
                        </div>
                      )}
                      {s.note ? <div className="text-xs text-gray-400 mt-0.5 italic">"{s.note}"</div> : null}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
