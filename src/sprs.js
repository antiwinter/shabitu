// Small spaced-repetition scheduler (SPRS).
//
// ---- Tunable parameters -------------------------------------------------
// Review intervals in days. The n-th consecutive "known" mark schedules the
// picture INTERVALS_DAYS[n] days ahead; past the end, the last value is reused.
export const INTERVALS_DAYS = [1, 3, 7, 14, 30, 60, 120, 240]
// Optional random spread (+/- fraction of the interval) so cards don't clump.
export const JITTER = 0.1
// -------------------------------------------------------------------------

const DB_KEY = 'shabitu.sprs'
const DAY_MS = 24 * 60 * 60 * 1000

// db shape: { [imagePath]: { step: number, due: epochMs } }
// A picture without an entry is "new".

export const loadDb = () => {
  try {
    const raw = localStorage.getItem(DB_KEY)
    const db = raw ? JSON.parse(raw) : {}
    return db && typeof db === 'object' ? db : {}
  } catch {
    return {}
  }
}

export const saveDb = (db) => {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db))
  } catch {
    // ignore storage errors (private mode, quota, ...)
  }
}

// new (no entry) or due (due time reached)
export const isNewOrDue = (db, id, now = Date.now()) => {
  const entry = db[id]
  return !entry || entry.due <= now
}

// 'known': advance one step and schedule the next review
export const markKnown = (db, id, now = Date.now()) => {
  const step = db[id] ? db[id].step + 1 : 0
  const days = INTERVALS_DAYS[Math.min(step, INTERVALS_DAYS.length - 1)]
  const spread = 1 + (Math.random() * 2 - 1) * JITTER
  return { ...db, [id]: { step, due: now + days * DAY_MS * spread } }
}

// 'don't know': forget the picture, so it is treated as new again
export const markUnknown = (db, id) => {
  const { [id]: _removed, ...rest } = db
  return rest
}
