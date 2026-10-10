// Saturation filter: convert RGB -> HSL, multiply S by SATURATION_BOOST (clamped to 1), convert back.
// Change this single value to adjust the filter (1 = no change, 1.5 = +50%, 0 = grayscale).
export const SATURATION_BOOST = 5

function boostSaturation(r, g, b, k) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const delta = max - min
  if (delta === 0) return [r * 255, g * 255, b * 255]
  let s = delta / (1 - Math.abs(2 * l - 1))
  let h
  if (max === r) h = ((g - b) / delta) % 6
  else if (max === g) h = (b - r) / delta + 2
  else h = (r - g) / delta + 4
  h *= 60
  if (h < 0) h += 360
  s = Math.min(1, s * k)
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let rr, gg, bb
  if (h < 60) [rr, gg, bb] = [c, x, 0]
  else if (h < 120) [rr, gg, bb] = [x, c, 0]
  else if (h < 180) [rr, gg, bb] = [0, c, x]
  else if (h < 240) [rr, gg, bb] = [0, x, c]
  else if (h < 300) [rr, gg, bb] = [x, 0, c]
  else [rr, gg, bb] = [c, 0, x]
  return [(rr + m) * 255, (gg + m) * 255, (bb + m) * 255]
}

export default {
  id: 'hsl',
  label: `HSL saturation ×${SATURATION_BOOST}`,
  // mutates ImageData.data in place
  apply(d) {
    for (let i = 0; i < d.length; i += 4) {
      const [r, g, b] = boostSaturation(d[i], d[i + 1], d[i + 2], SATURATION_BOOST)
      d[i] = r
      d[i + 1] = g
      d[i + 2] = b
    }
  },
}
