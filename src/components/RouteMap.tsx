import { useEffect, useRef, useState } from 'react'
import { CREW, SCHEDULE, PROPERTY_COORDS, getTodayName, haversineMeters } from '../lib/data'

const GOOGLE_MAPS_KEY = 'AIzaSyAfrZbRXLbrQGNHrjobcamxKuXBUm94nR8'

// Parse "Property A / Property B" into individual property names
function parseProperties(raw: string): string[] {
  return raw.split('/').map(s => s.trim()).filter(Boolean)
}

// Get coords for a property name (handles multi-property strings)
function getCoords(name: string): { lat: number; lng: number } | null {
  // exact match first
  if (PROPERTY_COORDS[name]) return PROPERTY_COORDS[name]
  // try first token of a slash-name
  const first = name.split('/')[0].trim()
  return PROPERTY_COORDS[first] ?? null
}

interface CrewRoute {
  crew: typeof CREW[number]
  propertyRaw: string        // e.g. "Willow Walk / Golden Meadow"
  properties: string[]       // ["Willow Walk", "Golden Meadow"]
  coords: ({ lat: number; lng: number } | null)[]
  distanceKm: number | null  // straight-line between stops if multi
  etaMinutes: number | null  // driving estimate (haversine * factor)
}

function buildRoutes(dayName: string): CrewRoute[] {
  const daySchedule = SCHEDULE[dayName]
  if (!daySchedule) return []

  return CREW.map(crew => {
    const raw = daySchedule[crew.name] ?? 'No Route'
    const props = parseProperties(raw)
    const coords = props.map(p => getCoords(p))

    let distanceKm: number | null = null
    let etaMinutes: number | null = null

    if (coords.length >= 2 && coords[0] && coords[1]) {
      const d = haversineMeters(
        coords[0].lat, coords[0].lng,
        coords[1].lat, coords[1].lng
      )
      distanceKm = Math.round(d / 100) / 10
      // road distance ≈ haversine * 1.3, speed ≈ 45 km/h
      etaMinutes = Math.round((distanceKm * 1.3 / 45) * 60)
    }

    return { crew, propertyRaw: raw, properties: props, coords, distanceKm, etaMinutes }
  })
}

// Inject Google Maps script once
let gmapsLoaded = false
let gmapsLoading = false
const gmapsCallbacks: (() => void)[] = []

