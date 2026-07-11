import { useState, useEffect } from 'react'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '../lib/firebase'
import {
  CrewMember, ALL_PROPERTIES, getScheduledProperty, parseStops,
  formatTime, formatDuration, fmtSecs, PROPERTY_COORDS,
  isIos, getNavigateUrl, todayStr,
} from '../lib/data'
import { useCrewShifts, useLiveLocation } from '../lib/useShifts'
import { InAppNav } from './InAppNav'

interface Props { crew: CrewMember; onLogout: () => void }

// Property code from name (e.g. "Sienna Cove" → "AMH3745", fallback short label)
const PROP_CODES: Record<string,string> = {
  'Sienna Cove':'AMH3745','Wilder Meadow':'BWG4503','Woodlake Preserve':'AMH2281',
  'Bridge Haven':'AMH3104','Altera':'AMH3104','Walden Pond':'AMH3104','Walden Woods':'AMH3104',
  'Willow Walk':'AMH5612','Golden Meadow':'AMH4812','Cheyenne Preserve':'AMH6001',
  'Cedar Mills':'AMH7234','Birchwood':'AMH8891','Trotters Crossing':'AMH9204',
  'Belmont Glen':'AMH4356','Victory Landing':'AMH5500','Spring Rose':'AMH3090',
  'Boyette':'AMH6788','Bell Lake':'AMH7712','Camden Woods':'AMH4266','Office / Yard':'YARD',
}
function propCode(name: string) { return PROP_CODES[name] || name.slice(0,6).toUpperCase() }

// ── Navigate sheet ────────────────────────────────────────────────────────────
function NavigateSheet({ property, onInApp, onClose }: {
  property: string; onInApp: () => void; onClose: () => void
}) {
  return (
    <div style={{ position:'fixed',inset:0,zIndex:40,display:'flex',flexDirection:'column',justifyContent:'flex-end' }}
      onClick={onClose}>
      <div style={{ position:'absolute',inset:0,background:'rgba(0,0,0,.4)' }} />
      <div className="slide-up" onClick={e => e.stopPropagation()}
        style={{ position:'relative',background:'var(--surface)',borderRadius:'24px 24px 0 0',
                 padding:'20px 16px',paddingBottom:'max(env(safe-area-inset-bottom,0px),20px)' }}>
        <div style={{ width:36,height:4,borderRadius:2,background:'var(--border)',margin:'0 auto 16px' }} />
        <p style={{ textAlign:'center',fontWeight:700,fontSize:15,marginBottom:16,color:'var(--text-1)' }}>
          Navigate to {property}
        </p>
        <div style={{ display:'flex',flexDirection:'column',gap:10 }}>
          <button onClick={() => { onInApp(); onClose() }} style={{
            height:54,borderRadius:'var(--radius)',background:'var(--green-dark)',color:'#fff',
            border:'none',fontSize:15,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',gap:8,
          }}>🧭 In-App Navigation</button>
          <a href={getNavigateUrl(property,'google')} target="_blank" rel="noopener noreferrer"
            onClick={onClose} style={{
              height:54,borderRadius:'var(--radius)',background:'#F3F4F6',color:'var(--text-1)',
              border:'none',fontSize:15,fontWeight:600,display:'flex',alignItems:'center',justifyContent:'center',
              textDecoration:'none',
            }}>🗺 Google Maps</a>
          <a href={getNavigateUrl(property,'waze')} target="_blank" rel="noopener noreferrer"
            onClick={onClose} style={{
              height:54,borderRadius:'var(--radius)',background:'#F3F4F6',color:'var(--text-1)',
              border:'none',fontSize:15,fontWeight:600,display:'flex',alignItems:'center',justifyContent:'center',
              textDecoration:'none',
            }}>🔵 Waze</a>
          {isIos() && (
            <a href={getNavigateUrl(property,'apple')} target="_blank" rel="noopener noreferrer"
              onClick={onClose} style={{
                height:54,borderRadius:'var(--radius)',background:'#F3F4F6',color:'var(--text-1)',
                border:'none',fontSize:15,fontWeight:600,display:'flex',alignItems:'center',justifyContent:'center',
                textDecoration:'none',
              }}>🍎 Apple Maps</a>
          )}
        </div>
        <button onClick={onClose} style={{
          width:'100%',height:48,marginTop:8,background:'none',border:'none',
          fontSize:14,fontWeight:600,color:'var(--text-3)',
        }}>Cancel</button>
      </div>
    </div>
  )
}

