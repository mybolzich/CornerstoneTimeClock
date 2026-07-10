import { useEffect, useRef, useState } from 'react'
import { CREW, SCHEDULE, PROPERTY_COORDS, getTodayName, haversineMeters } from '../lib/data'
import { LiveLocation } from '../lib/useShifts'

const GOOGLE_MAPS_KEY = 'AIzaSyAfrZbRXLbrQGNHrjobcamxKuXBUm94nR8'

function parseProperties(raw: string): string[] {
  return raw.split('/').map(s => s.trim()).filter(Boolean)
}

function getCoords(name: string) {
  if (PROPERTY_COORDS[name]) return PROPERTY_COORDS[name]
  return PROPERTY_COORDS[name.split('/')[0].trim()] ?? null
}

interface CrewRoute {
  crew: typeof CREW[number]
  propertyRaw: string
  properties: string[]
  coords: ({ lat: number; lng: number } | null)[]
  distanceKm: number | null
  etaMinutes: number | null
}

function buildRoutes(dayName: string): CrewRoute[] {
  const daySchedule = SCHEDULE[dayName]
  if (!daySchedule) return []
  return CREW.map(crew => {
    const raw    = daySchedule[crew.name] ?? 'No Route'
    const props  = parseProperties(raw)
    const coords = props.map(p => getCoords(p))
    let distanceKm: number | null = null
    let etaMinutes: number | null = null
    if (coords.length >= 2 && coords[0] && coords[1]) {
      const d = haversineMeters(coords[0].lat, coords[0].lng, coords[1].lat, coords[1].lng)
      distanceKm = Math.round(d / 100) / 10
      etaMinutes = Math.round((distanceKm * 1.3 / 45) * 60)
    }
    return { crew, propertyRaw: raw, properties: props, coords, distanceKm, etaMinutes }
  })
}

let gmapsLoaded  = false
let gmapsLoading = false
const gmapsCbs: (() => void)[] = []