function loadGoogleMaps(cb: () => void) {
  if (gmapsLoaded) { cb(); return }
  gmapsCallbacks.push(cb)
  if (gmapsLoading) return
  gmapsLoading = true
  const script = document.createElement('script')
  script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_KEY}&libraries=geometry`
  script.async = true
  script.onload = () => {
    gmapsLoaded = true
    gmapsCallbacks.forEach(fn => fn())
    gmapsCallbacks.length = 0
  }
  document.head.appendChild(script)
}

interface Props {
  onClose: () => void
}

export function RouteMap({ onClose }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const [mapReady, setMapReady] = useState(false)
  const [selectedCrew, setSelectedCrew] = useState<string | null>(null)
  const [infoProperty, setInfoProperty] = useState<string | null>(null)
  const mapInstance = useRef<google.maps.Map | null>(null)
  const markersRef = useRef<google.maps.Marker[]>([])
  const linesRef = useRef<google.maps.Polyline[]>([])

  const dayName = getTodayName()
  const routes = buildRoutes(dayName)
  const hasRoutes = ['Monday','Tuesday','Wednesday','Thursday'].includes(dayName)

  useEffect(() => {
    loadGoogleMaps(() => setMapReady(true))
  }, [])

  useEffect(() => {
    if (!mapReady || !mapRef.current) return

    // Center on Tampa Bay
    const map = new google.maps.Map(mapRef.current, {
      center: { lat: 28.05, lng: -82.35 },
      zoom: 10,
      mapTypeId: 'roadmap',
      disableDefaultUI: false,
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      styles: [
        { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] }
      ]
    })
    mapInstance.current = map
    renderMarkers(map, null)
  }, [mapReady])

  useEffect(() => {
    if (!mapInstance.current) return
    renderMarkers(mapInstance.current, selectedCrew)
  }, [selectedCrew, mapReady])

  function renderMarkers(map: google.maps.Map, filterCrew: string | null) {
    // Clear existing
    markersRef.current.forEach(m => m.setMap(null))
    linesRef.current.forEach(l => l.setMap(null))
    markersRef.current = []
    linesRef.current = []

    const visibleRoutes = filterCrew
      ? routes.filter(r => r.crew.name === filterCrew)
      : routes

    const bounds = new google.maps.LatLngBounds()

    visibleRoutes.forEach(route => {
      const validCoords = route.coords.filter(Boolean) as { lat: number; lng: number }[]

      validCoords.forEach((coord, idx) => {
        const isMultiStop = validCoords.length > 1
        const propName = route.properties[idx] ?? route.propertyRaw

        // Draw connecting line for multi-stop routes
        if (isMultiStop && idx < validCoords.length - 1) {
          const nextCoord = validCoords[idx + 1]
          const line = new google.maps.Polyline({
            path: [coord, nextCoord],
            geodesic: true,
            strokeColor: route.crew.color,
            strokeOpacity: 0.7,
            strokeWeight: 3,
            icons: [{
              icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 3 },
              offset: '50%'
            }]
          })
          line.setMap(map)
          linesRef.current.push(line)
        }

        // Marker
        const marker = new google.maps.Marker({
          position: coord,
          map,
          title: `${route.crew.name} — ${propName}`,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: isMultiStop ? 10 + idx * 2 : 12,
            fillColor: route.crew.color,
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
          },
          label: {
            text: route.crew.name[0],
            color: route.crew.textColor ?? '#ffffff',
            fontSize: '11px',
            fontWeight: 'bold',
          },
          zIndex: filterCrew ? 100 : 10,
        })

        marker.addListener('click', () => {
          setInfoProperty(`${route.crew.name} · ${propName}`)
        })

        markersRef.current.push(marker)
        bounds.extend(coord)
      })
    })

    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, { top: 60, right: 20, bottom: 20, left: 20 })
      if (filterCrew && validCoords(visibleRoutes).length === 1) {
        map.setZoom(13)
      }
    }
  }

  function validCoords(rs: CrewRoute[]) {
    return rs.flatMap(r => r.coords.filter(Boolean))
  }

  // Straight-line distance formatter
  function fmtDist(km: number | null) {
    if (km === null) return '—'
    return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)} km`
  }

  function fmtEta(min: number | null) {
    if (min === null) return '—'
    if (min < 60) return `~${min} min`
    return `~${Math.floor(min / 60)}h ${min % 60}m`
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#f5f5f0' }}>
      {/* Header */}
      <div className="text-white px-4 pt-10 pb-3 flex items-center gap-3" style={{ backgroundColor: '#0d1f3a' }}>
        <button onClick={onClose}
          className="p-2 rounded-lg bg-white/20 active:bg-white/30 text-white font-bold text-lg leading-none">
          ←
        </button>
        <div>
          <div className="font-bold text-lg">Route Map</div>
          <div className="text-white/60 text-xs">{dayName} · {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
        </div>
      </div>

      {/* Crew filter tabs */}
      <div className="flex gap-2 px-3 py-2 overflow-x-auto" style={{ backgroundColor: '#0d1f3a' }}>
        <button
          onClick={() => setSelectedCrew(null)}
          className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition ${
            selectedCrew === null ? 'bg-white text-gray-800' : 'bg-white/20 text-white'
          }`}>
          All Crew
        </button>
        {CREW.map(c => (
          <button key={c.pin}
            onClick={() => setSelectedCrew(selectedCrew === c.name ? null : c.name)}
            className="shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition"
            style={{
              backgroundColor: selectedCrew === c.name ? c.color : c.color + '40',
              color: selectedCrew === c.name ? (c.textColor ?? '#fff') : '#fff',
              border: `1px solid ${c.color}`
            }}>
            {c.name}
          </button>
        ))}
      </div>

      {/* Map */}
      <div className="relative flex-1">
        {!hasRoutes && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-10">
            <div className="text-center text-gray-500">
              <div className="text-3xl mb-2">📅</div>
              <div className="font-semibold">No routes today</div>
              <div className="text-sm">Schedule runs Monday – Thursday</div>
            </div>
          </div>
        )}
        {!mapReady && hasRoutes && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-10">
            <div className="text-gray-400 text-sm animate-pulse">Loading map…</div>
          </div>
        )}
        <div ref={mapRef} className="w-full h-full" />

        {/* Info bubble on marker click */}
        {infoProperty && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-white shadow-lg rounded-xl px-4 py-2 text-sm font-semibold text-gray-800 flex items-center gap-2 z-20">
            📍 {infoProperty}
            <button onClick={() => setInfoProperty(null)} className="text-gray-400 text-base leading-none">✕</button>
          </div>
        )}
      </div>

      {/* Route cards — scrollable bottom sheet */}
      <div className="bg-white border-t border-gray-200 overflow-y-auto" style={{ maxHeight: '38%' }}>
        <div className="px-4 pt-3 pb-1">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            {selectedCrew ? `${selectedCrew}'s Route` : "Today's Routes"}
          </div>
        </div>
        <div className="space-y-0 pb-6">
          {(selectedCrew ? routes.filter(r => r.crew.name === selectedCrew) : routes).map(route => (
            <div key={route.crew.pin}
              className="flex items-start gap-3 px-4 py-3 border-b border-gray-100 last:border-0 active:bg-gray-50"
              onClick={() => setSelectedCrew(selectedCrew === route.crew.name ? null : route.crew.name)}>
              {/* Color badge */}
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 mt-0.5"
                style={{ backgroundColor: route.crew.color, color: route.crew.textColor ?? '#fff' }}>
                {route.crew.name[0]}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-800 text-sm">{route.crew.name}</span>
                  <span className="text-gray-400 text-xs">{route.crew.lm}</span>
                </div>

                {/* Properties list */}
                <div className="mt-1 space-y-1">
                  {route.properties.map((prop, idx) => {
                    const coord = route.coords[idx]
                    return (
                      <div key={idx} className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: route.crew.color }} />
                        <span className="text-sm text-gray-700 truncate">{prop}</span>
                        {!coord && <span className="text-xs text-orange-400">(no GPS)</span>}
                      </div>
                    )
                  })}
                </div>

                {/* Multi-stop estimate */}
                {route.properties.length > 1 && (
                  <div className="mt-1.5 flex gap-3">
                    <span className="text-xs text-gray-400">
                      📏 {fmtDist(route.distanceKm)} between stops
                    </span>
                    <span className="text-xs text-gray-400">
                      🚗 {fmtEta(route.etaMinutes)} drive
                    </span>
                  </div>
                )}
              </div>

              {/* Tap hint */}
              <div className="text-gray-300 text-xs shrink-0 mt-1">
                {selectedCrew === route.crew.name ? '✓' : '›'}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
