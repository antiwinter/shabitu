import { useEffect, useRef, useState, useCallback } from 'react'
import { filters, defaultFilterId } from './filters/index.js'

const STORAGE_KEYS = { dataset: 'shabitu.dataset', filter: 'shabitu.filter' }
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
  const [filterId, setFilterId] = useState(() => {
    const saved = loadSaved(STORAGE_KEYS.filter)
    return filters.some((f) => f.id === saved) ? saved : defaultFilterId
  })

  const filter = filters.find((f) => f.id === filterId) || filters[0]

  useEffect(() => {
    save(STORAGE_KEYS.filter, filterId)
  }, [filterId])

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
        if (!cancelled) setImages(list)
      })
    return () => {
      cancelled = true
    }
  }, [dataset])

  const onKey = useCallback(
    (e) => {
      if (e.target.tagName === 'SELECT') return
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1))
      else if (e.key === 'ArrowRight')
        setIndex((i) => Math.min(images.length - 1, i + 1))
    },
    [images.length],
  )

  useEffect(() => {
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onKey])

  const current = images[index]
  const src = current ? fileUrl(current) : null

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
        <span className="info">
          {images.length ? `${index + 1} / ${images.length}` : '0 / 0'}
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
              <img src={src} alt="original" />
              <figcaption>Original</figcaption>
            </figure>
            <figure>
              <FilteredCanvas src={src} filter={filter} />
              <figcaption>{filter.label}</figcaption>
            </figure>
          </>
        ) : (
          <div className="empty">No pictures</div>
        )}
      </main>
    </div>
  )
}
