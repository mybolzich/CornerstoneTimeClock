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
  { pin: '1005', name: 'Mario',  lm: 'LM5', color: '#db2777' },
]

export const MANAGER_PIN = '9999'

export const SCHEDULE: Record<string, Record<string, string>> = {
  Monday:    { Neri: 'Sienna Cove',   Mateos: 'Woodlake Preserve',    Erick: 'Willow Walk',               Luis: 'Birchwood',               Mario: 'Walden Woods' },
  Tuesday:   { Neri: 'Sienna Cove',   Mateos: 'Bridge Haven',         Erick: 'Willow Walk / Golden Meadow', Luis: 'Trotters Crossing',       Mario: 'Spring Rose' },
  Wednesday: { Neri: 'Sienna Cove',   Mateos: 'Bridge Haven',         Erick: 'Cheyenne Preserve',         Luis: 'Belmont Glen',             Mario: 'Boyette / Bell Lake' },
  Thursday:  { Neri: 'Wilder Meadow', Mateos: 'Altera / Walden Pond', Erick: 'Cedar Mills',               Luis: 'Victory Landing / Altera', Mario: 'Camden Woods' },
}

export const PROPERTY_COORDS: Record<string, { lat: number; lng: number }> = {
  'Sienna Cove':       { lat: 28.2106, lng: -82.3370 },
  'Wilder Meadow':     { lat: 28.0167, lng: -82.1142 },
  'Woodlake Preserve': { lat: 28.2189, lng: -82.4595 },
  'Bridge Haven':      { lat: 28.2400, lng: -82.3500 },
  'Altera':            { lat: 28.0167, lng: -82.1142 },
  'Walden Pond':       { lat: 28.0167, lng: -82.1142 },
  'Walden Woods':      { lat: 28.0167, lng: -82.1142 },
  'Willow Walk':       { lat: 27.5210, lng: -82.5740 },
  'Golden Meadow':     { lat: 27.5800, lng: -82.4250 },
  'Cheyenne Preserve': { lat: 27.8950, lng: -82.4150 },
  'Cedar Mills':       { lat: 27.8364, lng: -82.3265 },
  'Birchwood':         { lat: 28.2189, lng: -82.4595 },
  'Trotters Crossing': { lat: 28.2336, lng: -82.1812 },
  'Belmont Glen':      { lat: 27.7200, lng: -82.4356 },
  'Victory Landing':   { lat: 27.8550, lng: -82.3700 },
  'Spring Rose':       { lat: 27.8364, lng: -82.3265 },
  'Boyette':           { lat: 28.2400, lng: -82.3500 },
  'Bell Lake':         { lat: 28.2189, lng: -82.4595 },
  'Camden Woods':      { lat: 28.2400, lng: -82.3500 },
  'Office / Yard':     { lat: 28.0500, lng: -82.2000 },
}

export const ALL_PROPERTIES = [
  ...Object.keys(PROPERTY_COORDS).filter(p => p !== 'Office / Yard' && p !== 'Other'),
  'Office / Yard',
  'Other'
]

export function getTodayName(): string {
  return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()]
}

export function getScheduledProperty(crewName: string): string | null {
  const day = getTodayName()
  return SCHEDULE[day]?.[crewName] ?? null
}

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export function formatTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}
