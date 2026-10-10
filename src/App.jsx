import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { filters, defaultFilterId } from './filters/index.js'
import { loadDb, saveDb, isNewOrDue, markKnown, markUnknown } from './sprs.js'

const STORAGE_KEYS = {
  dataset: 'shabitu.dataset',
  filter: 'shabitu.filter',
  image: 'shabitu.image',
  learn: 'shabitu.learn',
}
const loadSaved = (key) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
const save = (key, value) => {
  try {
    localStorage.setItem(key, value)
  } catch {
    // ignore storage errors (private mode, quota, ...)
  }
}

const stripLeadingDigits = (name) => name.replace(/^\d+/, '')
const fileUrl = (rel) => '/data/' + rel.split('/').map(encodeURIComponent).join('/')

function FilteredCanvas({ src, filter }) {
  const canvasRef = useRef(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setError(false)
    const img = new Image()
    img.onload = () => {
      if (cancelled) return
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      filter.apply(imageData)
      ctx.putImageData(imageData, 0, 0)
    }
    img.onerror = () => !cancelled && setError(true)
    img.src = src
    return () => {
      cancelled = true
    }
  }, [src, filter])

  if (error) return <div className="err">Failed to load</div>
  return <canvas ref={canvasRef} />
}

export default function App() {
  const [datasets, setDatasets] = useState([])
  const [dataset, setDataset] = useState('')
  const [images, setImages] = useState([])
  const [index, setIndex] = useState(0)
  const [showRef, setShowRef] = useState(false)
  const [filterId, setFilterId] = useState(() => {
    const saved = loadSaved(STORAGE_KEYS.filter)
    return filters.some((f) => f.id === saved) ? saved : defaultFilterId
  })

  const [learn, setLearn] = useState(() => loadSaved(STORAGE_KEYS.learn) === '1')
  const [db, setDb] = useState(loadDb)
  const dbRef = useRef(db)
  dbRef.current = db
  const pendingImage = useRef(null) // picture to jump to once the visible list is rebuilt

  const filter = filters.find((f) => f.id === filterId) || filters[0]

  useEffect(() => {
    save(STORAGE_KEYS.filter, filterId)
  }, [filterId])

  useEffect(() => {
    save(STORAGE_KEYS.learn, learn ? '1' : '0')
  }, [learn])

  useEffect(() => {
    saveDb(db)
  }, [db])

  // The list being browsed. In learn mode it is a snapshot of new/due pictures taken when
  // the dataset or mode changes (db is read via ref on purpose), so marking a picture
  // doesn't reshuffle the list under the cursor.
  const visible = useMemo(
    () => (learn ? images.filter((id) => isNewOrDue(dbRef.current, id)) : images),
    [images, learn],
  )

  useEffect(() => {
    if (dataset) save(STORAGE_KEYS.dataset, dataset)
  }, [dataset])

  useEffect(() => {
    fetch('/api/datasets')
      .then((r) => r.json())
      .then((list) => {
        setDatasets(list)
        const saved = loadSaved(STORAGE_KEYS.dataset)
        if (list.length) setDataset(list.includes(saved) ? saved : list[0])
      })
  }, [])

  useEffect(() => {
    if (!dataset) return
    let cancelled = false
    setImages([])
    setIndex(0)
    fetch('/api/images?dataset=' + encodeURIComponent(dataset))
      .then((r) => r.json())
      .then((list) => {
        if (cancelled) return
        // restore the last viewed picture once the visible list is built (see effect below)
        pendingImage.current = loadSaved(STORAGE_KEYS.image)
        setImages(list)
      })
    return () => {
      cancelled = true
    }
  }, [dataset])

  // once the visible list is available, jump to the wanted picture (saved one / current one)
  useEffect(() => {
    if (!visible.length) return
    const want = pendingImage.current
    pendingImage.current = null
    const i = want ? visible.indexOf(want) : -1
    // fall back to a clamped index when the wanted picture isn't in the list
    setIndex((cur) => (i >= 0 ? i : Math.min(cur, visible.length - 1)))
  }, [visible])

  const current = visible[index]
  const src = current ? fileUrl(current) : null

  const onKey = useCallback(
    (e) => {
      if (e.target.tagName === 'SELECT') return
      const last = visible.length - 1
      if (e.key === 'ArrowLeft' || e.key === 'k') {
        setIndex((i) => Math.max(0, i - 1))
        setShowRef(false)
      } else if (e.key === 'ArrowRight' || e.key === 'j') {
        setIndex((i) => Math.min(last, i + 1))
        setShowRef(false)
      } else if (e.key === ' ') {
        e.preventDefault()
        setShowRef((v) => !v)
      } else if (showRef && current && (e.key === 'h' || e.key === 'l' || e.key === 'Enter')) {
        e.preventDefault()
        const known = e.key !== 'h'
        setDb((d) => (known ? markKnown(d, current) : markUnknown(d, current)))
        setIndex((i) => Math.min(last, i + 1))
        setShowRef(false)
      }
    },
    [visible.length, showRef, current],
  )

  useEffect(() => {
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onKey])

  // persist the picture being viewed (only once images are loaded, so a reload can restore it)
  useEffect(() => {
    if (current) save(STORAGE_KEYS.image, current)
  }, [current])

  return (
    <div className="app">
      <header>
        <select
          value={dataset}
          onChange={(e) => {
            setDataset(e.target.value)
            e.target.blur()
          }}
        >
          {datasets.map((d) => (
            <option key={d} value={d}>
              {stripLeadingDigits(d)}
            </option>
          ))}
        </select>
        <label className="learn-toggle" title="Only show new and due pictures">
          <input
            type="checkbox"
            checked={learn}
            onChange={(e) => {
              // keep the current picture selected when the list is rebuilt
              pendingImage.current = current || null
              setLearn(e.target.checked)
              setShowRef(false)
              e.target.blur()
            }}
          />
          learn
        </label>
        <span className="info">
          {visible.length ? `${index + 1} / ${visible.length}` : '0 / 0'}
          {current && ` — ${current.split('/').slice(1).join('/')}`}
        </span>
        <select
          style={{ marginLeft: 'auto' }}
          value={filterId}
          onChange={(e) => {
            setFilterId(e.target.value)
            e.target.blur()
          }}
        >
          {filters.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </header>
      <main>
        {src ? (
          <>
            <figure>
              {showRef ? (
                <FilteredCanvas src={src} filter={filter} />
              ) : (
                <img src={src} alt="original image" />
              )}
              <figcaption>
                {showRef ? `Ref image — ${filter.label}` : 'Original image'} (space to toggle)
              </figcaption>
            </figure>
          </>
        ) : (
          <div className="empty">No pictures</div>
        )}
      </main>
    </div>
  )
}
