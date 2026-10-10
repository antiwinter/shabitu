import pow from './pow.js'
import hsl from './hsl.js'

// Registry of available filters. Each filter is { id, label, apply(imageData) }.
export const filters = [hsl, pow]
export const defaultFilterId = filters[0].id
