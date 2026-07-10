import { useState, useEffect, useRef } from 'react'
import {
  collection, addDoc, updateDoc, doc, query,
  where, onSnapshot, Timestamp, orderBy, setDoc
} from 'firebase/firestore'
import { db } from './firebase'
import { haversineMeters, PROPERTY_COORDS, todayStr } from './data'
import { enqueue, dequeue, listQueue } from './useOfflineQueue'

// ─── Types ────────────────────────────────────────────────────────────────────
export interface Shift {
  id: string
  crewName: string
  lm: string
  pin: string
  property: string
  date: string
  clockIn: Date
  clockOut: Date | null
  clockInLat: number | null
  clockInLng: number | null
  clockOutLat: number | null
  clockOutLng: number | null
  distanceFromProperty: number | null
  note: string
  durationMinutes: number | null
  breakMinutes: number
}

export interface Break {
  id: string
  shiftId: string
  crewName: string
  date: string
  breakStart: Date
  breakEnd: Date | null
  breakType: 'lunch' | 'rest'
}

export interface LiveLocation {
  userId: string
  userName: string
  lm: string
  color: string
  lat: number
  lng: number
  accuracy: number
  heading: number | null
  updatedAt: Date
  active: boolean
  currentProperty: string | null
  clockInAt: Date | null
}

// ─── Firestore helpers ────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromFirestore(id: string, data: Record<string, any>): Shift {
  return {
    id,
    crewName:             data.crewName,
    lm:                   data.lm,
    pin:                  data.pin,
    property:             data.property,
    date:                 data.date,
    clockIn:              (data.clockIn as Timestamp).toDate(),
    clockOut:             data.clockOut ? (data.clockOut as Timestamp).toDate() : null,
    clockInLat:           data.clockInLat  ?? null,
    clockInLng:           data.clockInLng  ?? null,
    clockOutLat:          data.clockOutLat ?? null,
    clockOutLng:          data.clockOutLng ?? null,
    distanceFromProperty: data.distanceFromProperty ?? null,
    note:                 data.note        ?? '',
    durationMinutes:      data.durationMinutes ?? null,
    breakMinutes:         data.breakMinutes    ?? 0,
  }
}

async function getGps(): Promise<{ lat: number; lng: number; accuracy: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return }
    navigator.geolocation.getCurrentPosition(
      p  => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => resolve(null),
      { timeout: 8000, enableHighAccuracy: true }
    )
  })
}

// ─── Flush IndexedDB outbox when back online ─────────────────────────────────
async function flushOutbox() {
  const items = await listQueue()
  for (const item of items) {
    try {
      // re-attempt: only clock-in/out types stored here
      if (item.type === 'clockIn') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = item.payload as any
        await addDoc(collection(db, 'timeclock_shifts'), p)
        await dequeue(item.id)
      } else if (item.type === 'clockOut') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = item.payload as any
        await updateDoc(doc(db, 'timeclock_shifts', p.shiftId), p.update)
        await dequeue(item.id)
      }
    } catch {
      // leave in queue, retry next time
    }
  }
}

window.addEventListener('online', flushOutbox)

