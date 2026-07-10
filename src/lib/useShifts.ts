import { useState, useEffect } from 'react'
import {
  collection, addDoc, updateDoc, doc, query, where,
  onSnapshot, Timestamp, orderBy
} from 'firebase/firestore'
import { db } from './firebase'
import { haversineMeters, PROPERTY_COORDS, todayStr } from './data'

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromFirestore(id: string, data: Record<string, any>): Shift {
  return {
    id,
    crewName: data.crewName,
    lm: data.lm,
    pin: data.pin,
    property: data.property,
    date: data.date,
    clockIn: (data.clockIn as Timestamp).toDate(),
    clockOut: data.clockOut ? (data.clockOut as Timestamp).toDate() : null,
    clockInLat: data.clockInLat ?? null,
    clockInLng: data.clockInLng ?? null,
    clockOutLat: data.clockOutLat ?? null,
    clockOutLng: data.clockOutLng ?? null,
    distanceFromProperty: data.distanceFromProperty ?? null,
    note: data.note ?? '',
    durationMinutes: data.durationMinutes ?? null,
    breakMinutes: data.breakMinutes ?? 0,
  }
}

async function getGps(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return }
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { timeout: 8000 }
    )
  })
}

export function useCrewShifts(pin: string) {
  const [todayShifts, setTodayShifts] = useState<Shift[]>([])
  const [activeShift, setActiveShift] = useState<Shift | null>(null)
  const [activeBreak, setActiveBreak] = useState<Break | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Single-field query only — no composite index needed
    // Filter by pin only, then filter date client-side
    const q = query(
      collection(db, 'timeclock_shifts'),
      where('pin', '==', pin),
      orderBy('clockIn', 'desc')
    )
    const unsub = onSnapshot(q, (snap) => {
      const today = todayStr()
      const shifts = snap.docs
        .map(d => fromFirestore(d.id, d.data()))
        .filter(s => s.date === today)           // filter date client-side
      setTodayShifts(shifts)
      setActiveShift(shifts.find(s => s.clockOut === null) ?? null)
      setLoading(false)
    }, (err) => {
      console.error('Firestore shifts error:', err.code, err.message)
      setLoading(false)
    })
    return unsub
  }, [pin])

  useEffect(() => {
    if (!activeShift) { setActiveBreak(null); return }
    const q = query(
      collection(db, 'timeclock_breaks'),
      where('shiftId', '==', activeShift.id)
    )
    const unsub = onSnapshot(q, (snap) => {
      const openBreak = snap.docs
        .map(d => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const data = d.data() as Record<string, any>
          return {
            id: d.id,
            shiftId: data.shiftId,
            crewName: data.crewName,
            date: data.date,
            breakStart: (data.breakStart as Timestamp).toDate(),
            breakEnd: data.breakEnd ? (data.breakEnd as Timestamp).toDate() : null,
            breakType: data.breakType as 'lunch' | 'rest',
          }
        })
        .find(b => b.breakEnd === null) ?? null
      setActiveBreak(openBreak)
    }, (err) => {
      console.error('Firestore breaks error:', err.code, err.message)
    })
    return unsub
  }, [activeShift?.id])

  async function clockIn(crewName: string, lm: string, property: string) {
    const gps = await getGps()
    const coords = PROPERTY_COORDS[property]
    const distance = gps && coords
      ? Math.round(haversineMeters(gps.lat, gps.lng, coords.lat, coords.lng))
      : null

    await addDoc(collection(db, 'timeclock_shifts'), {
      crewName, lm, pin,
      property,
      date: todayStr(),
      clockIn: Timestamp.now(),
      clockOut: null,
      clockInLat: gps?.lat ?? null,
      clockInLng: gps?.lng ?? null,
      clockOutLat: null,
      clockOutLng: null,
      distanceFromProperty: distance,
      note: '',
      durationMinutes: null,
      breakMinutes: 0,
    })
  }

  async function clockOut(note: string) {
    if (!activeShift) return
    const gps = await getGps()
    const now = new Date()
    const totalMs = now.getTime() - activeShift.clockIn.getTime()
    const duration = Math.max(0, Math.round(totalMs / 60000) - activeShift.breakMinutes)
    await updateDoc(doc(db, 'timeclock_shifts', activeShift.id), {
      clockOut: Timestamp.now(),
      clockOutLat: gps?.lat ?? null,
      clockOutLng: gps?.lng ?? null,
      note,
      durationMinutes: duration,
    })
  }

  async function startBreak(type: 'lunch' | 'rest') {
    if (!activeShift) return
    await addDoc(collection(db, 'timeclock_breaks'), {
      shiftId: activeShift.id,
      crewName: activeShift.crewName,
      date: todayStr(),
      breakStart: Timestamp.now(),
      breakEnd: null,
      breakType: type,
    })
  }

  async function endBreak() {
    if (!activeBreak || !activeShift) return
    const now = Timestamp.now()
    const breakMins = Math.round(
      (now.toDate().getTime() - activeBreak.breakStart.getTime()) / 60000
    )
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
    todayShifts, activeShift, activeBreak,
    loading, clockIn, clockOut, startBreak, endBreak, totalMinutes
  }
}

export function useManagerShifts(date: string) {
  const [shifts, setShifts] = useState<Shift[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Query by date only — single field, no composite index needed
    const q = query(
      collection(db, 'timeclock_shifts'),
      where('date', '==', date),
      orderBy('clockIn', 'asc')
    )
    const unsub = onSnapshot(q, (snap) => {
      setShifts(snap.docs.map(d => fromFirestore(d.id, d.data())))
      setLoading(false)
    }, (err) => {
      console.error('Firestore manager error:', err.code, err.message)
      setLoading(false)
    })
    return unsub
  }, [date])

  return { shifts, loading }
}