function loadGoogleMaps(cb: () => void) {
  if (gmapsLoaded) { cb(); return }
  gmapsCbs.push(cb)
  if (gmapsLoading) return
  gmapsLoading = true
  const s = document.createElement('script')
  s.src   = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_KEY}`
  s.async = true
  s.onload = () => { gmapsLoaded = true; gmapsCbs.forEach(f => f()); gmapsCbs.length = 0 }
  document.head.appendChild(s)
}

interface Props {
  onClose: () => void
  liveLocations: LiveLocation[]
}

export function RouteMap({ onClose, liveLocations }: Props) {
  const mapRef      = useRef<HTMLDivElement>(null)
  const [ready,    setReady]    = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [info,     setInfo]     = useState<string | null>(null)
  const mapInstance = useRef<google.maps.Map | null>(null)
  const markers     = useRef<google.maps.Marker[]>([])
  const lines       = useRef<google.maps.Polyline[]>([])
  const liveMarkers = useRef<google.maps.Marker[]>([])

  const dayName  = getTodayName()
  const routes   = buildRoutes(dayName)
  const hasRoute = ['Monday','Tuesday','Wednesday','Thursday'].includes(dayName)

  useEffect(() => { loadGoogleMaps(() => setReady(true)) }, [])

  useEffect(() => {
    if (!ready || !mapRef.current) return
    const map = new google.maps.Map(mapRef.current, {
      center: { lat: 28.05, lng: -82.35 },
      zoom: 10,
      mapTypeId: 'roadmap',
      disableDefaultUI: true,
      zoomControl: true,
      styles: [{ featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] }],
    })
    mapInstance.current = map
    renderMarkers(map, null)
  }, [ready])

  useEffect(() => {
    if (!mapInstance.current) return
    renderMarkers(mapInstance.current, selected)
  }, [selected])

  // Update live location dots whenever liveLocations changes
  useEffect(() => {
    if (!mapInstance.current) return
    liveMarkers.current.forEach(m => m.setMap(null))
    liveMarkers.current = []
    liveLocations.forEach(loc => {
      const stale = (Date.now() - loc.updatedAt.getTime()) > 120_000
      const m = new google.maps.Marker({
        position: { lat: loc.lat, lng: loc.lng },
        map: mapInstance.current!,
        title: `${loc.userName} — ${loc.currentProperty ?? 'En route'}`,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 11,
          fillColor: stale ? '#9ca3af' : loc.color,
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 3,
        },
        label: {
          text: loc.userName[0],
          color: '#ffffff',
          fontSize: '11px',
          fontWeight: 'bold',
        },
        zIndex: 200,
      })
      m.addListener('click', () => {
        const mins = loc.clockInAt
          ? Math.round((Date.now() - loc.clockInAt.getTime()) / 60000)
          : null
        setInfo(`${loc.userName} · ${loc.currentProperty ?? 'En route'} · ${mins !== null ? `${mins}m on clock` : ''}`)
      })
      liveMarkers.current.push(m)
    })
  }, [liveLocations, ready])

  function renderMarkers(map: google.maps.Map, filterCrew: string | null) {
    markers.current.forEach(m => m.setMap(null))
    lines.current.forEach(l => l.setMap(null))
    markers.current = []
    lines.current   = []

    const visible = filterCrew ? routes.filter(r => r.crew.name === filterCrew) : routes
    const bounds  = new google.maps.LatLngBounds()

    visible.forEach(route => {
      const validCoords = route.coords.filter(Boolean) as { lat: number; lng: number }[]
      validCoords.forEach((coord, idx) => {
        const isMulti = validCoords.length > 1
        const prop    = route.properties[idx] ?? route.propertyRaw
        if (isMulti && idx < validCoords.length - 1) {
          const next = validCoords[idx + 1]
          const line = new google.maps.Polyline({
            path: [coord, next],
            geodesic: true,
            strokeColor: route.crew.color,
            strokeOpacity: 0.7,
            strokeWeight: 3,
          })
          line.setMap(map)
          lines.current.push(line)
        }
        const m = new google.maps.Marker({
          position: coord,
          map,
          title: `${route.crew.name} — ${prop}`,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: route.crew.color,
            fillOpacity: 0.9,
            strokeColor: '#ffffff',
            strokeWeight: 2,
          },
          label: {
            text: route.crew.name[0],
            color: route.crew.textColor ?? '#ffffff',
            fontSize: '10px',
            fontWeight: 'bold',
          },
          zIndex: 10,
        })
        m.addListener('click', () => setInfo(`${route.crew.name} · ${prop}`))
        markers.current.push(m)
        bounds.extend(coord)
      })
    })

    if (!bounds.isEmpty()) map.fitBounds(bounds, { top: 60, right: 20, bottom: 20, left: 20 })
  }

  function fmtDist(km: number | null) {
    if (!km) return '—'
    return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)} km`
  }
  function fmtEta(min: number | null) {
    if (!min) return '—'
    return min < 60 ? `~${min} min` : `~${Math.floor(min / 60)}h ${min % 60}m`
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
            <div className="font-bold text-lg">Route Map</div>
            <div className="text-white/50 text-xs">
              {dayName} · {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              {liveLocations.length > 0 && ` · ${liveLocations.length} crew live`}
            </div>
          </div>
        </div>

        {/* Crew filter tabs */}
        <div className="flex gap-2 mt-3 overflow-x-auto pb-1 no-scrollbar">
          <button onClick={() => setSelected(null)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition touch-manipulation ${
              selected === null ? 'bg-white text-gray-800' : 'bg-white/20 text-white'
            }`}>
            All Crew
          </button>
          {CREW.map(c => (
            <button key={c.pin}
              onClick={() => setSelected(selected === c.name ? null : c.name)}
              className="shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition touch-manipulation"
              style={{
                backgroundColor: selected === c.name ? c.color : c.color + '50',
                color: '#fff',
                border: `1.5px solid ${c.color}`,
              }}>
              {c.name}
              {liveLocations.some(l => l.userName === c.name) && ' 🟢'}
            </button>
          ))}
        </div>
      </div>

      {/* Map */}
      <div className="relative flex-1">
        {!hasRoute && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-10">
            <div className="text-center text-gray-500">
              <div className="text-3xl mb-2">📅</div>
              <div className="font-semibold">No routes today</div>
              <div className="text-sm">Mon – Thu only</div>
            </div>
          </div>
        )}
        {!ready && hasRoute && (
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
          {selected ? `${selected}'s Route` : "Today's Routes"}
        </div>
        <div className="pb-safe">
          {(selected ? routes.filter(r => r.crew.name === selected) : routes).map(route => {
            const live = liveLocations.find(l => l.userName === route.crew.name)
            return (
              <div key={route.crew.pin}
                className="flex items-start gap-3 px-4 py-3 border-b border-gray-50 last:border-0 active:bg-gray-50 touch-manipulation"
                onClick={() => setSelected(selected === route.crew.name ? null : route.crew.name)}>
                <div className="relative">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                    style={{ backgroundColor: route.crew.color, color: route.crew.textColor ?? '#fff' }}>
                    {route.crew.name[0]}
                  </div>
                  {live && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-400 rounded-full border-2 border-white" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-800 text-sm">{route.crew.name}</span>
                    <span className="text-gray-400 text-xs">{route.crew.lm}</span>
                  </div>
                  {route.properties.map((prop, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 mt-0.5">
                      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: route.crew.color }} />
                      <span className="text-sm text-gray-700 truncate">{prop}</span>
                    </div>
                  ))}
                  {route.properties.length > 1 && (
                    <div className="mt-1 text-xs text-gray-400">
                      📏 {fmtDist(route.distanceKm)} · 🚗 {fmtEta(route.etaMinutes)}
                    </div>
                  )}
                </div>
                <div className="text-gray-300 text-xs shrink-0 mt-1">
                  {selected === route.crew.name ? '✓' : '›'}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