// ── Break sheet ───────────────────────────────────────────────────────────────
function BreakSheet({ onStart, onClose }: {
  onStart: (t:'lunch'|'rest') => void; onClose: () => void
}) {
  return (
    <div style={{ position:'fixed',inset:0,zIndex:40,display:'flex',flexDirection:'column',justifyContent:'flex-end' }}
      onClick={onClose}>
      <div style={{ position:'absolute',inset:0,background:'rgba(0,0,0,.4)' }} />
      <div className="slide-up" onClick={e => e.stopPropagation()}
        style={{ position:'relative',background:'var(--surface)',borderRadius:'24px 24px 0 0',
                 padding:'20px 16px',paddingBottom:'max(env(safe-area-inset-bottom,0px),20px)' }}>
        <div style={{ width:36,height:4,borderRadius:2,background:'var(--border)',margin:'0 auto 16px' }} />
        <p style={{ textAlign:'center',fontWeight:700,fontSize:15,marginBottom:16 }}>Start Break</p>
        <div style={{ display:'flex',flexDirection:'column',gap:10 }}>
          <button onClick={() => { onStart('lunch'); onClose() }} style={{
            height:60,borderRadius:'var(--radius)',background:'#FEF9C3',color:'#854D0E',
            border:'none',fontSize:16,fontWeight:700,
          }}>🍽 Lunch Break — 30 min</button>
          <button onClick={() => { onStart('rest'); onClose() }} style={{
            height:60,borderRadius:'var(--radius)',background:'#EFF6FF',color:'#1E40AF',
            border:'none',fontSize:16,fontWeight:700,
          }}>☕ Rest Break — 15 min</button>
        </div>
        <button onClick={onClose} style={{
          width:'100%',height:48,marginTop:8,background:'none',border:'none',
          fontSize:14,fontWeight:600,color:'var(--text-3)',
        }}>Cancel</button>
      </div>
    </div>
  )
}

