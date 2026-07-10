import { useState, useEffect, useRef } from 'react'
import {
  collection, addDoc, updateDoc, doc, query,
  where, onSnapshot, Timestamp, orderBy, setDoc
} from 'firebase/firestore'
import { db } from './firebase'
import { haversineMeters, PROPERTY_COORDS, todayStr } from './data'
import { enqueue, dequeue, listQueue } from './useOfflineQueue'

export interface Shift {
  id: string; crewName: string; lm: string; pin: string
  property: string; date: string; clockIn: Date; clockOut: Date | null
  clockInLat: number | null; clockInLng: number | null
  clockOutLat: number | null; clockOutLng: number | null
  distanceFromProperty: number | null; note: string
  durationMinutes: number | null; breakMinutes: number
}

export interface Break {
  id: string; shiftId: string; crewName: string; date: string
  breakStart: Date; breakEnd: Date | null; breakType: 'lunch' | 'rest'
}

export interface LiveLocation {
  userId: string; userName: string; lm: string; color: string
  lat: number; lng: number; accuracy: number; heading: number | null
  updatedAt: Date; active: boolean; currentProperty: string | null; clockInAt: Date | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromFS(id: string, d: Record<string, any>): Shift {
  return {
    id, crewName: d.crewName, lm: d.lm, pin: d.pin,
    property: d.property, date: d.date,
    clockIn:  (d.clockIn  as Timestamp).toDate(),
    clockOut:  d.clockOut  ? (d.clockOut  as Timestamp).toDate() : null,
    clockInLat:  d.clockInLat  ?? null, clockInLng:  d.clockInLng  ?? null,
    clockOutLat: d.clockOutLat ?? null, clockOutLng: d.clockOutLng ?? null,
    distanceFromProperty: d.distanceFromProperty ?? null,
    note: d.note ?? '', durationMinutes: d.durationMinutes ?? null,
    breakMinutes: d.breakMinutes ?? 0,
  }
}

// ── GPS: low-timeout, non-blocking ────────────────────────────────────────────
// Returns immediately with last known position (maximumAge=60s), or times out in 3s.
// We call this AFTER the Firestore write to patch the record with coords.
function getGpsFast(): Promise<{ lat: number; lng: number; accuracy: number } | null> {
  return new Promise(resolve => {
    if (!navigator.geolocation) { resolve(null); return }
    // First try cached position (instant)
    navigator.geolocation.getCurrentPosition(
      p  => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 3_000 }
    )
  })
}

// Flush IndexedDB outbox on reconnect
async function flushOutbox() {
  const items = await listQueue()
  for (const item of items) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = item.payload as any
      if (item.type === 'clockIn') {
        await addDoc(collection(db, 'timeclock_shifts'), p)
        await dequeue(item.id)
      } else if (item.type === 'clockOut') {
        await updateDoc(doc(db, 'timeclock_shifts', p.shiftId), p.update)
        await dequeue(item.id)
      }
    } catch { /* retry next time */ }
  }
}
window.addEventListener('online', flushOutbox)

// ── Live location writer ───────────────────────────────────────────────────────
export function useLiveLocation(
  pin: string, crewName: string, lm: string, color: string,
  active: boolean, currentProperty: string | null, clockInAt: Date | null
) {
  const watchRef    = useRef<number | null>(null)
  const posRef      = useRef<GeolocationPosition | null>(null)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  const locationId  = `crew_${pin}`

  useEffect(() => {
    if (!active) {
      setDoc(doc(db, 'liveLocations', locationId), { active: false, updatedAt: Timestamp.now() }, { merge: true }).catch(() => {})
      wakeLockRef.current?.release().catch(() => {})
      wakeLockRef.current = null
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current)
      watchRef.current = null
      return
    }

    const requestWL = async () => {
      try { if ('wakeLock' in navigator) wakeLockRef.current = await (navigator as any).wakeLock.request('screen') }
      catch { /* not supported */ }
    }
    requestWL()
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') requestWL()
    })

    watchRef.current = navigator.geolocation.watchPosition(
      pos => { posRef.current = pos },
      () => {},
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 27_000 }
    )

    const flush = async () => {
      const pos = posRef.current
      if (!pos) return
      try {
        await setDoc(doc(db, 'liveLocations', locationId), {
          userId: pin, userName: crewName, lm, color,
          lat: pos.coords.latitude, lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy, heading: pos.coords.heading ?? null,
          updatedAt: Timestamp.now(), active: true, currentProperty,
          clockInAt: clockInAt ? Timestamp.fromDate(clockInAt) : null,
        })
      } catch { /* offline */ }
    }
    flush()
    const iv = setInterval(flush, 30_000)
    return () => {
      clearInterval(iv)
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current)
      watchRef.current = null
      wakeLockRef.current?.release().catch(() => {})
      wakeLockRef.current = null
    }
  }, [active, pin, crewName, lm, color, currentProperty, clockInAt])
}

