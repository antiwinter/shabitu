import pow from './pow.js'
import hsl from './hsl.js'
import chroma from './chroma.js'
import hueBucket from './hueBucket.js'

// Registry of available filters. Each filter is { id, label, apply(imageData) }.
export const filters = [hsl, pow, chroma, hueBucket]
export const defaultFilterId = filters[0].id
