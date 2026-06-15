const DIMENSION_NUMBER_PATTERN = /^\d+(?:\.\d+)?$/

const cleanDimensionToken = (value) => {
  const raw = String(value ?? '').trim()
  if (!raw) return ''

  const normalized = raw
    .replace(/inches?|inch|in\.?/gi, '')
    .replace(/["']/g, '')
    .replace(/,/g, '')
    .trim()

  if (!normalized) return ''
  return DIMENSION_NUMBER_PATTERN.test(normalized) ? normalized : ''
}

const parseDimensionString = (value) => {
  const raw = String(value ?? '').trim()
  if (!raw) return { width: '', height: '' }

  const normalized = raw
    .replace(/[×xX]/g, 'x')
    .replace(/\s+/g, ' ')

  const pairMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(?:"|in(?:ches?)?\.?)?\s*x\s*(\d+(?:\.\d+)?)\s*(?:"|in(?:ches?)?\.?)?/i)
  if (pairMatch) {
    return {
      width: cleanDimensionToken(pairMatch[1]),
      height: cleanDimensionToken(pairMatch[2]),
    }
  }

  return { width: '', height: '' }
}

const pickFirstDimensionValue = (sources, keys) => {
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue
    for (const key of keys) {
      if (!(key in source)) continue
      const cleaned = cleanDimensionToken(source[key])
      if (cleaned) return cleaned
    }
  }
  return ''
}

export const getProductDimensionsLabel = (product) => {
  const sources = [
    product,
    product?.originalData,
    product?.manualProductDetails,
  ]

  let width = pickFirstDimensionValue(sources, ['width', 'width_inches', 'width_in', 'widthInches'])
  let height = pickFirstDimensionValue(sources, ['height', 'height_inches', 'height_in', 'heightInches'])

  if (!width || !height) {
    for (const source of sources) {
      if (!source || typeof source !== 'object') continue
      const parsed = parseDimensionString(source.dimensions || source.dimension || source.size)
      if (!width && parsed.width) width = parsed.width
      if (!height && parsed.height) height = parsed.height
      if (width && height) break
    }
  }

  if (!width || !height) return ''
  return `${width}" x ${height}"`
}
