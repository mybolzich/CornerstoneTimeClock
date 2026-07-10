import { useState, useEffect } from 'react'
import { collection, doc, setDoc, onSnapshot, Timestamp, query, where } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { CREW, ALL_PROPERTIES, SCHEDULE, getTodayName, todayStr, parseStops } from '../lib/data'
import { LogOut, Plus, Trash2, Save, ChevronDown, ChevronUp, Copy } from 'lucide-react'

interface CrewRoute {
  crewPin: string
  crewName: string
  date: string
  stops: string[]        // ordered list of property names
  savedAt?: Date
}

const DAYS = ['Monday','Tuesday','Wednesday','Thursday']

interface Props { onLogout: () => void }

export function Dispatcher({ onLogout }: Props) {
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [routes, setRoutes]             = useState<Record<string, CrewRoute>>({})
  const [saving, setSaving]             = useState<string | null>(null)
  const [saved,  setSaved]              = useState<string | null>(null)
  const [expanded, setExpanded]         = useState<string | null>(CREW[0].pin)

  // Subscribe to dispatcher routes for the selected date
  useEffect(() => {
    const q = query(collection(db, 'dispatchRoutes'), where('date', '==', selectedDate))
    const unsub = onSnapshot(q, snap => {
      const loaded: Record<string, CrewRoute> = {}
      snap.docs.forEach(d => {
        const data = d.data()
        loaded[data.crewPin] = {
          crewPin:  data.crewPin,
          crewName: data.crewName,
          date:     data.date,
          stops:    data.stops ?? [],
          savedAt:  data.savedAt ? (data.savedAt as Timestamp).toDate() : undefined,
        }
      })
      // Merge with local state — don't overwrite unsaved changes
      setRoutes(prev => {
        const merged = { ...prev }
        Object.entries(loaded).forEach(([pin, r]) => {
          // Only replace if not being actively edited (no unsaved local version)
          if (!prev[pin] || (prev[pin].savedAt && r.savedAt && r.savedAt >= prev[pin].savedAt!)) {
            merged[pin] = r
          }
        })
        return merged
      })
    })
    return unsub
  }, [selectedDate])

  // Initialize missing routes from the schedule template
  useEffect(() => {
    const dateObj = new Date(selectedDate + 'T12:00:00')
    const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dateObj.getDay()]
    const template = SCHEDULE[dayName] ?? {}
    setRoutes(prev => {
      const next = { ...prev }
      CREW.forEach(c => {
        if (!next[c.pin]) {
          const raw = template[c.name]
          next[c.pin] = {
            crewPin: c.pin, crewName: c.name,
            date: selectedDate,
            stops: raw ? parseStops(raw) : [],
          }
        }
      })
      return next
    })
  }, [selectedDate])

  function getRoute(pin: string): CrewRoute {
    return routes[pin] ?? { crewPin: pin, crewName: CREW.find(c=>c.pin===pin)?.name ?? '', date: selectedDate, stops: [] }
  }

  function addStop(pin: string, property: string) {
    if (!property) return
    setRoutes(prev => ({
      ...prev,
      [pin]: { ...getRoute(pin), stops: [...(prev[pin]?.stops ?? []), property] }
    }))
  }

  function removeStop(pin: string, idx: number) {
    setRoutes(prev => {
      const stops = [...(prev[pin]?.stops ?? [])]
      stops.splice(idx, 1)
      return { ...prev, [pin]: { ...getRoute(pin), stops } }
    })
  }

  function moveStop(pin: string, idx: number, dir: -1 | 1) {
    setRoutes(prev => {
      const stops = [...(prev[pin]?.stops ?? [])]
      const swap  = idx + dir
      if (swap < 0 || swap >= stops.length) return prev
      ;[stops[idx], stops[swap]] = [stops[swap], stops[idx]]
      return { ...prev, [pin]: { ...getRoute(pin), stops } }
    })
  }

  async function saveRoute(pin: string) {
    setSaving(pin)
    const route  = getRoute(pin)
    const docRef = doc(db, 'dispatchRoutes', `${pin}_${selectedDate}`)
    try {
      await setDoc(docRef, { ...route, savedAt: Timestamp.now() })
      setSaved(pin)
      setTimeout(() => setSaved(null), 2000)
    } catch (e) {
      console.error('Save failed', e)
    }
    setSaving(null)
  }

  async function saveAll() {
    for (const c of CREW) {
      await saveRoute(c.pin)
    }
  }

  function copyFromTemplate() {
    const dateObj = new Date(selectedDate + 'T12:00:00')
    const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dateObj.getDay()]
    const template = SCHEDULE[dayName]
    if (!template) { alert('No template for this day (Fri–Sun have no routes).'); return }
    setRoutes(prev => {
      const next = { ...prev }
      CREW.forEach(c => {
        const raw = template[c.name]
        next[c.pin] = {
          ...(prev[c.pin] ?? { crewPin: c.pin, crewName: c.name, date: selectedDate }),
          stops: raw ? parseStops(raw) : [],
        }
      })
      return next
    })
  }

  const today = todayStr()

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#f5f5f0' }}>
      {/* Header */}
      <div className="text-white px-5 pt-safe-top pb-4 shrink-0" style={{ backgroundColor: '#0d1f3a' }}>
        <div className="pt-4 flex justify-between items-center">
          <div>
            <div className="text-white/60 text-xs font-semibold uppercase tracking-wider">Dispatch</div>
            <div className="text-xl font-bold">Route Builder</div>
          </div>
          <button onClick={onLogout}
            className="h-11 w-11 flex items-center justify-center rounded-xl bg-white/20 active:bg-white/30 touch-manipulation">
            <LogOut size={18} color="white" />
          </button>
        </div>

        {/* Date selector */}
        <div className="flex gap-2 mt-4 items-center">
          <input type="date" value={selectedDate} onChange={e => {
            setSelectedDate(e.target.value)
            setRoutes({})  // reset on date change
          }}
            className="flex-1 bg-white/10 text-white border border-white/20 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-white/30 touch-manipulation" />
          <button onClick={copyFromTemplate}
            className="h-11 px-3 rounded-xl bg-white/10 border border-white/20 text-white font-semibold text-xs flex items-center gap-1.5 active:bg-white/20 touch-manipulation">
            <Copy size={14} /> Template
          </button>
          <button onClick={saveAll}
            className="h-11 px-3 rounded-xl bg-green-600 text-white font-bold text-xs flex items-center gap-1.5 active:bg-green-700 touch-manipulation">
            <Save size={14} /> Save All
          </button>
        </div>
      </div>

      {/* Crew route cards */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-6">
        {CREW.map(crew => {
          const route    = getRoute(crew.pin)
          const isOpen   = expanded === crew.pin
          const isSaving = saving === crew.pin
          const isSaved  = saved  === crew.pin

          return (
            <div key={crew.pin} className="bg-white rounded-2xl shadow-sm overflow-hidden">
              {/* Crew header — tap to expand */}
              <button
                onClick={() => setExpanded(isOpen ? null : crew.pin)}
                className="w-full flex items-center gap-3 px-4 py-4 active:bg-gray-50 touch-manipulation">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                  style={{ backgroundColor: crew.color, color: crew.textColor ?? '#fff' }}>
                  {crew.name[0]}
                </div>
                <div className="flex-1 text-left">
                  <div className="font-bold text-gray-800">{crew.name} <span className="text-gray-400 font-normal text-sm">{crew.lm}</span></div>
                  <div className="text-xs text-gray-500">
                    {route.stops.length === 0
                      ? 'No stops assigned'
                      : route.stops.join(' → ')}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {route.stops.length > 0 && (
                    <div className="w-6 h-6 rounded-full bg-green-100 text-green-700 text-xs font-bold flex items-center justify-center">
                      {route.stops.length}
                    </div>
                  )}
                  {isOpen ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
                </div>
              </button>

              {/* Expanded route editor */}
              {isOpen && (
                <div className="border-t border-gray-100 px-4 py-4 space-y-3">

                  {/* Stop list */}
                  {route.stops.length === 0 ? (
                    <div className="text-center text-gray-400 text-sm py-4">No stops yet. Add below ↓</div>
                  ) : (
                    <div className="space-y-2">
                      {route.stops.map((stop, idx) => (
                        <div key={idx}
                          className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2.5">
                          <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                            style={{ backgroundColor: crew.color }}>
                            {idx + 1}
                          </div>
                          <div className="flex-1 font-medium text-sm text-gray-800 truncate">{stop}</div>
                          <div className="flex gap-1 shrink-0">
                            <button onClick={() => moveStop(crew.pin, idx, -1)} disabled={idx === 0}
                              className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-400 active:bg-gray-200 disabled:opacity-30 touch-manipulation">
                              ↑
                            </button>
                            <button onClick={() => moveStop(crew.pin, idx, 1)} disabled={idx === route.stops.length - 1}
                              className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-400 active:bg-gray-200 disabled:opacity-30 touch-manipulation">
                              ↓
                            </button>
                            <button onClick={() => removeStop(crew.pin, idx)}
                              className="h-8 w-8 flex items-center justify-center rounded-lg text-red-400 active:bg-red-50 touch-manipulation">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add stop */}
                  <AddStopRow
                    crewColor={crew.color}
                    existing={route.stops}
                    onAdd={prop => addStop(crew.pin, prop)}
                  />

                  {/* Save button */}
                  <button onClick={() => saveRoute(crew.pin)} disabled={isSaving}
                    className={`w-full h-12 rounded-2xl font-bold text-sm transition touch-manipulation ${
                      isSaved   ? 'bg-green-100 text-green-700' :
                      isSaving  ? 'bg-gray-100 text-gray-400'  :
                      'bg-green-600 text-white active:bg-green-700'
                    }`}>
                    {isSaved ? '✓ Saved!' : isSaving ? 'Saving…' : <span className="flex items-center justify-center gap-2"><Save size={15} /> Save Route</span>}
                  </button>
                </div>
              )}
            </div>
          )
        })}

        {/* Quick-set from template */}
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-2">
          <div className="font-bold text-gray-700 text-sm">Weekly Templates</div>
          <div className="text-xs text-gray-500">Load a day's default routes from the hardcoded schedule.</div>
          <div className="grid grid-cols-2 gap-2">
            {DAYS.map(day => (
              <button key={day}
                onClick={() => {
                  const template = SCHEDULE[day]
                  if (!template) return
                  setRoutes(prev => {
                    const next = { ...prev }
                    CREW.forEach(c => {
                      const raw = template[c.name]
                      next[c.pin] = { ...(prev[c.pin] ?? { crewPin: c.pin, crewName: c.name, date: selectedDate }), stops: raw ? parseStops(raw) : [] }
                    })
                    return next
                  })
                }}
                className="h-10 rounded-xl bg-gray-50 border border-gray-100 font-semibold text-xs text-gray-600 active:bg-gray-100 touch-manipulation">
                {day}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Add stop row ───────────────────────────────────────────────────────────────
function AddStopRow({ crewColor, existing, onAdd }: {
  crewColor: string
  existing: string[]
  onAdd: (p: string) => void
}) {
  const [val, setVal] = useState('')
  const [custom, setCustom] = useState('')
  const [showCustom, setShowCustom] = useState(false)

  const available = ALL_PROPERTIES.filter(p => !existing.includes(p))

  function handleAdd() {
    const prop = showCustom ? custom.trim() : val
    if (!prop) return
    onAdd(prop)
    setVal('')
    setCustom('')
    setShowCustom(false)
  }

  return (
    <div className="space-y-2">
      {!showCustom ? (
        <div className="flex gap-2">
          <select value={val} onChange={e => setVal(e.target.value)}
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 touch-manipulation"
            style={{ '--tw-ring-color': crewColor } as React.CSSProperties}>
            <option value="">Select property…</option>
            {available.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <button onClick={handleAdd} disabled={!val}
            className="h-11 w-11 rounded-xl text-white flex items-center justify-center disabled:opacity-30 active:opacity-80 touch-manipulation"
            style={{ backgroundColor: crewColor }}>
            <Plus size={20} />
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            value={custom}
            onChange={e => setCustom(e.target.value)}
            placeholder="Custom property name…"
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 touch-manipulation"
          />
          <button onClick={handleAdd} disabled={!custom.trim()}
            className="h-11 w-11 rounded-xl text-white flex items-center justify-center disabled:opacity-30 active:opacity-80 touch-manipulation"
            style={{ backgroundColor: crewColor }}>
            <Plus size={20} />
          </button>
        </div>
      )}
      <button onClick={() => setShowCustom(s => !s)}
        className="text-xs text-gray-400 font-semibold touch-manipulation min-h-[36px]">
        {showCustom ? '← Back to list' : '+ Add custom property'}
      </button>
    </div>
  )
}
