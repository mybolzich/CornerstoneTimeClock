/**
 * Lightweight IndexedDB outbox for payroll-critical events.
 * Queues a write locally → attempts Firestore immediately →
 * retries on reconnect / app restart.
 */

const DB_NAME  = 'tc_outbox'
const DB_VER   = 1
const STORE    = 'queue'

interface QueuedItem {
  id:        string
  type:      string
  payload:   unknown
  queuedAt:  number
  retries:   number
}

let _db: IDBDatabase | null = null

async function openDb(): Promise<IDBDatabase> {
  if (_db) return _db
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'id' })
    }
    req.onsuccess = () => { _db = req.result; resolve(req.result) }
    req.onerror   = () => reject(req.error)
  })
}

export async function enqueue(type: string, payload: unknown): Promise<string> {
  const db   = await openDb()
  const item: QueuedItem = {
    id:       `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type, payload,
    queuedAt: Date.now(),
    retries:  0,
  }
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readwrite')
    const req = tx.objectStore(STORE).add(item)
    req.onsuccess = () => resolve(item.id)
    req.onerror   = () => reject(req.error)
  })
}

export async function dequeue(id: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readwrite')
    const req = tx.objectStore(STORE).delete(id)
    req.onsuccess = () => resolve()
    req.onerror   = () => reject(req.error)
  })
}

export async function listQueue(): Promise<QueuedItem[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).getAll()
    req.onsuccess = () => resolve(req.result as QueuedItem[])
    req.onerror   = () => reject(req.error)
  })
}

export async function incrementRetry(id: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const get   = store.get(id)
    get.onsuccess = () => {
      const item = get.result as QueuedItem
      if (!item) { resolve(); return }
      const put = store.put({ ...item, retries: item.retries + 1 })
      put.onsuccess = () => resolve()
      put.onerror   = () => reject(put.error)
    }
    get.onerror = () => reject(get.error)
  })
}
