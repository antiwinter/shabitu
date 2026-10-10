import initSqlJs from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import JSZip from 'jszip'

// Builds an Anki package (.apkg): a zip holding a legacy-schema (v11) sqlite collection,
// a media map and the media files. Each picture becomes one note:
//   Front = original image, Back = the image run through the current filter.

const MODEL_ID = 1700000000001
const SEP = '\x1f'

const SCHEMA = `
CREATE TABLE col (id integer primary key, crt integer not null, mod integer not null, scm integer not null,
  ver integer not null, dty integer not null, usn integer not null, ls integer not null,
  conf text not null, models text not null, decks text not null, dconf text not null, tags text not null);
CREATE TABLE notes (id integer primary key, guid text not null, mid integer not null, mod integer not null,
  usn integer not null, tags text not null, flds text not null, sfld integer not null,
  csum integer not null, flags integer not null, data text not null);
CREATE TABLE cards (id integer primary key, nid integer not null, did integer not null, ord integer not null,
  mod integer not null, usn integer not null, type integer not null, queue integer not null,
  due integer not null, ivl integer not null, factor integer not null, reps integer not null,
  lapses integer not null, left integer not null, odue integer not null, odid integer not null,
  flags integer not null, data text not null);
CREATE TABLE revlog (id integer primary key, cid integer not null, usn integer not null, ease integer not null,
  ivl integer not null, lastIvl integer not null, factor integer not null, time integer not null,
  type integer not null);
CREATE TABLE graves (usn integer not null, oid integer not null, type integer not null);
CREATE INDEX ix_notes_usn on notes (usn);
CREATE INDEX ix_cards_usn on cards (usn);
CREATE INDEX ix_revlog_usn on revlog (usn);
CREATE INDEX ix_cards_nid on cards (nid);
CREATE INDEX ix_cards_sched on cards (did, queue, due);
CREATE INDEX ix_notes_csum on notes (csum);
`

const CSS = `.card { font-family: arial; font-size: 20px; text-align: center; color: black; background-color: white; }
.card img { max-width: 100%; height: auto; }`

const sha1Int = async (text) => {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text))
  const hex = [...new Uint8Array(buf).slice(0, 4)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return parseInt(hex, 16)
}