// ─── Live location writer ─────────────────────────────────────────────────────
export function useLiveLocation(
  pin: string,
  crewName: string,
  lm: string,
  color: string,
  active: boolean,
  currentProperty: string | null,
  clockInAt: Date | null
) {
  const watchRef   = useRef<number | null>(null)
  const posRef     = useRef<GeolocationPosition | null>(null)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)

  useEffect(() => {
    const locationDocId = `crew_${pin}`

    if (!active) {
      // Mark offline in Firestore
      setDoc(doc(db, 'liveLocations', locationDocId), { active: false, updatedAt: Timestamp.now() }, { merge: true }).catch(() => {})
      // Release wake lock
      wakeLockRef.current?.release().catch(() => {})
      wakeLockRef.current = null
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current)
      watchRef.current = null
      return
    }

    // Request wake lock to keep screen on while clocked in
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request('screen')
        }
      } catch { /* not supported or denied */ }
    }
    requestWakeLock()

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') requestWakeLock()
    })

    // Start GPS watch
    watchRef.current = navigator.geolocation.watchPosition(
      pos => { posRef.current = pos },
      () => {},
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 27000 }
    )

    // Throttle Firestore writes to every 30s
    const flush = async () => {
      const pos = posRef.current
      if (!pos) return
      try {
        await setDoc(doc(db, 'liveLocations', locationDocId), {
          userId:          pin,
          userName:        crewName,
          lm,
          color,
          lat:             pos.coords.latitude,
          lng:             pos.coords.longitude,
          accuracy:        pos.coords.accuracy,
          heading:         pos.coords.heading ?? null,
          updatedAt:       Timestamp.now(),
          active:          true,
          currentProperty,
          clockInAt:       clockInAt ? Timestamp.fromDate(clockInAt) : null,
        })
      } catch { /* offline — ignore, outbox handles clock events */ }
    }

    flush() // immediate write on clock-in
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

// ─── Crew shifts hook ─────────────────────────────────────────────────────────
export function useCrewShifts(pin: string) {
  const [todayShifts, setTodayShifts]   = useState<Shift[]>([])
  const [activeShift, setActiveShift]   = useState<Shift | null>(null)
  const [activeBreak, setActiveBreak]   = useState<Break | null>(null)
  const [loading, setLoading]           = useState(true)
  const [clockInStatus, setClockInStatus] = useState<'idle' | 'loading' | 'success' | 'offline' | 'error'>('idle')

  // Shifts subscription — no composite index: filter date client-side
  useEffect(() => {
    const q = query(
      collection(db, 'timeclock_shifts'),
      where('pin', '==', pin),
      orderBy('clockIn', 'desc')
    )
    const unsub = onSnapshot(q, snap => {
      const today  = todayStr()
      const shifts = snap.docs
        .map(d => fromFirestore(d.id, d.data()))
        .filter(s => s.date === today)
      setTodayShifts(shifts)
      setActiveShift(shifts.find(s => s.clockOut === null) ?? null)
      setLoading(false)
    }, err => {
      console.error('shifts:', err.code, err.message)
      setLoading(false)
    })
    return unsub
  }, [pin])

  // Active break subscription
  useEffect(() => {
    if (!activeShift) { setActiveBreak(null); return }
    const q = query(collection(db, 'timeclock_breaks'), where('shiftId', '==', activeShift.id))
    const unsub = onSnapshot(q, snap => {
      const open = snap.docs
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map(d => { const data = d.data() as Record<string, any>; return {
          id:        d.id,
          shiftId:   data.shiftId,
          crewName:  data.crewName,
          date:      data.date,
          breakStart:(data.breakStart as Timestamp).toDate(),
          breakEnd:  data.breakEnd ? (data.breakEnd as Timestamp).toDate() : null,
          breakType: data.breakType as 'lunch' | 'rest',
        }})
        .find(b => b.breakEnd === null) ?? null
      setActiveBreak(open)
    })
    return unsub
  }, [activeShift?.id])

  async function clockIn(crewName: string, lm: string, property: string) {
    setClockInStatus('loading')
    const gps    = await getGps()
    const coords = PROPERTY_COORDS[property]
    const distance = gps && coords
      ? Math.round(haversineMeters(gps.lat, gps.lng, coords.lat, coords.lng))
      : null

    const payload = {
      crewName, lm, pin, property,
      date:                 todayStr(),
      clockIn:              Timestamp.now(),
      clockOut:             null,
      clockInLat:           gps?.lat  ?? null,
      clockInLng:           gps?.lng  ?? null,
      clockOutLat:          null,
      clockOutLng:          null,
      distanceFromProperty: distance,
      note:                 '',
      durationMinutes:      null,
      breakMinutes:         0,
    }

    // Enqueue in IndexedDB first (durability guarantee)
    const queueId = await enqueue('clockIn', payload)
    try {
      await addDoc(collection(db, 'timeclock_shifts'), payload)
      await dequeue(queueId)   // remove from outbox on success
      setClockInStatus('success')
    } catch {
      setClockInStatus('offline') // stays in outbox, will sync
    }
    // Vibrate on Android for haptic confirmation
    if (navigator.vibrate) navigator.vibrate(60)
    setTimeout(() => setClockInStatus('idle'), 2000)
  }

  async function clockOut(note: string) {
    if (!activeShift) return
    const gps = await getGps()
    const now  = new Date()
    const duration = Math.max(0, Math.round((now.getTime() - activeShift.clockIn.getTime()) / 60000) - activeShift.breakMinutes)

    const update = {
      clockOut:    Timestamp.now(),
      clockOutLat: gps?.lat ?? null,
      clockOutLng: gps?.lng ?? null,
      note,
      durationMinutes: duration,
    }

    const queueId = await enqueue('clockOut', { shiftId: activeShift.id, update })
    try {
      await updateDoc(doc(db, 'timeclock_shifts', activeShift.id), update)
      await dequeue(queueId)
    } catch { /* stays in outbox */ }
  }

  async function startBreak(type: 'lunch' | 'rest') {
    if (!activeShift) return
    await addDoc(collection(db, 'timeclock_breaks'), {
      shiftId:    activeShift.id,
      crewName:   activeShift.crewName,
      date:       todayStr(),
      breakStart: Timestamp.now(),
      breakEnd:   null,
      breakType:  type,
    })
  }

  async function endBreak() {
    if (!activeBreak || !activeShift) return
    const now      = Timestamp.now()
    const breakMins = Math.round((now.toDate().getTime() - activeBreak.breakStart.getTime()) / 60000)
    await updateDoc(doc(db, 'timeclock_breaks', activeBreak.id), { breakEnd: now })
    await updateDoc(doc(db, 'timeclock_shifts', activeShift.id), {
      breakMinutes: activeShift.breakMinutes + breakMins,
    })
  }

  const totalMinutes = todayShifts.reduce((sum, s) => {
    if (s.clockOut !== null) return sum + (s.durationMinutes ?? 0)
    return sum + Math.max(0, (Date.now() - s.clockIn.getTime()) / 60000 - s.breakMinutes)
  }, 0)

  return {
    todayShifts, activeShift, activeBreak, loading,
    clockIn, clockOut, startBreak, endBreak, totalMinutes, clockInStatus,
  }
}

