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

function fromFirestore(id: string, data: Record<string, unknown>): Shift {
  return {
    id,
    crewName: data.crewName as string,
    lm: data.lm as string,
    pin: data.pin as string,
    property: data.property as string,
    date: data.date as string,
    clockIn: (data.clockIn as Timestamp).toDate(),
    clockOut: data.clockOut ? (data.clockOut as Timestamp).toDate() : null,
    clockInLat: data.clockInLat as number | null,
    clockInLng: data.clockInLng as number | null,
    clockOutLat: data.clockOutLat as number | null,
    clockOutLng: data.clockOutLng as number | null,
    distanceFromProperty: data.distanceFromProperty as number | null,
    note: (data.note as string) || '',
    durationMinutes: data.durationMinutes as number | null,
    breakMinutes: (data.breakMinutes as number) || 0,
  }
}

export function useCrewShifts(pin: string) {
  const [todayShifts, setTodayShifts] = useState<Shift[]>([])
  const [activeShift, setActiveShift] = useState<Shift | null>(null)
  const [activeBreak, setActiveBreak] = useState<Break | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = query(
      collection(db, 'timeclock_shifts'),
      where('pin', '==', pin),
      where('date', '==', todayStr()),
      orderBy('clockIn', 'desc')
    )
    const unsub = onSnapshot(q, (snap) => {
      const shifts = snap.docs.map(d => fromFirestore(d.id, d.data() as Record<string, unknown>))
      setTodayShifts(shifts)
      const open = shifts.find(s => s.clockOut === null) ?? null
      setActiveShift(open)
      setLoading(false)
    })
    return unsub
  }, [pin])

  useEffect(() => {
    if (!activeShift) { setActiveBreak(null); return }
    const q = query(
      collection(db, 'timeclock_breaks'),
      where('shiftId', '==', activeShift.id),
      where('breakEnd', '==', null)
    )
    const unsub = onSnapshot(q, (snap) => {
      if (snap.empty) { setActiveBreak(null); return }
      const d = snap.docs[0]
      const data = d.data() as Record<string, unknown>
      setActiveBreak({
        id: d.id,
        shiftId: data.shiftId as string,
        crewName: data.crewName as string,
        date: data.date as string,
        breakStart: (data.breakStart as Timestamp).toDate(),
        breakEnd: null,
        breakType: data.breakType as 'lunch' | 'rest',
      })
    })
    return unsub
  }, [activeShift?.id])

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
    const duration = (now.getTime() - activeShift.clockIn.getTime()) / 60000
    await updateDoc(doc(db, 'timeclock_shifts', activeShift.id), {
      clockOut: Timestamp.now(),
      clockOutLat: gps?.lat ?? null,
      clockOutLng: gps?.lng ?? null,
      note,
      durationMinutes: Math.round(duration - activeShift.breakMinutes),
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
    const breakMins = Math.round((now.toDate().getTime() - activeBreak.breakStart.getTime()) / 60000)
    await updateDoc(doc(db, 'timeclock_breaks', activeBreak.id), { breakEnd: now })
    await updateDoc(doc(db, 'timeclock_shifts', activeShift.id), {
      breakMinutes: activeShift.breakMinutes + breakMins
    })
  }

  const totalMinutes = todayShifts
    .filter(s => s.durationMinutes !== null)
    .reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0)
    + (activeShift ? (Date.now() - activeShift.clockIn.getTime()) / 60000 - activeShift.breakMinutes : 0)

  return { todayShifts, activeShift, activeBreak, loading, clockIn, clockOut, startBreak, endBreak, totalMinutes }
}

export function useManagerShifts(date: string) {
  const [shifts, setShifts] = useState<Shift[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = query(
      collection(db, 'timeclock_shifts'),
      where('date', '==', date),
      orderBy('clockIn', 'asc')
    )
    const unsub = onSnapshot(q, (snap) => {
      setShifts(snap.docs.map(d => fromFirestore(d.id, d.data() as Record<string, unknown>)))
      setLoading(false)
    })
    return unsub
  }, [date])

  return { shifts, loading }
}