const randomGuid = () => {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%&()*+,-./:;<=>?@[]^_`{|}~'
  const bytes = crypto.getRandomValues(new Uint8Array(10))
  return [...bytes].map((b) => chars[b % chars.length]).join('')
}

const hashString = (s) => {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0
  return h
}

const canvasToBlob = (canvas) =>
  new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'),
  )

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load ' + src))
    img.src = src
  })

async function filteredPng(src, filter) {
  const img = await loadImage(src)
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0)
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
  filter.apply(data)
  ctx.putImageData(data, 0, 0)
  return canvasToBlob(canvas)
}

/**
 * @param {object} opts
 * @param {string} opts.deckName   name of the Anki deck
 * @param {string[]} opts.images   relative picture ids ("dataset/path/file.png")
 * @param {(rel: string) => string} opts.urlFor  maps an id to a fetchable URL
 * @param {{id: string, label: string, apply: Function}} opts.filter
 * @param {(done: number, total: number) => void} [opts.onProgress]
 * @returns {Promise<Blob>} the .apkg file
 */
export async function buildApkg({ deckName, images, urlFor, filter, onProgress }) {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl })
  const db = new SQL.Database()
  db.run(SCHEMA)

  const nowMs = Date.now()
  const nowSec = Math.floor(nowMs / 1000)
  const deckId = nowMs
  const deckKey = String(deckId)

  const model = {
    id: MODEL_ID,
    name: 'Shabitu Picture',
    type: 0,
    mod: nowSec,
    usn: -1,
    sortf: 0,
    did: deckId,
    tmpls: [
      {
        name: 'Card 1',
        ord: 0,
        qfmt: '{{Front}}',
        afmt: '{{Back}}',
        bqfmt: '',
        bafmt: '',
        did: null,
        bfont: '',
        bsize: 0,
      },
    ],
    flds: ['Front', 'Back'].map((name, ord) => ({
      name,
      ord,
      sticky: false,
      rtl: false,
      font: 'Arial',
      size: 20,
      media: [],
    })),
    css: CSS,
    latexPre:
      '\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n',
    latexPost: '\\end{document}',
    latexsvg: false,
    req: [[0, 'all', [0]]],
    tags: [],
    vers: [],
  }

  const deckBase = {
    mod: nowSec,
    usn: -1,
    lrnToday: [0, 0],
    revToday: [0, 0],
    newToday: [0, 0],
    timeToday: [0, 0],
    collapsed: false,
    desc: '',
    dyn: 0,
    conf: 1,
    extendNew: 10,
    extendRev: 50,
  }
  const decks = {
    1: { ...deckBase, id: 1, name: 'Default' },
    [deckKey]: { ...deckBase, id: deckId, name: deckName },
  }
  const dconf = {
    1: {
      id: 1,
      mod: 0,
      name: 'Default',
      usn: 0,
      maxTaken: 60,
      autoplay: true,
      timer: 0,
      replayq: true,
      new: { bury: true, delays: [1, 10], initialFactor: 2500, ints: [1, 4, 7], order: 1, perDay: 20 },
      rev: { bury: true, ease4: 1.3, ivlFct: 1, maxIvl: 36500, perDay: 200, hardFactor: 1.2 },
      lapse: { delays: [10], leechAction: 1, leechFails: 8, minInt: 1, mult: 0 },
      dyn: false,
    },
  }
  const conf = {
    nextPos: images.length + 1,
    estTimes: true,
    activeDecks: [deckId],
    sortType: 'noteFld',
    timeLim: 0,
    sortBackwards: false,
    addToCur: true,
    curDeck: deckId,
    newBury: true,
    newSpread: 0,
    dueCounts: true,
    curModel: String(MODEL_ID),
    collapseTime: 1200,
  }

  db.run('INSERT INTO col VALUES (1,?,?,?,11,0,0,0,?,?,?,?,?)', [
    nowSec,
    nowMs,
    nowMs,
    JSON.stringify(conf),
    JSON.stringify({ [MODEL_ID]: model }),
    JSON.stringify(decks),
    JSON.stringify(dconf),
    '{}',
  ])

  const zip = new JSZip()
  const media = {}
  const insNote = db.prepare('INSERT INTO notes VALUES (?,?,?,?,?,?,?,?,?,?,?)')
  const insCard = db.prepare('INSERT INTO cards VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')

  for (let i = 0; i < images.length; i++) {
    const rel = images[i]
    const res = await fetch(urlFor(rel))
    if (!res.ok) throw new Error(`Failed to fetch ${rel}`)
    const original = await res.blob()
    const ext = (rel.match(/\.([a-z0-9]+)$/i)?.[1] || 'png').toLowerCase()
    const tag = hashString(rel).toString(36)
    const origName = `shabitu_${tag}_${i}_o.${ext}`
    const refName = `shabitu_${tag}_${i}_r.png`

    const refBlob = await filteredPng(URL.createObjectURL(original), filter)
    zip.file(String(i * 2), original)
    zip.file(String(i * 2 + 1), refBlob)
    media[i * 2] = origName
    media[i * 2 + 1] = refName

    const front = `<img src="${origName}">`
    const back = `<img src="${refName}">`
    const noteId = nowMs + i
    insNote.run([
      noteId,
      randomGuid(),
      MODEL_ID,
      nowSec,
      -1,
      '',
      front + SEP + back,
      front,
      await sha1Int(front),
      0,
      '',
    ])
    insCard.run([noteId, noteId, deckId, 0, nowSec, -1, 0, 0, i + 1, 0, 0, 0, 0, 0, 0, 0, 0, ''])
    onProgress?.(i + 1, images.length)
  }
  insNote.free()
  insCard.free()

  zip.file('collection.anki2', db.export())
  zip.file('media', JSON.stringify(media))
  db.close()
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
}
