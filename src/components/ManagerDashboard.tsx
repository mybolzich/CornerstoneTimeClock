import { useState } from 'react'
import { LogOut, Download, Map, ExternalLink } from 'lucide-react'
import { CREW } from '../lib/data'
import { useManagerShifts, useLiveLocations, Shift } from '../lib/useShifts'
import { formatTime, formatDuration, todayStr } from '../lib/data'
import { RouteMap } from './RouteMap'

interface Props { onLogout: () => void }

export function ManagerDashboard({ onLogout }: Props) {
  const [date,     setDate]    = useState(todayStr())
  const [showMap,  setShowMap] = useState(false)
  const [showCal,  setShowCal] = useState(false)
  const { shifts, loading }    = useManagerShifts(date)
  const liveLocations          = useLiveLocations()

  const onClock    = shifts.filter(s => s.clockOut === null).length
  const totalMins  = shifts.filter(s => s.durationMinutes !== null)
                           .reduce((sum,s) => sum + (s.durationMinutes ?? 0), 0)

  function statusForCrew(name: string) {
    const live = liveLocations.find(l => l.userName === name)
    const open = shifts.find(s => s.crewName === name && s.clockOut === null)
    if (live?.active)  return { label:'On Clock', on:true,  property: live.currentProperty }
    if (open)          return { label:'On Clock', on:true,  property: open.property }
    if (shifts.some(s => s.crewName === name)) return { label:'Done', on:false, property: null }
    return { label:'Not started', on:false, property: null }
  }

  function hoursToday(name: string) {
    const mins = shifts.filter(s => s.crewName === name)
                        .reduce((sum,s) => sum + (s.durationMinutes ?? 0), 0)
    return mins > 0 ? (mins / 60).toFixed(1) : null
  }

  function exportCSV() {
    const rows = [['Date','Crew','LM','Property','Clock In','Clock Out','Break(min)','Hours','GPS(m)','Note']]
    shifts.forEach(s => rows.push([
      s.date, s.crewName, s.lm, s.property,
      formatTime(s.clockIn), s.clockOut ? formatTime(s.clockOut) : '',
      s.breakMinutes.toString(),
      s.durationMinutes !== null ? (s.durationMinutes/60).toFixed(2) : '',
      s.distanceFromProperty?.toString() ?? '', s.note,
    ]))
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
    a.download = `timeclock-${date}.csv`
    a.click()
  }

  const displayDate = new Date(date + 'T12:00:00').toLocaleDateString('en-US',
    { month:'long', day:'numeric', year:'numeric' })

  if (showMap) return <RouteMap onClose={() => setShowMap(false)} liveLocations={liveLocations} />

  return (
    <div style={{ minHeight:'100dvh',background:'var(--bg)',display:'flex',flexDirection:'column',
                  fontFamily:'-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",sans-serif' }}>

      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <div style={{ background:'var(--bg)',borderBottom:'1px solid var(--border)',
                    padding:'12px 16px',paddingTop:'max(env(safe-area-inset-top,0px),12px)',
                    display:'flex',alignItems:'center',gap:12,flexShrink:0 }}>
        <div style={{ width:36,height:36,borderRadius:'50%',
                      background:'conic-gradient(#FF6B6B,#FFE66D,#4ECDC4,#A8E063,#FF6B6B)',
                      display:'flex',alignItems:'center',justifyContent:'center' }}>
          <div style={{ width:24,height:24,borderRadius:'50%',background:'var(--bg)' }} />
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:15,fontWeight:700,color:'var(--text-1)' }}>Cornerstone</div>
          <div style={{ fontSize:10,fontWeight:600,color:'var(--text-3)',letterSpacing:'.06em',textTransform:'uppercase' }}>Manager</div>
        </div>
        <button onClick={() => setShowMap(true)} style={{
          height:36,padding:'0 12px',borderRadius:20,background:'var(--surface)',
          border:'1px solid var(--border)',fontSize:13,fontWeight:600,color:'var(--text-2)',
          display:'flex',alignItems:'center',gap:6,
        }}>
          <Map size={14} /> Map
        </button>
      </div>

      {/* Scrollable body */}
      <div style={{ flex:1,overflowY:'auto',padding:'12px 16px',paddingBottom:100,display:'flex',flexDirection:'column',gap:12 }}>

        {/* "All Crew" hero card (from video frame 4) */}
        <div style={{ background:'var(--surface)',borderRadius:'var(--radius)',border:'1px solid var(--border)',
                      boxShadow:'var(--shadow)',padding:'16px',display:'flex',alignItems:'center',gap:14 }}>
          <div style={{ width:52,height:52,borderRadius:'50%',background:'#1A1A2E',
                        display:'flex',alignItems:'center',justifyContent:'center',
                        flexShrink:0 }}>
            <span style={{ fontSize:16,fontWeight:800,color:'#fff' }}>MGR</span>
          </div>
          <div>
            <div style={{ fontSize:11,fontWeight:600,color:'var(--text-3)',letterSpacing:'.05em',textTransform:'uppercase' }}>Manager View</div>
            <div style={{ fontSize:22,fontWeight:700,color:'var(--text-1)',lineHeight:1.2 }}>All Crew</div>
            <div style={{ fontSize:13,color:'var(--text-2)' }}>Live status + history</div>
          </div>
        </div>

        {/* Date picker row */}
        <div style={{ background:'var(--surface)',borderRadius:'var(--radius-sm)',border:'1px solid var(--border)',
                      padding:'12px 16px',display:'flex',alignItems:'center',gap:12 }}>
          <span style={{ fontSize:12,fontWeight:600,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'.05em',whiteSpace:'nowrap' }}>View Date</span>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ flex:1,border:'none',background:'transparent',fontSize:15,fontWeight:600,
                     color:'var(--text-1)',outline:'none',textAlign:'right' }} />
        </div>

        {/* KPI cards */}
        <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10 }}>
          {[
            { label:'On Clock', value:`${onClock}`, sub:`of ${CREW.length} crew` },
            { label:'Total Hours', value:(totalMins/60).toFixed(1), sub:'across all crew' },
          ].map(k => (
            <div key={k.label} style={{ background:'var(--surface)',borderRadius:'var(--radius-sm)',
                                        border:'1px solid var(--border)',boxShadow:'var(--shadow)',
                                        padding:'16px' }}>
              <div className="label-sm" style={{ marginBottom:6 }}>{k.label}</div>
              <div style={{ fontSize:32,fontWeight:800,color:'var(--text-1)',lineHeight:1,fontVariantNumeric:'tabular-nums' }}>
                {k.value}
              </div>
              <div style={{ fontSize:12,color:'var(--text-3)',marginTop:4 }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Crew Status section */}
        <div>
          <div className="label-sm" style={{ marginBottom:10 }}>Crew Status</div>
          <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
            {CREW.map(c => {
              const s     = statusForCrew(c.name)
              const hrs   = hoursToday(c.name)
              const live  = liveLocations.find(l => l.userName === c.name)
              const stale = live ? (Date.now() - live.updatedAt.getTime()) > 120_000 : true
              return (
                <div key={c.pin} style={{ background:'var(--surface)',borderRadius:'var(--radius-sm)',
                                          border:'1px solid var(--border)',boxShadow:'var(--shadow)',
                                          padding:'12px 14px',display:'flex',alignItems:'center',gap:12 }}>
                  <div className="crew-avatar" style={{ background:c.color,color:c.textColor??'#fff',position:'relative' }}>
                    {c.lm}
                    {live && !stale && (
                      <div style={{ position:'absolute',bottom:-2,right:-2,width:10,height:10,
                                    borderRadius:'50%',background:'#22C55E',border:'2px solid #fff' }} />
                    )}
                  </div>
                  <div style={{ flex:1,minWidth:0 }}>
                    <div style={{ fontSize:15,fontWeight:700,color:'var(--text-1)' }}>{c.name}</div>
                    <div style={{ fontSize:12,color:'var(--text-3)',marginTop:1 }}>
                      {s.property ?? 'Not started'}
                      {hrs && <span style={{ marginLeft:8,fontWeight:600,color:'var(--text-2)' }}>{hrs}h today</span>}
                    </div>
                  </div>
                  <div className={s.on ? 'pill-on' : 'pill-off'}>
                    {s.on ? 'ON' : 'OFF'}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Dispatch link */}
        <a href="dispatch.html" target="_blank" rel="noopener noreferrer"
          style={{ background:'#EFF6FF',borderRadius:'var(--radius-sm)',border:'1px solid #BFDBFE',
                   padding:'14px 16px',display:'flex',alignItems:'center',gap:12,textDecoration:'none' }}>
          <span style={{ fontSize:24 }}>🗺</span>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:14,fontWeight:700,color:'#1E40AF' }}>Route Dispatcher</div>
            <div style={{ fontSize:12,color:'#3B82F6' }}>Assign properties & build crew routes</div>
          </div>
          <ExternalLink size={16} color="#3B82F6" />
        </a>

        {/* All Shifts section */}
        <div>
          <div className="label-sm" style={{ marginBottom:10 }}>All Shifts</div>
          {loading ? (
            <div style={{ background:'var(--surface)',borderRadius:'var(--radius-sm)',border:'1px dashed var(--border)',
                          padding:'32px',textAlign:'center',color:'var(--text-3)',fontSize:14 }}>
              Loading…
            </div>
          ) : shifts.length === 0 ? (
            <div style={{ background:'var(--surface)',borderRadius:'var(--radius-sm)',border:'1px dashed var(--border)',
                          padding:'32px',textAlign:'center' }}>
              <div style={{ fontSize:14,fontWeight:600,color:'var(--text-2)' }}>No shifts logged</div>
              <div style={{ fontSize:13,color:'var(--text-3)',marginTop:4 }}>Nothing recorded for this date</div>
            </div>
          ) : (
            <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
              {CREW.map(c => {
                const crewShifts = shifts.filter(s => s.crewName === c.name)
                if (!crewShifts.length) return null
                return (
                  <div key={c.pin} style={{ background:'var(--surface)',borderRadius:'var(--radius-sm)',
                                            border:'1px solid var(--border)',overflow:'hidden' }}>
                    <div style={{ padding:'10px 14px',borderBottom:'1px solid var(--border)',
                                  display:'flex',alignItems:'center',gap:10 }}>
                      <div className="crew-avatar" style={{ width:32,height:32,fontSize:11,background:c.color,color:c.textColor??'#fff' }}>{c.lm}</div>
                      <span style={{ fontSize:14,fontWeight:700,color:'var(--text-1)' }}>{c.name}</span>
                      <span style={{ fontSize:12,color:'var(--text-3)',marginLeft:'auto' }}>
                        {hoursToday(c.name) ?? '0.0'}h
                      </span>
                    </div>
                    {crewShifts.map((s: Shift) => (
                      <div key={s.id} style={{ padding:'10px 14px',borderBottom:'1px solid var(--border)',
                                               display:'flex',justifyContent:'space-between',alignItems:'center' }}>
                        <div>
                          <div style={{ fontSize:14,fontWeight:600,color:'var(--text-1)' }}>{s.property}</div>
                          <div style={{ fontSize:12,color:'var(--text-3)',marginTop:2 }}>
                            {formatTime(s.clockIn)} → {s.clockOut ? formatTime(s.clockOut) : <span style={{ color:'var(--green-dark)',fontWeight:600 }}>Active</span>}
                            {s.breakMinutes > 0 && ` · ${s.breakMinutes}m break`}
                          </div>
                          {s.distanceFromProperty !== null && s.distanceFromProperty > 500 && (
                            <div style={{ fontSize:11,color:'#D97706',marginTop:2 }}>
                              📍 {s.distanceFromProperty}m from property
                            </div>
                          )}
                        </div>
                        <div style={{ fontSize:14,fontWeight:700,color:'var(--text-1)',textAlign:'right' }}>
                          {s.durationMinutes !== null ? `${(s.durationMinutes/60).toFixed(2)}` : '–'}
                          {s.durationMinutes !== null && <div style={{ fontSize:10,color:'var(--text-3)' }}>hrs</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom bar ────────────────────────────────────────────────── */}
      <div className="cta-bar" style={{ flexDirection:'row',gap:12 }}>
        <button onClick={onLogout} style={{
          flex:1,height:52,borderRadius:'var(--radius-sm)',background:'var(--surface)',
          border:'1px solid var(--border)',fontSize:13,fontWeight:700,color:'var(--text-2)',
          letterSpacing:'.05em',
        }}>SIGN OUT</button>
        <button onClick={exportCSV} style={{
          flex:2,height:52,borderRadius:'var(--radius-sm)',background:'var(--text-1)',
          border:'none',fontSize:13,fontWeight:700,color:'#fff',letterSpacing:'.05em',
          display:'flex',alignItems:'center',justifyContent:'center',gap:8,
        }}>
          <Download size={16} /> EXPORT CSV
        </button>
      </div>
    </div>
  )
}