// ── Crew shifts hook ───────────────────────────────────────────────────────────
export function useCrewShifts(pin: string) {
  const [todayShifts, setTodayShifts] = useState<Shift[]>([])
  const [activeShift, setActiveShift] = useState<Shift | null>(null)
  const [activeBreak, setActiveBreak] = useState<Break | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [clockInStatus, setClockInStatus] = useState<'idle'|'loading'|'success'|'offline'|'error'>('idle')

  useEffect(() => {
    const q = query(collection(db,'timeclock_shifts'), where('pin','==',pin), orderBy('clockIn','desc'))
    return onSnapshot(q, snap => {
      const today  = todayStr()
      const shifts = snap.docs.map(d => fromFS(d.id, d.data())).filter(s => s.date === today)
      setTodayShifts(shifts)
      setActiveShift(shifts.find(s => s.clockOut === null) ?? null)
      setLoading(false)
    }, err => { console.error('shifts:', err.code); setLoading(false) })
  }, [pin])

  useEffect(() => {
    if (!activeShift) { setActiveBreak(null); return }
    const q = query(collection(db,'timeclock_breaks'), where('shiftId','==',activeShift.id))
    return onSnapshot(q, snap => {
      const open = snap.docs.map(d => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = d.data() as Record<string, any>
        return {
          id: d.id, shiftId: data.shiftId, crewName: data.crewName, date: data.date,
          breakStart: (data.breakStart as Timestamp).toDate(),
          breakEnd:   data.breakEnd ? (data.breakEnd as Timestamp).toDate() : null,
          breakType:  data.breakType as 'lunch' | 'rest',
        }
      }).find(b => b.breakEnd === null) ?? null
      setActiveBreak(open)
    })
  }, [activeShift?.id])

  async function clockIn(crewName: string, lm: string, property: string) {
    // ── Step 1: Show loading immediately (sub-50ms) ──────────────────
    setClockInStatus('loading')

    // ── Step 2: Write to Firestore NOW (no GPS wait) ─────────────────
    const payload = {
      crewName, lm, pin, property,
      date: todayStr(), clockIn: Timestamp.now(), clockOut: null,
      clockInLat: null, clockInLng: null,
      clockOutLat: null, clockOutLng: null,
      distanceFromProperty: null,
      note: '', durationMinutes: null, breakMinutes: 0,
    }

    const queueId = await enqueue('clockIn', payload)
    let shiftDocId: string | null = null

    try {
      const ref = await addDoc(collection(db, 'timeclock_shifts'), payload)
      shiftDocId = ref.id
      await dequeue(queueId)
      setClockInStatus('success')
    } catch {
      setClockInStatus('offline')
    }

    // ── Step 3: Haptic feedback ───────────────────────────────────────
    if (navigator.vibrate) navigator.vibrate(60)
    setTimeout(() => setClockInStatus('idle'), 2000)

    // ── Step 4: GPS in background — patches the record asynchronously ─
    if (shiftDocId) {
      getGpsFast().then(async gps => {
        if (!gps || !shiftDocId) return
        const coords = PROPERTY_COORDS[property]
        const distance = coords
          ? Math.round(haversineMeters(gps.lat, gps.lng, coords.lat, coords.lng))
          : null
        try {
          await updateDoc(doc(db, 'timeclock_shifts', shiftDocId), {
            clockInLat: gps.lat, clockInLng: gps.lng,
            distanceFromProperty: distance,
          })
        } catch { /* non-critical */ }
      })
    }
  }

  async function clockOut(note: string) {
    if (!activeShift) return
    const now      = new Date()
    const duration = Math.max(0, Math.round((now.getTime() - activeShift.clockIn.getTime()) / 60000) - activeShift.breakMinutes)
    const update   = { clockOut: Timestamp.now(), clockOutLat: null, clockOutLng: null, note, durationMinutes: duration }

    const queueId = await enqueue('clockOut', { shiftId: activeShift.id, update })
    try {
      await updateDoc(doc(db, 'timeclock_shifts', activeShift.id), update)
      await dequeue(queueId)
    } catch { /* stays in outbox */ }

    // GPS patch for clock-out coords
    getGpsFast().then(async gps => {
      if (!gps) return
      try { await updateDoc(doc(db, 'timeclock_shifts', activeShift.id), { clockOutLat: gps.lat, clockOutLng: gps.lng }) }
      catch { /* non-critical */ }
    })
  }

  async function startBreak(type: 'lunch' | 'rest') {
    if (!activeShift) return
    await addDoc(collection(db, 'timeclock_breaks'), {
      shiftId: activeShift.id, crewName: activeShift.crewName,
      date: todayStr(), breakStart: Timestamp.now(), breakEnd: null, breakType: type,
    })
  }

  async function endBreak() {
    if (!activeBreak || !activeShift) return
    const now      = Timestamp.now()
    const breakMins = Math.round((now.toDate().getTime() - activeBreak.breakStart.getTime()) / 60000)
    await updateDoc(doc(db, 'timeclock_breaks', activeBreak.id), { breakEnd: now })
    await updateDoc(doc(db, 'timeclock_shifts', activeShift.id), { breakMinutes: activeShift.breakMinutes + breakMins })
  }

  const totalMinutes = todayShifts.reduce((sum, s) => {
    if (s.clockOut !== null) return sum + (s.durationMinutes ?? 0)
    return sum + Math.max(0, (Date.now() - s.clockIn.getTime()) / 60000 - s.breakMinutes)
  }, 0)

  return { todayShifts, activeShift, activeBreak, loading, clockIn, clockOut, startBreak, endBreak, totalMinutes, clockInStatus }
}