// ─── Manager live locations ───────────────────────────────────────────────────
export function useLiveLocations() {
  const [locations, setLocations] = useState<LiveLocation[]>([])

  useEffect(() => {
    const q = query(collection(db, 'liveLocations'), where('active', '==', true))
    const unsub = onSnapshot(q, snap => {
      const now = Date.now()
      setLocations(
        snap.docs
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map(d => { const data = d.data() as Record<string, any>; return {
            userId:          data.userId,
            userName:        data.userName,
            lm:              data.lm,
            color:           data.color,
            lat:             data.lat,
            lng:             data.lng,
            accuracy:        data.accuracy,
            heading:         data.heading ?? null,
            updatedAt:       (data.updatedAt as Timestamp).toDate(),
            active:          data.active,
            currentProperty: data.currentProperty ?? null,
            clockInAt:       data.clockInAt ? (data.clockInAt as Timestamp).toDate() : null,
          }})
          .filter(l => now - l.updatedAt.getTime() < 5 * 60 * 1000) // stale > 5 min = hide
      )
    })
    return unsub
  }, [])

  return locations
}

// ─── Manager shifts hook ──────────────────────────────────────────────────────
export function useManagerShifts(date: string) {
  const [shifts,  setShifts]  = useState<Shift[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = query(
      collection(db, 'timeclock_shifts'),
      where('date', '==', date),
      orderBy('clockIn', 'asc')
    )
    const unsub = onSnapshot(q, snap => {
      setShifts(snap.docs.map(d => fromFirestore(d.id, d.data())))
      setLoading(false)
    }, err => {
      console.error('manager shifts:', err.code, err.message)
      setLoading(false)
    })
    return unsub
  }, [date])

  return { shifts, loading }
}
