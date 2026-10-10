import { useEffect, useRef, useState, useCallback } from 'react'

const stripLeadingDigits = (name) => name.replace(/^\d+/, '')
const fileUrl = (rel) => '/data/' + rel.split('/').map(encodeURIComponent).join('/')

function SquaredCanvas({ src }) {
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
      const d = imageData.data
      // lookup table: v/255 squared, back to 0..255
      const lut = new Uint8ClampedArray(256)
      for (let i = 0; i < 256; i++) {
        const x = i / 255
        lut[i] = Math.round(x * x * 255)
      }
      for (let i = 0; i < d.length; i += 4) {
        d[i] = lut[d[i]]
        d[i + 1] = lut[d[i + 1]]
        d[i + 2] = lut[d[i + 2]]
      }
      ctx.putImageData(imageData, 0, 0)
    }
    img.onerror = () => !cancelled && setError(true)
    img.src = src
    return () => {
      cancelled = true
    }
  }, [src])

  if (error) return <div className="err">Failed to load</div>
  return <canvas ref={canvasRef} />
}

export default function App() {
  const [datasets, setDatasets] = useState([])
  const [dataset, setDataset] = useState('')
  const [images, setImages] = useState([])
  const [index, setIndex] = useState(0)

  useEffect(() => {
    fetch('/api/datasets')
      .then((r) => r.json())
      .then((list) => {
        setDatasets(list)
        if (list.length) setDataset(list[0])
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
      </header>
      <main>
        {src ? (
          <>
            <figure>
              <img src={src} alt="original" />
              <figcaption>Original</figcaption>
            </figure>
            <figure>
              <SquaredCanvas src={src} />
              <figcaption>RGB² filter</figcaption>
            </figure>
          </>
        ) : (
          <div className="empty">No pictures</div>
        )}
      </main>
    </div>
  )
}
