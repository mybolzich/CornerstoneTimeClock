import { useEffect, useRef, useState } from 'react'
import { X, ChevronUp, ChevronDown } from 'lucide-react'
import { PROPERTY_COORDS } from '../lib/data'

const GMAPS_KEY = 'AIzaSyAfrZbRXLbrQGNHrjobcamxKuXBUm94nR8'

// ── Shared Maps loader ────────────────────────────────────────────────────────
let _loaded = false, _loading = false
const _cbs: (() => void)[] = []
export function loadGM(cb: () => void) {
  if (_loaded) { cb(); return }
  _cbs.push(cb)
  if (_loading) return
  _loading = true
  const s = document.createElement('script')
  s.src = `https://maps.googleapis.com/maps/api/js?key=${GMAPS_KEY}&libraries=directions,geometry`
  s.async = true
  s.onload = () => { _loaded = true; _cbs.forEach(f => f()); _cbs.length = 0 }
  document.head.appendChild(s)
}

interface Step { instruction: string; distance: string; duration: string }
interface LegInfo { distance: string; duration: string; steps: Step[] }

interface Props {
  destination: string
  onClose: () => void
}

export function InAppNav({ destination, onClose }: Props) {
  const mapRef   = useRef<HTMLDivElement>(null)
  const mapInst  = useRef<google.maps.Map | null>(null)
  const dirInst  = useRef<google.maps.DirectionsRenderer | null>(null)
  const destMarkerRef = useRef<google.maps.Marker | null>(null)

  const [status,    setStatus]    = useState<'loading'|'ready'|'error'>('loading')
  const [leg,       setLeg]       = useState<LegInfo | null>(null)
  const [errMsg,    setErrMsg]    = useState<string | null>(null)
  const [stepIdx,   setStepIdx]   = useState(0)
  const [panelOpen, setPanelOpen] = useState(true)

  // ── Step 1: init map as soon as the div is mounted ────────────────────────
  // We do NOT wait for GPS before showing the map.
  // The destination pin is placed immediately using PROPERTY_COORDS.
  // GPS + directions are fetched after the map is visible.
  useEffect(() => {
    loadGM(initMap)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function initMap() {
    if (!mapRef.current) return

    const destCoord = PROPERTY_COORDS[destination]

    // Center on destination immediately — no GPS needed
    const center = destCoord
      ? { lat: destCoord.lat, lng: destCoord.lng }
      : { lat: 28.05, lng: -82.35 }

    const map = new google.maps.Map(mapRef.current, {
      center,
      zoom: destCoord ? 13 : 10,
      mapTypeId: 'roadmap',
      disableDefaultUI: true,
      zoomControl: true,
      gestureHandling: 'greedy',
    })
    mapInst.current = map

    // ── Pin the destination immediately ──────────────────────────────────────
    if (destCoord) {
      destMarkerRef.current = new google.maps.Marker({
        position: destCoord,
        map,
        title: destination,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 14,
          fillColor: '#16a34a',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 3,
        },
        label: {
          text: '📍',
          fontSize: '18px',
        },
        animation: google.maps.Animation.DROP,
      })

      // Info window on the destination pin
      const iw = new google.maps.InfoWindow({
        content: `<div style="font-family:sans-serif;font-weight:700;font-size:14px;padding:4px 2px">${destination}</div>`,
      })
      destMarkerRef.current.addListener('click', () => iw.open(map, destMarkerRef.current))
      iw.open(map, destMarkerRef.current) // auto-open on load
    }

    // Set up directions renderer (draws the route line once GPS is ready)
    const renderer = new google.maps.DirectionsRenderer({
      map,
      suppressMarkers: false,
      polylineOptions: {
        strokeColor: '#2563eb',
        strokeWeight: 5,
        strokeOpacity: 0.8,
      },
    })
    dirInst.current = renderer

    setStatus('ready')

    // ── Step 2: get GPS and draw route ───────────────────────────────────────
    if (!navigator.geolocation) {
      // No GPS — map still shows destination pin, just no route line
      return
    }

    navigator.geolocation.getCurrentPosition(
      pos => {
        const origin = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        const destStr = destCoord
          ? `${destCoord.lat},${destCoord.lng}`
          : `${destination}, Tampa Bay, FL`

        // Add a blue dot for current location
        new google.maps.Marker({
          position: origin,
          map,
          title: 'Your location',
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: '#2563eb',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 3,
          },
        })

        new google.maps.DirectionsService().route(
          {
            origin,
            destination: destStr,
            travelMode: google.maps.TravelMode.DRIVING,
          },
          (result, status) => {
            if (status !== 'OK' || !result) return // destination pin already visible — silent fail

            // Hide the manual destination marker once the route renders its own
            destMarkerRef.current?.setMap(null)
            renderer.setDirections(result)

            const l = result.routes[0].legs[0]
            setLeg({
              distance: l.distance?.text ?? '',
              duration:  l.duration?.text  ?? '',
              steps: l.steps.map(s => ({
                instruction: s.instructions.replace(/<[^>]+>/g, ''),
                distance:    s.distance?.text ?? '',
                duration:    s.duration?.text ?? '',
              })),
            })

            // Fit map to show full route
            const bounds = new google.maps.LatLngBounds()
            bounds.extend(origin)
            if (destCoord) bounds.extend(destCoord)
            map.fitBounds(bounds, { top: 80, bottom: 240, left: 20, right: 20 })
          }
        )
      },
      () => {
        // GPS denied — map still shows destination pin, no route line
        setErrMsg(null) // silent — map is still useful
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 30000 }
    )
  }

  const currentStep = leg?.steps[stepIdx]

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-900">
      {/* ── Map — explicit height so Google Maps renders ─────────────────── */}
      <div
        ref={mapRef}
        style={{ position: 'absolute', inset: 0 }}
      />

      {/* Loading overlay — shown briefly until map is ready */}
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900 z-10">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-green-500/30 border-t-green-500 rounded-full animate-spin" />
            <span className="text-white/60 text-sm">Loading map…</span>
          </div>
        </div>
      )}

      {/* ── Top bar — always on top ──────────────────────────────────────── */}
      <div className="absolute top-0 inset-x-0 pt-safe-top px-4 z-20 pointer-events-none">
        <div className="pt-3 flex items-center gap-3 pointer-events-auto">
          <button
            onClick={onClose}
            className="h-12 w-12 bg-white rounded-2xl shadow-lg flex items-center justify-center active:scale-95 transition touch-manipulation shrink-0">
            <X size={20} className="text-gray-800" />
          </button>
          <div className="flex-1 bg-white rounded-2xl shadow-lg px-4 py-3">
            <div className="text-xs text-gray-500 font-semibold">Navigating to</div>
            <div className="font-bold text-gray-800 text-sm truncate">{destination}</div>
          </div>
        </div>
      </div>

      {/* ── Bottom directions panel ──────────────────────────────────────── */}
      <div
        className={`absolute bottom-0 inset-x-0 bg-white rounded-t-3xl shadow-2xl z-20 flex flex-col transition-all duration-300 ease-out ${
          panelOpen ? 'max-h-[52%]' : 'h-[88px]'
        }`}
      >
        {/* Handle + summary row */}
        <div
          className="px-5 pt-3 pb-2 shrink-0 touch-manipulation"
          onClick={() => setPanelOpen(p => !p)}
        >
          <div className="mx-auto w-10 h-1 rounded-full bg-gray-200 mb-3" />
          <div className="flex items-center justify-between">
            {leg ? (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-600 rounded-xl flex items-center justify-center shrink-0">
                  <span className="text-white text-xl">🧭</span>
                </div>
                <div>
                  <div className="font-bold text-gray-800 text-lg leading-tight">{leg.duration}</div>
                  <div className="text-xs text-gray-500">{leg.distance} · fastest route</div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-600 rounded-xl flex items-center justify-center shrink-0">
                  <span className="text-white text-xl">📍</span>
                </div>
                <div>
                  <div className="font-bold text-gray-800">{destination}</div>
                  <div className="text-xs text-gray-400">
                    {status === 'loading' ? 'Loading…' : 'Destination pinned on map'}
                  </div>
                </div>
              </div>
            )}
            <div className="text-gray-400 shrink-0">
              {panelOpen
                ? <ChevronDown size={20} />
                : <ChevronUp size={20} />
              }
            </div>
          </div>
        </div>

        {/* Directions steps */}
        {panelOpen && leg && (
          <>
            {/* Current step highlight */}
            {currentStep && (
              <div className="mx-4 mb-2 bg-green-50 border border-green-200 rounded-2xl px-4 py-3 shrink-0">
                <div className="text-xs font-bold text-green-600 mb-0.5 uppercase tracking-wider">Next Turn</div>
                <div className="font-semibold text-gray-800 text-sm leading-snug">{currentStep.instruction}</div>
                <div className="text-xs text-gray-500 mt-1">{currentStep.distance} · {currentStep.duration}</div>
              </div>
            )}

            {/* Steps list */}
            <div className="flex-1 overflow-y-auto pb-safe">
              {leg.steps.map((step, i) => (
                <button key={i}
                  onClick={() => setStepIdx(i)}
                  className={`w-full text-left px-5 py-3 border-b border-gray-50 flex items-start gap-3 touch-manipulation ${
                    i === stepIdx ? 'bg-green-50' : 'active:bg-gray-50'
                  }`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                    i === stepIdx ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-800 leading-snug">{step.instruction}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{step.distance}</div>
                  </div>
                </button>
              ))}

              {/* Prev / Next */}
              <div className="grid grid-cols-2 gap-3 px-4 py-4">
                <button
                  onClick={() => setStepIdx(i => Math.max(0, i - 1))}
                  disabled={stepIdx === 0}
                  className="h-12 rounded-2xl border-2 border-gray-200 font-semibold text-gray-600 disabled:opacity-30 active:bg-gray-50 touch-manipulation">
                  ← Prev
                </button>
                <button
                  onClick={() => setStepIdx(i => Math.min((leg.steps.length - 1), i + 1))}
                  disabled={stepIdx === leg.steps.length - 1}
                  className="h-12 rounded-2xl bg-green-600 font-bold text-white disabled:opacity-30 active:bg-green-700 touch-manipulation">
                  Next →
                </button>
              </div>
            </div>
          </>
        )}

        {/* No GPS — destination pin shown but no directions */}
        {panelOpen && !leg && status === 'ready' && (
          <div className="px-5 pb-safe">
            <p className="text-gray-400 text-sm text-center py-4">
              Enable location permission for turn-by-turn directions.
              <br />The destination is pinned on the map above.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
