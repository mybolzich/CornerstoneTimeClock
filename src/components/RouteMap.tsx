import { useEffect, useRef, useState } from 'react'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { CREW, SCHEDULE, PROPERTY_COORDS, getTodayName, todayStr } from '../lib/data'
import { LiveLocation } from '../lib/useShifts'

const GMAPS_KEY = 'AIzaSyAfrZbRXLbrQGNHrjobcamxKuXBUm94nR8'

let _gmLoaded = false, _gmLoading = false
const _gmCbs: (() => void)[] = []
function loadGM(cb: () => void) {
  if (_gmLoaded) { cb(); return }
  _gmCbs.push(cb)
  if (_gmLoading) return
  _gmLoading = true
  const s   = document.createElement('script')
  s.src     = `https://maps.googleapis.com/maps/api/js?key=${GMAPS_KEY}&libraries=directions,geometry`
  s.async   = true
  s.onload  = () => { _gmLoaded = true; _gmCbs.forEach(f => f()); _gmCbs.length = 0 }
  document.head.appendChild(s)
}

interface DispatchedRoute {
  crewPin: string
  crewName: string
  stops: string[]
}

interface Props {
  onClose: () => void
  liveLocations: LiveLocation[]
}

export function RouteMap({ onClose, liveLocations }: Props) {
  const mapRef      = useRef<HTMLDivElement>(null)
  const mapInst     = useRef<google.maps.Map | null>(null)
  const markerRefs  = useRef<google.maps.Marker[]>([])
  const lineRefs    = useRef<google.maps.DirectionsRenderer[]>([])
  const liveMarkers = useRef<google.maps.Marker[]>([])

  const [gmReady,    setGmReady]    = useState(false)
  const [selected,   setSelected]   = useState<string | null>(null)
  const [info,       setInfo]       = useState<string | null>(null)
  const [routes,     setRoutes]     = useState<DispatchedRoute[]>([])
  const [routesFetched, setRoutesFetched] = useState(false)

  const dayName = getTodayName()
  const isRouteDay = ['Monday','Tuesday','Wednesday','Thursday'].includes(dayName)

  // ── Load dispatched routes from Firestore (live) ───────────────────────────
  useEffect(() => {
    const q = query(
      collection(db, 'dispatchRoutes'),
      where('date', '==', todayStr())
    )
    return onSnapshot(q, snap => {
      const loaded: DispatchedRoute[] = snap.docs.map(d => {
        const data = d.data()
        return { crewPin: data.crewPin, crewName: data.crewName, stops: data.stops ?? [] }
      })

      // If no dispatched routes today, fall back to hardcoded SCHEDULE
      if (loaded.length === 0) {
        
        const dayRoutes = SCHEDULE[dayName] ?? {}
        const fallback: DispatchedRoute[] = CREW
          .filter(c => dayRoutes[c.name])
          .map(c => ({
            crewPin:  c.pin,
            crewName: c.name,
            stops:    dayRoutes[c.name].split('/').map((s: string) => s.trim()).filter(Boolean),
          }))
        setRoutes(fallback)
      } else {
        setRoutes(loaded)
      }
      setRoutesFetched(true)
    })
  }, [])

  // ── Init map ───────────────────────────────────────────────────────────────
  useEffect(() => {
    loadGM(() => setGmReady(true))
  }, [])

  useEffect(() => {
    if (!gmReady || !mapRef.current) return
    const map = new google.maps.Map(mapRef.current, {
      center: { lat: 28.05, lng: -82.35 },
      zoom: 10,
      mapTypeId: 'roadmap',
      disableDefaultUI: true,
      zoomControl: true,
      gestureHandling: 'greedy',
    })
    mapInst.current = map
  }, [gmReady])

  // ── Draw routes whenever routes or filter changes ──────────────────────────
  useEffect(() => {
    if (!gmReady || !mapInst.current || !routesFetched) return
    drawRoutes(mapInst.current, selected)
  }, [gmReady, routes, selected, routesFetched])

  // ── Draw live location dots ────────────────────────────────────────────────
  useEffect(() => {
    if (!gmReady || !mapInst.current) return
    liveMarkers.current.forEach(m => m.setMap(null))
    liveMarkers.current = []

    liveLocations.forEach(loc => {
      const stale = (Date.now() - loc.updatedAt.getTime()) > 120_000
      const m = new google.maps.Marker({
        position: { lat: loc.lat, lng: loc.lng },
        map: mapInst.current!,
        title: `${loc.userName} — ${loc.currentProperty ?? 'En route'}`,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 12,
          fillColor: stale ? '#9ca3af' : loc.color,
          fillOpacity: 1,
          strokeColor: '#fff',
          strokeWeight: 3,
        },
        label: { text: loc.userName[0], color: '#fff', fontSize: '11px', fontWeight: 'bold' },
        zIndex: 300,
      })
      const mins = loc.clockInAt
        ? Math.round((Date.now() - loc.clockInAt.getTime()) / 60000)
        : null
      const iw = new google.maps.InfoWindow({
        content: `<div style="font:600 13px sans-serif;padding:2px 4px;line-height:1.6">
          <div>${loc.userName} <span style="color:#6b7280;font-weight:400">${loc.lm}</span></div>
          <div style="color:#16a34a">${loc.currentProperty ?? 'En route'}</div>
          ${mins !== null ? `<div style="color:#6b7280;font-size:11px">${mins}m on clock</div>` : ''}
          ${stale ? '<div style="color:#f59e0b;font-size:11px">⚠️ Signal lost</div>' : ''}
        </div>`
      })
      m.addListener('click', () => { iw.open(mapInst.current!, m) })
      liveMarkers.current.push(m)
    })
  }, [liveLocations, gmReady])

  function drawRoutes(map: google.maps.Map, filterCrew: string | null) {
    markerRefs.current.forEach(m => m.setMap(null))
    lineRefs.current.forEach(r => r.setMap(null))
    markerRefs.current = []
    lineRefs.current   = []

    const visible = filterCrew
      ? routes.filter(r => r.crewName === filterCrew)
      : routes

    const bounds = new google.maps.LatLngBounds()
    const svc    = new google.maps.DirectionsService()

    visible.forEach(route => {
      const crew       = CREW.find(c => c.pin === route.crewPin)!
      const validStops = route.stops.filter(s => PROPERTY_COORDS[s])

      if (!validStops.length) return

      // Place numbered pins
      validStops.forEach((stop, idx) => {
        const coord = PROPERTY_COORDS[stop]
        bounds.extend(coord)
        const m = new google.maps.Marker({
          position: coord, map,
          title: `${route.crewName} — Stop ${idx + 1}: ${stop}`,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 12,
            fillColor: crew.color,
            fillOpacity: 0.9,
            strokeColor: '#fff',
            strokeWeight: 2,
          },
          label: {
            text: String(idx + 1),
            color: crew.textColor ?? '#fff',
            fontSize: '10px', fontWeight: 'bold',
          },
          zIndex: 50,
        })
        const iw = new google.maps.InfoWindow({
          content: `<div style="font:600 13px sans-serif;padding:2px 4px;line-height:1.6">
            <span style="color:${crew.color}">■</span> ${route.crewName} · Stop ${idx + 1}
            <br/><b>${stop}</b>
            <br/><span style="color:#6b7280;font-size:11px">Dispatched route</span>
          </div>`
        })
        m.addListener('click', () => iw.open(map, m))
        markerRefs.current.push(m)
      })

      // Draw real road route with DirectionsService
      if (validStops.length >= 1) {
        const dr = new google.maps.DirectionsRenderer({
          map,
          suppressMarkers: true,
          preserveViewport: true,
          polylineOptions: {
            strokeColor:   crew.color,
            strokeOpacity: 0.7,
            strokeWeight:  4,
          },
        })
        lineRefs.current.push(dr)

        const origin  = validStops[0]
        const dest    = validStops[validStops.length - 1]
        const wpts    = validStops.slice(1, -1).map(s => ({
          location: PROPERTY_COORDS[s], stopover: true,
        }))

        svc.route({
          origin:             PROPERTY_COORDS[origin],
          destination:        PROPERTY_COORDS[dest],
          waypoints:          wpts,
          optimizeWaypoints:  false,
          travelMode:         google.maps.TravelMode.DRIVING,
        }, (result, status) => {
          if (status === 'OK' && result) dr.setDirections(result)
        })
      }
    })

    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, { top: 60, right: 20, bottom: 240, left: 20 })
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#f5f5f0' }}>
      {/* Header */}
      <div className="text-white px-4 pt-safe-top pb-3 shrink-0" style={{ backgroundColor: '#0d1f3a' }}>
        <div className="pt-4 flex items-center gap-3">
          <button onClick={onClose}
            className="h-11 w-11 flex items-center justify-center rounded-xl bg-white/20 active:bg-white/30 font-bold text-white text-lg touch-manipulation">
            ←
          </button>
          <div>
            <div className="font-bold text-lg">Live Route Map</div>
            <div className="text-white/50 text-xs">
              {dayName} · {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              {routes.length > 0 && ` · ${routes.length} routes dispatched`}
              {liveLocations.length > 0 && ` · ${liveLocations.length} crew live`}
            </div>
          </div>
        </div>

        {/* Crew filter tabs */}
        <div className="flex gap-2 mt-3 overflow-x-auto pb-1 no-scrollbar">
          <button onClick={() => setSelected(null)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold touch-manipulation ${
              selected === null ? 'bg-white text-gray-800' : 'bg-white/20 text-white'
            }`}>
            All Crew
          </button>
          {CREW.map(c => {
            const isLive = liveLocations.some(l => l.userName === c.name)
            return (
              <button key={c.pin}
                onClick={() => setSelected(selected === c.name ? null : c.name)}
                className="shrink-0 px-3 py-1.5 rounded-full text-xs font-bold touch-manipulation"
                style={{
                  backgroundColor: selected === c.name ? c.color : c.color + '50',
                  color: '#fff',
                  border: `1.5px solid ${c.color}`,
                }}>
                {c.name}{isLive ? ' 🟢' : ''}
              </button>
            )
          })}
        </div>
      </div>

      {/* Map */}
      <div className="relative flex-1">
        {/* Non-blocking weekend notice — small chip, map still loads behind it */}
        {!isRouteDay && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
            <div className="bg-white/95 shadow-lg rounded-2xl px-4 py-2.5 text-sm text-center">
              <div className="font-semibold text-gray-700">No scheduled routes today</div>
              <div className="text-gray-400 text-xs mt-0.5">Live crew locations still shown · Mon–Thu routes</div>
            </div>
          </div>
        )}
        {!gmReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-10">
            <div className="text-gray-400 text-sm animate-pulse">Loading map…</div>
          </div>
        )}
        <div ref={mapRef} className="w-full h-full" />

        {/* Info bubble */}
        {info && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-white shadow-lg rounded-2xl px-4 py-2.5 flex items-center gap-2 z-20 text-sm font-semibold text-gray-800">
            📍 {info}
            <button onClick={() => setInfo(null)} className="text-gray-400 text-base">✕</button>
          </div>
        )}
      </div>

      {/* Route cards */}
      <div className="bg-white border-t border-gray-100 overflow-y-auto" style={{ maxHeight: '36%' }}>
        <div className="px-4 pt-3 pb-1 text-xs font-bold text-gray-400 uppercase tracking-wider">
          {selected ? `${selected}'s Route` : "Today's Dispatched Routes"}
          {!routesFetched && <span className="ml-2 text-blue-400 animate-pulse">Loading…</span>}
        </div>
        <div className="pb-safe">
          {(selected ? routes.filter(r => r.crewName === selected) : routes).map(route => {
            const crew = CREW.find(c => c.pin === route.crewPin)!
            const live = liveLocations.find(l => l.userName === route.crewName)
            return (
              <div key={route.crewPin}
                className="flex items-start gap-3 px-4 py-3 border-b border-gray-50 last:border-0 active:bg-gray-50 touch-manipulation"
                onClick={() => setSelected(selected === route.crewName ? null : route.crewName)}>
                <div className="relative shrink-0">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
                    style={{ backgroundColor: crew.color, color: crew.textColor ?? '#fff' }}>
                    {route.crewName[0]}
                  </div>
                  {live && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-400 rounded-full border-2 border-white" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-800 text-sm">{route.crewName}</span>
                    <span className="text-gray-400 text-xs">{crew.lm}</span>
                    {live && <span className="text-xs text-green-600 font-semibold">● Live</span>}
                  </div>
                  {route.stops.map((stop, idx) => {
                    const done = false // could be derived from shifts if needed
                    return (
                      <div key={idx} className="flex items-center gap-1.5 mt-0.5">
                        <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: crew.color }} />
                        <span className="text-sm text-gray-700 truncate">{stop}</span>
                        {!PROPERTY_COORDS[stop] && (
                          <span className="text-xs text-orange-400">(custom)</span>
                        )}
                      </div>
                    )
                  })}
                </div>
                <div className="text-gray-300 text-xs shrink-0 mt-1">
                  {selected === route.crewName ? '✓' : '›'}
                </div>
              </div>
            )
          })}
          {routesFetched && routes.length === 0 && (
            <div className="px-4 py-6 text-center text-gray-400 text-sm">
              {isRouteDay
                ? <>No routes dispatched today yet.<br/>Open the Route Dispatcher to assign stops.</>
                : <>No scheduled routes — weekend day.<br/>Live crew locations shown on map above.</>
              }
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
