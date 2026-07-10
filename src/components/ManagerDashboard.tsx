import { useState } from 'react'
import { LogOut, Download, RefreshCw } from 'lucide-react'
import { CREW } from '../lib/data'
import { useManagerShifts, Shift } from '../lib/useShifts'
import { formatTime, formatDuration, todayStr } from '../lib/data'

interface Props { onLogout: () => void }

export function ManagerDashboard({ onLogout }: Props) {
  const [date, setDate] = useState(todayStr())
  const { shifts, loading } = useManagerShifts(date)

  // Crew status summary
  const onClock = shifts.filter(s => s.clockOut === null).length
  const totalHours = shifts.filter(s => s.durationMinutes !== null).reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0) / 60

  function statusForCrew(crewName: string) {
    const open = shifts.find(s => s.crewName === crewName && s.clockOut === null)
    if (open) return { label: 'On Clock', color: '#16a34a', property: open.property }
    const hasShift = shifts.some(s => s.crewName === crewName)
    if (hasShift) return { label: 'Clocked Out', color: '#6b7280', property: null }
    return { label: 'Not In', color: '#dc2626', property: null }
  }

  function exportCSV() {
    const rows = [
      ['Date','Crew','LM','Property','Clock In','Clock Out','Break (min)','Total Hours','GPS Distance (m)','Note']
    ]
    shifts.forEach(s => {
      rows.push([
        s.date, s.crewName, s.lm, s.property,
        formatTime(s.clockIn),
        s.clockOut ? formatTime(s.clockOut) : '',
        s.breakMinutes.toString(),
        s.durationMinutes !== null ? (s.durationMinutes / 60).toFixed(2) : '',
        s.distanceFromProperty?.toString() ?? '',
        s.note
      ])
    })
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
    a.download = `timeclock-${date}.csv`
    a.click()
  }

  const late = date === todayStr()
    ? CREW.filter(c => {
        const now = new Date()
        if (now.getHours() < 7 || now.getDay() === 0 || now.getDay() === 5 || now.getDay() === 6) return false
        const cutoff = new Date(); cutoff.setHours(7, 30, 0, 0)
        if (now < cutoff) return false
        return !shifts.some(s => s.crewName === c.name)
      })
    : []

  return (
    <div className="min-h-screen" style={{ background: '#f5f5f0' }}>
      {/* Header */}
      <div className="text-white px-5 pt-12 pb-6" style={{ backgroundColor: '#0d1f3a' }}>
        <div className="flex justify-between items-center">
          <div>
            <div className="text-white/60 text-sm">Manager View</div>
            <div className="text-2xl font-bold">Cornerstone LLC</div>
          </div>
          <button onClick={onLogout} className="p-2 rounded-lg bg-white/20 active:bg-white/30">
            <LogOut size={20} color="white" />
          </button>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-3 gap-3 mt-5">
          {[
            { label: 'On Clock', value: `${onClock}/5`, color: '#16a34a' },
            { label: 'Hours Today', value: totalHours.toFixed(1) + 'h', color: '#2563eb' },
            { label: 'Late', value: late.length.toString(), color: late.length > 0 ? '#dc2626' : '#6b7280' },
          ].map(k => (
            <div key={k.label} className="bg-white/10 rounded-xl px-3 py-3 text-center">
              <div className="text-2xl font-bold" style={{ color: k.color }}>{k.value}</div>
              <div className="text-white/60 text-xs">{k.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 pb-10 space-y-4 mt-4">

        {/* Late Alert */}
        {late.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <div className="font-semibold text-red-700 text-sm mb-1">⚠️ Not clocked in after 7:30 AM</div>
            <div className="text-red-600 text-sm">{late.map(c => c.name).join(', ')}</div>
          </div>
        )}

        {/* Crew Status */}
        <div className="bg-white rounded-2xl p-5 shadow-sm space-y-3">
          <h2 className="font-bold text-gray-800">Crew Status</h2>
          {CREW.map(c => {
            const s = statusForCrew(c.name)
            return (
              <div key={c.pin} className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                  style={{ backgroundColor: c.color, color: c.textColor || '#fff' }}>
                  {c.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-800 text-sm">{c.name} <span className="text-gray-400 font-normal">{c.lm}</span></div>
                  {s.property && <div className="text-xs text-gray-500 truncate">{s.property}</div>}
                </div>
                <div className="text-xs font-semibold px-2 py-1 rounded-full"
                  style={{ backgroundColor: s.color + '20', color: s.color }}>
                  {s.label}
                </div>
              </div>
            )
          })}
        </div>

        {/* Date Picker & Export */}
        <div className="bg-white rounded-2xl p-4 shadow-sm flex gap-3 items-center">
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
          <button onClick={exportCSV} title="Export CSV"
            className="p-2.5 rounded-xl bg-blue-50 text-blue-600 active:scale-95 transition-transform">
            <Download size={20} />
          </button>
        </div>

        {/* Shifts Table */}
        {loading ? (
          <div className="bg-white rounded-2xl p-6 text-center text-gray-400 flex items-center justify-center gap-2">
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
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold"
                      style={{ backgroundColor: c.color, color: c.textColor || '#fff' }}>
                      {c.name[0]}
                    </div>
                    <span className="font-bold text-gray-800">{c.name}</span>
                    <span className="text-gray-400 text-sm">{c.lm}</span>
                  </div>
                  {crewShifts.map((s: Shift) => (
                    <div key={s.id} className="border-l-2 pl-3 pb-3 mb-3 last:mb-0 last:pb-0"
                      style={{ borderColor: c.color }}>
                      <div className="font-semibold text-sm text-gray-800">{s.property}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {formatTime(s.clockIn)} → {s.clockOut ? formatTime(s.clockOut) : '🟢 Active'}
                        {s.durationMinutes !== null && ` · ${formatDuration(s.durationMinutes)}`}
                        {s.breakMinutes > 0 && ` · ${s.breakMinutes}m break`}
                      </div>
                      {s.distanceFromProperty !== null && (
                        <div className={`text-xs mt-0.5 ${s.distanceFromProperty > 500 ? 'text-orange-500' : 'text-gray-400'}`}>
                          GPS: {s.distanceFromProperty}m from property
                        </div>
                      )}
                      {s.note && <div className="text-xs text-gray-400 mt-0.5 italic">"{s.note}"</div>}
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