// ── Live locations (manager) ───────────────────────────────────────────────────
export function useLiveLocations() {
  const [locs, setLocs] = useState<LiveLocation[]>([])
  useEffect(() => {
    const q = query(collection(db, 'liveLocations'), where('active', '==', true))
    return onSnapshot(q, snap => {
      const now = Date.now()
      setLocs(snap.docs.map(d => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const a = d.data() as Record<string, any>
        return {
          userId: a.userId, userName: a.userName, lm: a.lm, color: a.color,
          lat: a.lat, lng: a.lng, accuracy: a.accuracy, heading: a.heading ?? null,
          updatedAt: (a.updatedAt as Timestamp).toDate(), active: a.active,
          currentProperty: a.currentProperty ?? null,
          clockInAt: a.clockInAt ? (a.clockInAt as Timestamp).toDate() : null,
        }
      }).filter(l => now - l.updatedAt.getTime() < 5 * 60_000))
    })
  }, [])
  return locs
}

// ── Manager shifts ─────────────────────────────────────────────────────────────
export function useManagerShifts(date: string) {
  const [shifts, setShifts]   = useState<Shift[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const q = query(collection(db,'timeclock_shifts'), where('date','==',date), orderBy('clockIn','asc'))
    return onSnapshot(q, snap => {
      setShifts(snap.docs.map(d => fromFS(d.id, d.data())))
      setLoading(false)
    }, err => { console.error('manager:', err.code); setLoading(false) })
  }, [date])
  return { shifts, loading }
}
