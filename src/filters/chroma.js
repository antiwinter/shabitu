// Color-blind-test-pattern filter.
// Ishihara-style plates randomize dot lightness, so the figure is only separable by hue.
// Idea: convert to Lab, drop L, run PCA on the (a*, b*) chroma plane, project every pixel
// onto the principal axis (the direction of greatest color variation = figure vs background),
// then stretch that to full-range grayscale so the hue difference becomes a brightness difference.

// Percentiles used for contrast stretching (ignore outliers such as the white page edge).
export const LOW_PERCENTILE = 0.01
export const HIGH_PERCENTILE = 0.99

const srgbToLinear = (v) => {
  v /= 255
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

const labF = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116)

// returns [a*, b*] for an sRGB pixel (D65)
function toChroma(r, g, b) {
  const R = srgbToLinear(r)
  const G = srgbToLinear(g)
  const B = srgbToLinear(b)
  const x = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047
  const y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B
  const z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883
  const fx = labF(x)
  const fy = labF(y)
  const fz = labF(z)
  return [500 * (fx - fy), 200 * (fy - fz)]
}

export default {
  id: 'chroma',
  label: 'Color-blind assist (chroma PCA)',
  apply(imageData) {
    const d = imageData.data
    const n = d.length / 4
    const A = new Float32Array(n)
    const B = new Float32Array(n)

    // cache by packed RGB: plates have few distinct colors, and it saves the cbrt work
    const cache = new Map()
    let sumA = 0
    let sumB = 0
    for (let p = 0; p < n; p++) {
      const i = p * 4
      const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2]
      let c = cache.get(key)
      if (!c) {
        c = toChroma(d[i], d[i + 1], d[i + 2])
        cache.set(key, c)
      }
      A[p] = c[0]
      B[p] = c[1]
      sumA += c[0]
      sumB += c[1]
    }
    const meanA = sumA / n
    const meanB = sumB / n

    // 2x2 covariance matrix of (a*, b*)
    let saa = 0
    let sab = 0
    let sbb = 0
    for (let p = 0; p < n; p++) {
      const da = A[p] - meanA
      const db = B[p] - meanB
      saa += da * da
      sab += da * db
      sbb += db * db
    }
    saa /= n
    sab /= n
    sbb /= n

    // principal eigenvector of [[saa, sab], [sab, sbb]]
    const theta = 0.5 * Math.atan2(2 * sab, saa - sbb)
    const ux = Math.cos(theta)
    const uy = Math.sin(theta)

    // project, then find the percentile range
    const proj = new Float32Array(n)
    for (let p = 0; p < n; p++) {
      proj[p] = (A[p] - meanA) * ux + (B[p] - meanB) * uy
    }
    const sorted = Float32Array.from(proj).sort()
    const lo = sorted[Math.floor((n - 1) * LOW_PERCENTILE)]
    const hi = sorted[Math.floor((n - 1) * HIGH_PERCENTILE)]
    const range = hi - lo || 1

    for (let p = 0; p < n; p++) {
      const v = ((proj[p] - lo) / range) * 255 // Uint8ClampedArray clamps and rounds
      const i = p * 4
      d[i] = v
      d[i + 1] = v
      d[i + 2] = v
    }
  },
}
