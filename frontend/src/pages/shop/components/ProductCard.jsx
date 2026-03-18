import { useEffect, useMemo, useState } from 'react'
import './ProductCard.css'

const templateImageCache = new Map()

const getApiOrigin = () => {
  const configuredBase = String(import.meta.env.VITE_API_BASE_URL || '/api').trim()
  if (/^https?:\/\//i.test(configuredBase)) {
    return configuredBase.replace(/\/api\/?$/, '')
  }
  return window.location.origin
}

const toCategoryList = (category) => {
  if (Array.isArray(category)) return category
  if (typeof category === 'string' && category.trim().includes(',')) {
    return category
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
  }
  return category ? [category] : []
}

const normalizeCategory = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '')

const toCleanUrl = (value) => {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (/^javascript:/i.test(raw)) return ''

  const unquoted = raw.replace(/^['\"]|['\"]$/g, '')

  if (
    (unquoted.startsWith('[') && unquoted.endsWith(']'))
    || (unquoted.startsWith('{') && unquoted.endsWith('}'))
  ) {
    try {
      const parsed = JSON.parse(unquoted)
      if (Array.isArray(parsed)) {
        return toCleanUrl(parsed[0]?.image_url || parsed[0]?.url || parsed[0]?.src || parsed[0])
      }
      if (parsed && typeof parsed === 'object') {
        return toCleanUrl(parsed.image_url || parsed.url || parsed.src)
      }
    } catch {
      // Fall back to the original string below.
    }
  }

  if (unquoted.startsWith('data:')) {
    // Browsers reject whitespace inside base64 payloads.
    return unquoted.replace(/\s+/g, '')
  }

  return unquoted
}

const normalizeResolvedUrl = (value) => {
  const url = toCleanUrl(value)
  if (!url) return ''
  if (url.startsWith('data:') || url.startsWith('blob:')) return url

  if (url.startsWith('http://') || url.startsWith('https://')) {
    // Prevent mixed-content failures when APIs return http URLs on https pages.
    if (typeof window !== 'undefined' && window.location?.protocol === 'https:' && url.startsWith('http://')) {
      try {
        const parsed = new URL(url)
        if (parsed.hostname === window.location.hostname) {
          return `https://${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}`
        }
      } catch {
        // Keep original absolute URL when parsing fails.
      }
    }
    return url
  }

  if (url.startsWith('/uploads/')) return `${getApiOrigin()}${url}`
  if (url.startsWith('/')) return url
  return `/${url.replace(/^\.?\//, '')}`
}

const toTemplatePathFallbacks = (url) => {
  if (!url || url.startsWith('data:') || url.startsWith('blob:')) return []
  if (!url.startsWith('/uploads/templates/')) return []

  const withoutQuery = url.split('?')[0]
  if (/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(withoutQuery)) return []

  return [
    `${withoutQuery}.png`,
    `${withoutQuery}.jpg`,
    `${withoutQuery}.jpeg`,
    `${withoutQuery}.webp`,
  ]
}

const dedupeUrls = (urls) => {
  const seen = new Set()
  return urls.filter((entry) => {
    const value = String(entry || '')
    if (!value || seen.has(value)) return false
    seen.add(value)
    return true
  })
}

const resolveCardImageCandidates = (product) => {
  const rawCandidates = [
    product?.image_url,
    product?.thumbnail_url,
    product?.originalData?.images?.[0]?.image_url,
    product?.originalData?.image_url,
  ]

  const normalized = rawCandidates
    .map((entry) => normalizeResolvedUrl(entry))
    .filter(Boolean)

  const extended = normalized.flatMap((entry) => [entry, ...toTemplatePathFallbacks(entry)])
  return dedupeUrls(extended)
}

const fetchTemplateFallbackImageUrl = async (templateId) => {
  const key = String(templateId || '').trim()
  if (!key) return ''
  if (templateImageCache.has(key)) {
    return templateImageCache.get(key) || ''
  }

  try {
    const response = await fetch(`${getApiOrigin()}/api/templates/${encodeURIComponent(key)}`)
    if (!response.ok) {
      templateImageCache.set(key, '')
      return ''
    }

    const payload = await response.json()
    const resolved = normalizeResolvedUrl(payload?.thumbnail_url || payload?.image_url)
    templateImageCache.set(key, resolved || '')
    return resolved || ''
  } catch {
    templateImageCache.set(key, '')
    return ''
  }
}

export default function ProductCard({ product }) {
  // Calculate discount if there's an old price
  const hasDiscount = product.old_price && product.old_price > product.price_amount
  const discountPercent = hasDiscount 
    ? Math.round(((product.old_price - product.price_amount) / product.old_price) * 100)
    : 0
  const isDigitalDownload = product.is_digital_download === true
  const isPatternProduct = toCategoryList(product.category)
    .some((entry) => normalizeCategory(entry) === 'patterns' || normalizeCategory(entry) === 'pattern')
  const manualProductId = String(product?.originalData?.id || '').trim()
  const linkedPatternId = String(product?.originalData?.related_links?.pattern_product_id || '').trim()
  const hasLinkedPattern = !isDigitalDownload
    && !isPatternProduct
    && Boolean(linkedPatternId)
    && (!manualProductId || linkedPatternId !== manualProductId)
  const shouldShowInstantDownload = isDigitalDownload || isPatternProduct
  const linkedTemplateId = String(product?.originalData?.related_links?.template_id || '').trim()
  const imageCandidates = useMemo(() => resolveCardImageCandidates(product), [product])
  const [candidateIndex, setCandidateIndex] = useState(0)
  const [templateFallbackUrl, setTemplateFallbackUrl] = useState('')
  const [hasRequestedTemplateFallback, setHasRequestedTemplateFallback] = useState(false)
  const [imageExhausted, setImageExhausted] = useState(false)

  useEffect(() => {
    setCandidateIndex(0)
    setTemplateFallbackUrl('')
    setHasRequestedTemplateFallback(false)
    setImageExhausted(false)
  }, [product?.id, imageCandidates])

  const activeImageUrl = imageExhausted
    ? ''
    : (templateFallbackUrl || imageCandidates[candidateIndex] || '')

  const handleCardImageError = () => {
    if (templateFallbackUrl) {
      setTemplateFallbackUrl('')
    }

    if (candidateIndex < imageCandidates.length - 1) {
      setCandidateIndex((prev) => prev + 1)
      return
    }

    if (!hasRequestedTemplateFallback && linkedTemplateId) {
      setHasRequestedTemplateFallback(true)
      fetchTemplateFallbackImageUrl(linkedTemplateId).then((fallbackUrl) => {
        if (fallbackUrl) {
          const normalizedFallback = normalizeResolvedUrl(fallbackUrl)
          if (normalizedFallback && !imageCandidates.includes(normalizedFallback)) {
            setTemplateFallbackUrl(normalizedFallback)
            return
          }
        }
        setImageExhausted(true)
      })
      return
    }

    setImageExhausted(true)
  }

  return (
    <a href={`#/product/${product.id}`} className="product-card-link">
      <article className="product-card">
        <div className="card-image">
          {hasDiscount && <span className="sale-badge">On Sale</span>}
          {activeImageUrl ? (
            <img src={activeImageUrl} alt={product.title || 'Glass art'} onError={handleCardImageError} />
          ) : (
            <div className="image-placeholder">No image</div>
          )}
        </div>
        <div className="card-body">
          <h3 className="card-title">{product.title || 'Untitled piece'}</h3>
          <div className="card-pricing">
            <div className="price-row">
              {hasDiscount ? (
                <>
                  <span className="sale-price">Sale price ${product.price_amount || '0'}</span>
                  <span className="regular-price">(reg ${product.old_price || '0'})</span>
                </>
              ) : (
                <span className="price">
                  ${product.price_amount || '0'}
                </span>
              )}
              {hasDiscount && (
                <>
                  <span className="discount">({discountPercent}% off)</span>
                </>
              )}
            </div>
            {product.free_shipping && (
              <span className="free-shipping">FREE shipping</span>
            )}
            {shouldShowInstantDownload && (
              <span className="instant-download-badge">Instant download</span>
            )}
            {hasLinkedPattern && (
              <span className="pattern-available-badge">Pattern available</span>
            )}
          </div>
        </div>
      </article>
    </a>
  )
}