// ── Main dashboard ────────────────────────────────────────────────────────────
export function CrewDashboard({ crew, onLogout }: Props) {
  const {
    todayShifts, activeShift, activeBreak, loading,
    clockIn, clockOut, startBreak, endBreak,
    totalMinutes, clockInStatus,
  } = useCrewShifts(crew.pin)

  const [dispatchedStops, setDispatchedStops] = useState<string[] | null>(null)
  useEffect(() => {
    const q = query(collection(db,'dispatchRoutes'), where('crewPin','==',crew.pin), where('date','==',todayStr()))
    return onSnapshot(q, snap => {
      if (!snap.empty) setDispatchedStops(snap.docs[0].data().stops ?? [])
      else setDispatchedStops(null)
    })
  }, [crew.pin])

  const scheduledProp = getScheduledProperty(crew.name)
  const todayStops = dispatchedStops ?? (scheduledProp ? parseStops(scheduledProp) : [])

  const [selectedProp, setSelectedProp] = useState<string>(todayStops[0] ?? ALL_PROPERTIES[0])
  const [elapsed,      setElapsed]      = useState(0)
  const [breakElapsed, setBreakElapsed] = useState(0)
  const [notes,        setNotes]        = useState('')
  const [sheet,        setSheet]        = useState<'none'|'navigate'|'break'>('none')
  const [inAppNav,     setInAppNav]     = useState(false)
  const [gpsWarning,   setGpsWarning]   = useState<string|null>(null)
  const [clkOutBusy,   setClkOutBusy]  = useState(false)

  useEffect(() => {
    if (todayStops.length > 0 && !todayStops.includes(selectedProp))
      setSelectedProp(todayStops[0])
  }, [dispatchedStops])

  useLiveLocation(crew.pin, crew.name, crew.lm, crew.color,
    !!activeShift, activeShift?.property ?? null, activeShift?.clockIn ?? null)

  useEffect(() => {
    if (!activeShift || activeBreak) return
    const tick = () => setElapsed(Math.max(0,
      Math.floor((Date.now() - activeShift.clockIn.getTime()) / 1000) - activeShift.breakMinutes * 60
    ))
    tick(); const iv = setInterval(tick, 1000); return () => clearInterval(iv)
  }, [activeShift?.id, activeBreak])

  useEffect(() => {
    if (!activeBreak) return
    const tick = () => setBreakElapsed(Math.floor((Date.now() - activeBreak.breakStart.getTime()) / 1000))
    tick(); const iv = setInterval(tick, 1000); return () => clearInterval(iv)
  }, [activeBreak?.id])

  useEffect(() => {
    if (!activeShift) { setGpsWarning(null); return }
    const dist = activeShift.distanceFromProperty
    if (dist === null) return
    if      (dist > 2000) setGpsWarning(`🔴 ${dist}m from ${activeShift.property}`)
    else if (dist > 500)  setGpsWarning(`⚠️ ${dist}m from ${activeShift.property}`)
    else                  setGpsWarning(null)
  }, [activeShift?.distanceFromProperty])

  async function handleClockOut() {
    setClkOutBusy(true)
    await clockOut(notes)
    setClkOutBusy(false)
    setNotes('')
    if (activeShift && todayStops.length > 1) {
      const justDone = activeShift.property
      const next = todayStops.find(s =>
        s !== justDone && !todayShifts.some(sh => sh.property === s && sh.clockOut !== null)
      )
      if (next) setSelectedProp(next)
    }
  }

  const isClockedIn = !!activeShift && !activeShift.clockOut
  const isOnBreak   = !!activeBreak

  if (inAppNav) return <InAppNav destination={activeShift?.property ?? selectedProp} onClose={() => setInAppNav(false)} />

  if (loading) return (
    <div style={{ minHeight:'100dvh',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--bg)' }}>
      <p style={{ color:'var(--text-3)',fontSize:14 }}>Loading…</p>
    </div>
  )

  const today = new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})

  // GPS status indicator
  const gpsActive = !!activeShift

  return (
    <div style={{ minHeight:'100dvh',background:'var(--bg)',display:'flex',flexDirection:'column',
                  fontFamily:'-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",sans-serif' }}>

      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <div style={{ background:'var(--bg)',borderBottom:'1px solid var(--border)',
                    padding:'12px 16px',paddingTop:'max(env(safe-area-inset-top,0px),12px)',
                    display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0 }}>
        <div style={{ display:'flex',alignItems:'center',gap:10 }}>
          <div style={{ width:32,height:32,borderRadius:'50%',
                        background:'conic-gradient(#FF6B6B,#FFE66D,#4ECDC4,#A8E063,#FF6B6B)',
                        display:'flex',alignItems:'center',justifyContent:'center' }}>
            <div style={{ width:22,height:22,borderRadius:'50%',background:'var(--bg)' }} />
          </div>
          <div>
            <div style={{ fontSize:13,fontWeight:700,color:'var(--text-1)',lineHeight:1 }}>Cornerstone</div>
            <div style={{ fontSize:11,fontWeight:500,color:'var(--text-3)',letterSpacing:'.05em',textTransform:'uppercase' }}>Time Clock</div>
          </div>
        </div>
        <div style={{ display:'flex',alignItems:'center',gap:6,background:gpsActive?'#DCFCE7':'#F0F0F0',
                      borderRadius:20,padding:'4px 10px' }}>
          <div style={{ width:6,height:6,borderRadius:'50%',background:gpsActive?'#16A34A':'#A0A0A0' }} />
          <span style={{ fontSize:11,fontWeight:600,color:gpsActive?'#15803D':'var(--text-3)' }}>
            {gpsActive ? 'GPS on' : 'GPS off'}
          </span>
        </div>
      </div>

      {/* ── Scrollable body ───────────────────────────────────────────── */}
      <div style={{ flex:1,overflowY:'auto',padding:'12px 16px',paddingBottom:isClockedIn?180:140,display:'flex',flexDirection:'column',gap:12 }}>

        {/* Identity card */}
        <div style={{ background:'var(--surface)',borderRadius:'var(--radius)',
                      border:'1px solid var(--border)',boxShadow:'var(--shadow)',
                      padding:'14px 16px',display:'flex',alignItems:'center',gap:14 }}>
          <div className="crew-avatar" style={{ background:crew.color,color:crew.textColor??'#fff' }}>
            {crew.lm}
          </div>
          <div>
            <div style={{ fontSize:11,fontWeight:600,color:'var(--text-3)',letterSpacing:'.05em',textTransform:'uppercase' }}>Signed in as</div>
            <div style={{ fontSize:22,fontWeight:700,color:'var(--text-1)',lineHeight:1.2 }}>{crew.name}</div>
            <div style={{ fontSize:13,color:'var(--text-2)' }}>Crew Leader · {crew.lm}</div>
          </div>
        </div>

        {/* GPS warning */}
        {gpsWarning && (
          <div style={{ background:'#FEF9C3',border:'1px solid #FEF08A',borderRadius:'var(--radius-sm)',
                        padding:'10px 14px',fontSize:13,color:'#854D0E',fontWeight:500 }}>
            {gpsWarning}
          </div>
        )}

        {/* Status card */}
        {isClockedIn ? (
          /* ── ON CLOCK card ─────────────────────────────────────── */
          <div className="fade-in" style={{ background:isOnBreak?'#D97706':'var(--green-dark)',
                                            borderRadius:'var(--radius)',padding:'20px 20px 20px',
                                            boxShadow:'var(--shadow-md)' }}>
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8 }}>
              <span className="label-sm" style={{ color:'rgba(255,255,255,.7)' }}>
                {isOnBreak ? `${activeBreak!.breakType} break` : 'On Clock'}
              </span>
              <span style={{ fontSize:13,color:'rgba(255,255,255,.6)',fontWeight:500 }}>
                since {formatTime(activeShift.clockIn)}
              </span>
            </div>
            {/* Big timer */}
            <div style={{ fontSize:56,fontWeight:700,color:'#fff',letterSpacing:'-1px',
                          fontVariantNumeric:'tabular-nums',lineHeight:1,marginBottom:8 }}>
              {fmtSecs(isOnBreak ? breakElapsed : elapsed)}
            </div>
            {/* Property + code badge + live dot */}
            <div style={{ display:'flex',alignItems:'center',gap:8,flexWrap:'wrap' }}>
              <span style={{ fontSize:14,color:'rgba(255,255,255,.9)',fontWeight:500 }}>
                At {activeShift.property}
              </span>
              <span style={{ background:'rgba(255,255,255,.25)',borderRadius:6,
                             padding:'2px 8px',fontSize:11,fontWeight:700,color:'#fff' }}>
                {propCode(activeShift.property)}
              </span>
              <div style={{ display:'flex',alignItems:'center',gap:4 }}>
                <div style={{ width:6,height:6,borderRadius:'50%',background:'#86EFAC' }} />
                <span style={{ fontSize:11,fontWeight:600,color:'rgba(255,255,255,.7)' }}>LIVE</span>
              </div>
            </div>
            {activeShift.breakMinutes > 0 && (
              <div style={{ fontSize:12,color:'rgba(255,255,255,.5)',marginTop:4 }}>
                {activeShift.breakMinutes}m break deducted
              </div>
            )}

            {/* Navigate row */}
            <button onClick={() => setSheet('navigate')} style={{
              width:'100%',height:44,marginTop:16,
              background:'rgba(255,255,255,.2)',border:'none',
              borderRadius:'var(--radius-sm)',color:'#fff',fontSize:14,fontWeight:600,
              display:'flex',alignItems:'center',justifyContent:'center',gap:6,
            }}>
              <span>🧭</span> Navigate to {activeShift.property}
            </button>

            {/* Break button (when not on break) */}
            {!isOnBreak && (
              <button onClick={() => setSheet('break')} style={{
                width:'100%',height:40,marginTop:8,
                background:'rgba(255,255,255,.15)',border:'none',
                borderRadius:'var(--radius-sm)',color:'rgba(255,255,255,.85)',
                fontSize:13,fontWeight:600,
                display:'flex',alignItems:'center',justifyContent:'center',gap:6,
              }}>☕ Start Break</button>
            )}
            {isOnBreak && (
              <button onClick={endBreak} style={{
                width:'100%',height:44,marginTop:8,
                background:'rgba(255,255,255,.95)',border:'none',
                borderRadius:'var(--radius-sm)',color:'#D97706',fontSize:15,fontWeight:700,
              }}>End Break</button>
            )}
          </div>
        ) : (
          /* ── OFF CLOCK card ────────────────────────────────────── */
          <div className="status-card-off fade-in" style={{ padding:'20px' }}>
            <div className="label-sm" style={{ textAlign:'center',marginBottom:6 }}>Status</div>
            <div style={{ fontSize:36,fontWeight:800,color:'var(--text-1)',textAlign:'center',
                          letterSpacing:'-1px',lineHeight:1 }}>OFF CLOCK</div>
            <div style={{ fontSize:13,color:'var(--text-3)',textAlign:'center',marginTop:6 }}>
              Pick a property below to clock in
            </div>
          </div>
        )}

        {/* Notes field (visible when clocked in) */}
        {isClockedIn && (
          <div className="fade-in">
            <div className="label-sm" style={{ marginBottom:8 }}>Notes (optional)</div>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Anything notable from this shift?"
              rows={3}
              style={{ width:'100%',borderRadius:'var(--radius-sm)',border:'1px solid var(--border)',
                       background:'var(--surface)',padding:'12px 14px',fontSize:14,resize:'none',
                       outline:'none',color:'var(--text-1)',fontFamily:'inherit',boxSizing:'border-box' }} />
          </div>
        )}

        {/* Property selector (when not clocked in) */}
        {!isClockedIn && (
          <div className="fade-in">
            <div className="label-sm" style={{ marginBottom:8 }}>Where are you working today?</div>
            <div style={{ position:'relative' }}>
              <select value={selectedProp} onChange={e => setSelectedProp(e.target.value)}
                style={{ width:'100%',height:52,borderRadius:'var(--radius-sm)',
                         border:'1px solid var(--border)',background:'var(--surface)',
                         padding:'0 40px 0 14px',fontSize:15,fontWeight:500,
                         color:'var(--text-1)',appearance:'none',outline:'none',
                         boxShadow:'var(--shadow)',cursor:'pointer' }}>
                {todayStops.length > 0 && (
                  <optgroup label="Today's Route">
                    {todayStops.map(p => (
                      <option key={p} value={p}>
                        {p} • {propCode(p)}
                        {todayShifts.some(s => s.property === p && s.clockOut !== null) ? ' ✓' : ''}
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="All Properties">
                  {ALL_PROPERTIES.filter(p => !todayStops.includes(p)).map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </optgroup>
              </select>
              <div style={{ position:'absolute',right:14,top:'50%',transform:'translateY(-50%)',
                            pointerEvents:'none',color:'var(--text-3)',fontSize:12 }}>▼</div>
            </div>
          </div>
        )}

        {/* Today's shifts history */}
        <div>
          <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8 }}>
            <div className="label-sm">Today's Shifts</div>
            <div style={{ fontSize:13,fontWeight:600,color:'var(--text-2)' }}>
              {formatDuration(totalMinutes)} hrs
            </div>
          </div>
          {todayShifts.length === 0 ? (
            <div style={{ background:'var(--surface)',borderRadius:'var(--radius-sm)',
                          border:'1px dashed var(--border)',padding:'24px',textAlign:'center' }}>
              <div style={{ fontSize:14,fontWeight:600,color:'var(--text-2)' }}>No shifts yet today</div>
              <div style={{ fontSize:13,color:'var(--text-3)',marginTop:4 }}>
                Tap CLOCK IN below to start tracking time
              </div>
            </div>
          ) : (
            <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
              {todayShifts.map(s => (
                <div key={s.id} style={{ background:'var(--surface)',borderRadius:'var(--radius-sm)',
                                         border:'1px solid var(--border)',padding:'12px 14px',
                                         display:'flex',justifyContent:'space-between',alignItems:'center' }}>
                  <div>
                    <div style={{ display:'flex',alignItems:'center',gap:8 }}>
                      <span style={{ fontSize:14,fontWeight:600,color:'var(--text-1)' }}>{s.property}</span>
                      <span style={{ background:'var(--bg)',borderRadius:4,padding:'1px 6px',
                                     fontSize:11,fontWeight:600,color:'var(--text-3)' }}>
                        {propCode(s.property)}
                      </span>
                    </div>
                    <div style={{ fontSize:12,color:'var(--text-3)',marginTop:2 }}>
                      {formatTime(s.clockIn)} → {s.clockOut ? formatTime(s.clockOut) : '–'}
                      {s.breakMinutes > 0 && ` · ${s.breakMinutes}m break`}
                    </div>
                    {s.note && <div style={{ fontSize:12,color:'var(--text-3)',fontStyle:'italic',marginTop:2 }}>"{s.note}"</div>}
                  </div>
                  <div style={{ fontSize:14,fontWeight:700,color:'var(--text-1)',textAlign:'right' }}>
                    {s.durationMinutes !== null ? `${(s.durationMinutes/60).toFixed(2)}` : (
                      s.clockOut ? '–' : <span style={{ color:'var(--green-dark)' }}>●</span>
                    )}
                    {s.durationMinutes !== null && <div style={{ fontSize:11,color:'var(--text-3)',fontWeight:500 }}>hrs</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Fixed bottom bar ─────────────────────────────────────────── */}
      <div className="cta-bar">
        {isClockedIn ? (
          <>
            <button onClick={handleClockOut} disabled={clkOutBusy || isOnBreak}
              className="btn-primary btn-clock-out"
              style={{ opacity: isOnBreak ? 0.5 : 1 }}>
              <span style={{ fontSize:18 }}>⊖</span>
              {clkOutBusy ? 'Saving…' : 'CLOCK OUT'}
            </button>
            <button onClick={onLogout} className="btn-secondary" style={{ letterSpacing:'.05em' }}>
              SIGN OUT
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => clockIn(crew.name, crew.lm, selectedProp)}
              disabled={clockInStatus === 'loading'}
              className="btn-primary btn-clock-in">
              {clockInStatus === 'loading' ? (
                <span style={{ display:'flex',alignItems:'center',gap:8 }}>
                  <span style={{ width:16,height:16,border:'2px solid rgba(255,255,255,.3)',
                                 borderTopColor:'#fff',borderRadius:'50%',animation:'spin .7s linear infinite' }} />
                  Clocking in…
                </span>
              ) : clockInStatus === 'success' ? '✓ Clocked In!'
                : clockInStatus === 'offline' ? '📶 Saved offline'
                : <><span style={{ fontSize:17 }}>🕐</span> CLOCK IN</>
              }
            </button>
            <button onClick={onLogout} className="btn-secondary" style={{ letterSpacing:'.05em' }}>
              SIGN OUT
            </button>
          </>
        )}
      </div>

      {/* Sheets */}
      {sheet === 'navigate' && (
        <NavigateSheet property={activeShift?.property ?? selectedProp}
          onInApp={() => setInAppNav(true)} onClose={() => setSheet('none')} />
      )}
      {sheet === 'break' && (
        <BreakSheet onStart={startBreak} onClose={() => setSheet('none')} />
      )}
    </div>
  )
}
