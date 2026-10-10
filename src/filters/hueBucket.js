// Hue-bucket filter: for each pixel, snap hue to the center of a 10-degree bucket
// (h = floor((h - 5) / 10) * 10 + 5), then force S = 100% and L = 80%.
// Only hue information survives, so same-hue dots become identical colors.
export const HUE_STEP = 5
export const SATURATION = 1
export const LIGHTNESS = 0.8

function rgbToHue(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  if (delta === 0) return 0
  let h
  if (max === r) h = ((g - b) / delta) % 6
  else if (max === g) h = (b - r) / delta + 2
  else h = (r - g) / delta + 4
  h *= 60
  return h < 0 ? h + 360 : h
}

function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r, g, b
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255]
}

export default {
  id: 'hueBucket',
  label: `Hue bucket (${HUE_STEP}°, S100 L${Math.round(LIGHTNESS * 100)})`,
  apply(imageData) {
    const d = imageData.data
    const half = HUE_STEP / 2
    // cache by hue bucket index: at most 360/HUE_STEP distinct output colors
    const cache = new Map()
    for (let i = 0; i < d.length; i += 4) {
      let h = Math.floor((rgbToHue(d[i], d[i + 1], d[i + 2]) - half) / HUE_STEP) * HUE_STEP + half
      h = ((h % 360) + 360) % 360
      let rgb = cache.get(h)
      if (!rgb) {
        rgb = hslToRgb(h, SATURATION, LIGHTNESS)
        cache.set(h, rgb)
      }
      d[i] = rgb[0]
      d[i + 1] = rgb[1]
      d[i + 2] = rgb[2]
    }
  },
}
