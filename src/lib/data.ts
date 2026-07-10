// ─── Crew ────────────────────────────────────────────────────────────────────
export interface CrewMember {
  pin: string
  name: string
  lm: string
  color: string
  textColor?: string
}

export const CREW: CrewMember[] = [
  { pin: '1001', name: 'Neri',   lm: 'LM1', color: '#16a34a' },
  { pin: '1002', name: 'Mateos', lm: 'LM2', color: '#2563eb' },
  { pin: '1003', name: 'Erick',  lm: 'LM3', color: '#eab308', textColor: '#0a1628' },
  { pin: '1004', name: 'Luis',   lm: 'LM4', color: '#7c3aed' },
  { pin: '1005', name: 'Mario',  lm: 'LM5', color: '#db2877' },
]

export const MANAGER_PIN = '9999'

// ─── Schedule ─────────────────────────────────────────────────────────────────
export const SCHEDULE: Record<string, Record<string, string>> = {
  Monday:    { Neri: 'Sienna Cove',   Mateos: 'Woodlake Preserve',    Erick: 'Willow Walk',                 Luis: 'Birchwood',               Mario: 'Walden Woods' },
  Tuesday:   { Neri: 'Sienna Cove',   Mateos: 'Bridge Haven',         Erick: 'Willow Walk / Golden Meadow', Luis: 'Trotters Crossing',        Mario: 'Spring Rose' },
  Wednesday: { Neri: 'Sienna Cove',   Mateos: 'Bridge Haven',         Erick: 'Cheyenne Preserve',           Luis: 'Belmont Glen',             Mario: 'Boyette / Bell Lake' },
  Thursday:  { Neri: 'Wilder Meadow', Mateos: 'Altera / Walden Pond', Erick: 'Cedar Mills',                 Luis: 'Victory Landing / Altera', Mario: 'Camden Woods' },
}

// ─── Properties ───────────────────────────────────────────────────────────────
export const PROPERTY_COORDS: Record<string, { lat: number; lng: number; address?: string }> = {
  'Sienna Cove':       { lat: 28.2106, lng: -82.3370, address: 'Sienna Cove, Wesley Chapel, FL' },
  'Wilder Meadow':     { lat: 28.0167, lng: -82.1142, address: 'Wilder Meadow, Plant City, FL' },
  'Woodlake Preserve': { lat: 28.2189, lng: -82.4595, address: 'Woodlake Preserve, Land O Lakes, FL' },
  'Bridge Haven':      { lat: 28.2400, lng: -82.3500, address: 'Bridge Haven, Wesley Chapel, FL' },
  'Altera':            { lat: 28.0167, lng: -82.1142, address: 'Altera, Plant City, FL' },
  'Walden Pond':       { lat: 28.0167, lng: -82.1142, address: 'Walden Pond, Plant City, FL' },
  'Walden Woods':      { lat: 28.0167, lng: -82.1142, address: 'Walden Woods, Plant City, FL' },
  'Willow Walk':       { lat: 27.5210, lng: -82.5740, address: 'Willow Walk, Parrish, FL' },
  'Golden Meadow':     { lat: 27.5800, lng: -82.4250, address: 'Golden Meadow, Parrish, FL' },
  'Cheyenne Preserve': { lat: 27.8950, lng: -82.4150, address: 'Cheyenne Preserve, Riverview, FL' },
  'Cedar Mills':       { lat: 27.8364, lng: -82.3265, address: 'Cedar Mills, Riverview, FL' },
  'Birchwood':         { lat: 28.2189, lng: -82.4595, address: 'Birchwood, Land O Lakes, FL' },
  'Trotters Crossing': { lat: 28.2336, lng: -82.1812, address: 'Trotters Crossing, Wesley Chapel, FL' },
  'Belmont Glen':      { lat: 27.7200, lng: -82.4356, address: 'Belmont Glen, Riverview, FL' },
  'Victory Landing':   { lat: 27.8550, lng: -82.3700, address: 'Victory Landing, Riverview, FL' },
  'Spring Rose':       { lat: 27.8364, lng: -82.3265, address: 'Spring Rose, Riverview, FL' },
  'Boyette':           { lat: 28.2400, lng: -82.3500, address: 'Boyette, Wesley Chapel, FL' },
  'Bell Lake':         { lat: 28.2189, lng: -82.4595, address: 'Bell Lake, Land O Lakes, FL' },
  'Camden Woods':      { lat: 28.2400, lng: -82.3500, address: 'Camden Woods, Wesley Chapel, FL' },
  'Office / Yard':     { lat: 28.0500, lng: -82.2000, address: 'Cornerstone LLC, Tampa Bay, FL' },
}

export const ALL_PROPERTIES = [
  ...Object.keys(PROPERTY_COORDS).filter(p => p !== 'Office / Yard' && p !== 'Other'),
  'Office / Yard',
  'Other',
]

// ─── Stop types ───────────────────────────────────────────────────────────────
export type StopStatus = 'pending' | 'in_progress' | 'done' | 'skipped'

export const ISSUE_TYPES = [
  'Gate locked',
  'Dog out',
  'Irrigation broken',
  'Customer complaint',
  'Equipment issue',
  'Other',
]

// ─── Navigation deep-links ────────────────────────────────────────────────────
export function getNavigateUrl(propertyName: string, mode: 'google' | 'waze' | 'apple' = 'google'): string {
  const prop = PROPERTY_COORDS[propertyName]
  const address = prop?.address ?? `${propertyName}, Tampa Bay, FL`
  const encoded = encodeURIComponent(address)

  switch (mode) {
    case 'google':
      return `https://www.google.com/maps/dir/?api=1&destination=${encoded}&travelmode=driving&dir_action=navigate`
    case 'waze':
      return `https://waze.com/ul?q=${encoded}&navigate=yes`
    case 'apple':
      return `https://maps.apple.com/?daddr=${encoded}&dirflg=d`
  }
}

export function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function getTodayName(): string {
  return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()]
}

export function getScheduledProperty(crewName: string): string | null {
  return SCHEDULE[getTodayName()]?.[crewName] ?? null
}

// Parse "Willow Walk / Golden Meadow" → ["Willow Walk", "Golden Meadow"]
export function parseStops(raw: string): string[] {
  return raw.split('/').map(s => s.trim()).filter(Boolean)
}

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

export function formatTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export function fmtSecs(s: number): string {
  const h = Math.floor(s / 3600).toString().padStart(2, '0')
  const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0')
  const sec = (s % 60).toString().padStart(2, '0')
  return `${h}:${m}:${sec}`
}
