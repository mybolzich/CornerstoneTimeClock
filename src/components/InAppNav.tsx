import { useEffect, useRef, useState } from 'react'
import { X, Navigation, ChevronUp, ChevronDown } from 'lucide-react'
import { PROPERTY_COORDS } from '../lib/data'

const GMAPS_KEY = 'AIzaSyAfrZbRXLbrQGNHrjobcamxKuXBUm94nR8'

// Shared Google Maps loader (reuse across components)
let _gmLoaded = false, _gmLoading = false
const _gmCbs: (() => void)[] = []
export function loadGM(cb: () => void) {
  if (_gmLoaded) { cb(); return }
  _gmCbs.push(cb)
  if (_gmLoading) return
  _gmLoading = true
  const s = document.createElement('script')
  s.src   = `https://maps.googleapis.com/maps/api/js?key=${GMAPS_KEY}&libraries=directions,geometry`
  s.async = true
  s.onload = () => { _gmLoaded = true; _gmCbs.forEach(f => f()); _gmCbs.length = 0 }
  document.head.appendChild(s)
}

interface Step { instruction: string; distance: string; duration: string }
interface LegInfo { distance: string; duration: string; steps: Step[] }

interface Props {
  destination: string      // property name
  onClose: () => void
}

export function InAppNav({ destination, onClose }: Props) {
  const mapRef    = useRef<HTMLDivElement>(null)
  const [ready,   setReady]   = useState(false)
  const [leg,     setLeg]     = useState<LegInfo | null>(null)
  const [err,     setErr]     = useState<string | null>(null)
  const [stepIdx, setStepIdx] = useState(0)
  const [panelOpen, setPanelOpen] = useState(true)
  const mapInst   = useRef<google.maps.Map | null>(null)
  const dirInst   = useRef<google.maps.DirectionsRenderer | null>(null)

  useEffect(() => { loadGM(() => setReady(true)) }, [])

  useEffect(() => {
    if (!ready || !mapRef.current) return

    const map = new google.maps.Map(mapRef.current, {
      center: { lat: 28.05, lng: -82.35 },
      zoom: 12,
      mapTypeId: 'roadmap',
      disableDefaultUI: true,
      zoomControl: true,
      gestureHandling: 'greedy',
    })
    mapInst.current = map

    const renderer = new google.maps.DirectionsRenderer({
      map,
      suppressMarkers: false,
      polylineOptions: { strokeColor: '#16a34a', strokeWeight: 5, strokeOpacity: 0.85 },
    })
    dirInst.current = renderer

    // Get user location then render route
    navigator.geolocation?.getCurrentPosition(pos => {
      const origin = { lat: pos.coords.latitude, lng: pos.coords.longitude }
      const destCoord = PROPERTY_COORDS[destination]
      const destStr   = destCoord
        ? `${destCoord.lat},${destCoord.lng}`
        : `${destination}, Tampa Bay, FL`

      const svc = new google.maps.DirectionsService()
      svc.route({
        origin,
        destination: destStr,
        travelMode: google.maps.TravelMode.DRIVING,
      }, (result, status) => {
        if (status !== 'OK' || !result) {
          setErr('Could not get directions. Check your connection.')
          return
        }
        renderer.setDirections(result)
        const l = result.routes[0].legs[0]
        const steps: Step[] = l.steps.map(s => ({
          instruction: s.instructions.replace(/<[^>]+>/g, ''),
          distance:    s.distance?.text ?? '',
          duration:    s.duration?.text ?? '',
        }))
        setLeg({ distance: l.distance?.text ?? '', duration: l.duration?.text ?? '', steps })
      })
    }, () => {
      setErr('Location permission denied. Enable GPS and try again.')
    }, { enableHighAccuracy: false, timeout: 6000 })
  }, [ready, destination])

  const currentStep = leg?.steps[stepIdx]

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Map fills screen */}
      <div ref={mapRef} className="flex-1" />

      {/* Top bar */}
      <div className="absolute top-0 inset-x-0 pt-safe-top px-4 pt-12 pointer-events-none">
        <div className="flex items-center gap-3 pointer-events-auto">
          <button onClick={onClose}
            className="h-11 w-11 bg-white rounded-full shadow-lg flex items-center justify-center active:scale-95 transition touch-manipulation">
            <X size={20} className="text-gray-800" />
          </button>
          <div className="flex-1 bg-white rounded-2xl shadow-lg px-4 py-2.5">
            <div className="text-xs text-gray-500 font-semibold">Navigating to</div>
            <div className="font-bold text-gray-800 text-sm truncate">{destination}</div>
          </div>
        </div>
      </div>

      {/* Directions panel */}
      {err ? (
        <div className="absolute bottom-0 inset-x-0 bg-white rounded-t-3xl shadow-2xl p-5 pb-safe">
          <p className="text-red-600 font-semibold text-center text-sm">{err}</p>
          <button onClick={onClose}
            className="mt-3 w-full h-12 rounded-2xl bg-gray-100 font-semibold text-gray-600 touch-manipulation">
            Close
          </button>
        </div>
      ) : leg ? (
        <div className={`absolute bottom-0 inset-x-0 bg-white rounded-t-3xl shadow-2xl transition-all duration-300 ${panelOpen ? 'max-h-[55%]' : 'max-h-[88px]'} flex flex-col`}>
          {/* Handle + summary */}
          <div className="px-5 pt-3 pb-2 shrink-0" onClick={() => setPanelOpen(p => !p)}>
            <div className="mx-auto w-10 h-1 rounded-full bg-gray-200 mb-3" />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center shrink-0">
                  <Navigation size={18} color="white" />
                </div>
                <div>
                  <div className="font-bold text-gray-800">{leg.duration}</div>
                  <div className="text-xs text-gray-500">{leg.distance} · via fastest route</div>
                </div>
              </div>
              {panelOpen ? <ChevronDown size={20} className="text-gray-400" /> : <ChevronUp size={20} className="text-gray-400" />}
            </div>
          </div>

          {/* Current step highlight */}
          {panelOpen && currentStep && (
            <div className="mx-4 mb-2 bg-green-50 border border-green-200 rounded-2xl px-4 py-3 shrink-0">
              <div className="text-xs font-bold text-green-600 mb-0.5">NEXT TURN</div>
              <div className="font-semibold text-gray-800 text-sm leading-snug">{currentStep.instruction}</div>
              <div className="text-xs text-gray-500 mt-1">{currentStep.distance} · {currentStep.duration}</div>
            </div>
          )}

          {/* All steps list */}
          {panelOpen && (
            <div className="flex-1 overflow-y-auto pb-safe">
              {leg.steps.map((step, i) => (
                <button key={i} onClick={() => setStepIdx(i)}
                  className={`w-full text-left px-5 py-3 border-b border-gray-50 flex items-start gap-3 touch-manipulation ${i === stepIdx ? 'bg-green-50' : 'active:bg-gray-50'}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${i === stepIdx ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-800 leading-snug">{step.instruction}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{step.distance}</div>
                  </div>
                </button>
              ))}
              {/* Prev / Next step controls */}
              <div className="grid grid-cols-2 gap-3 px-4 py-4 pb-safe">
                <button onClick={() => setStepIdx(i => Math.max(0, i - 1))}
                  disabled={stepIdx === 0}
                  className="h-12 rounded-2xl border-2 border-gray-200 font-semibold text-gray-600 disabled:opacity-30 active:bg-gray-50 touch-manipulation">
                  ← Previous
                </button>
                <button onClick={() => setStepIdx(i => Math.min((leg.steps.length - 1), i + 1))}
                  disabled={stepIdx === leg.steps.length - 1}
                  className="h-12 rounded-2xl bg-green-600 font-bold text-white disabled:opacity-30 active:bg-green-700 touch-manipulation">
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="absolute bottom-0 inset-x-0 bg-white rounded-t-3xl shadow-2xl p-5 pb-safe flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-green-600/30 border-t-green-600 rounded-full animate-spin shrink-0" />
          <span className="text-gray-600 text-sm font-medium">Getting directions…</span>
        </div>
      )}
    </div>
  )
}
