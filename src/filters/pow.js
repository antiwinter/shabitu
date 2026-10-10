// Power filter: each channel c (0..1) becomes c ** POWER.
// Change this single value to adjust the filter (1 = no change, 2 = square, 3 = cube, ...).
export const POWER = 3

export default {
  id: 'pow',
  label: `Power (c^${POWER})`,
  apply(imageData) {
    const d = imageData.data
    const lut = new Uint8ClampedArray(256)
    for (let i = 0; i < 256; i++) {
      lut[i] = Math.round(Math.pow(i / 255, POWER) * 255)
    }
    for (let i = 0; i < d.length; i += 4) {
      d[i] = lut[d[i]]
      d[i + 1] = lut[d[i + 1]]
      d[i + 2] = lut[d[i + 2]]
    }
  },
}
