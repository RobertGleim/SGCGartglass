import { useEffect, useMemo, useState } from 'react'
import './ProductCard.css'
import { getProductDimensionsLabel } from '../../../utils/productDimensions'
import { getProductItemNumber } from '../../../utils/itemNumber'

const templateImageCache = new Map()
const manualCardImageCache = new Map()
const MANUAL_CARD_IMAGE_CACHE_KEY_PREFIX = 'sgcg_manual_card_image_v1:'

const readManualCardImageCache = (productId) => {
  const key = String(productId || '').trim()
  if (!key) return ''
  if (manualCardImageCache.has(key)) {
    return manualCardImageCache.get(key) || ''
  }

  try {
    const stored = window.localStorage.getItem(`${MANUAL_CARD_IMAGE_CACHE_KEY_PREFIX}${key}`)
    if (!stored) return ''
    manualCardImageCache.set(key, stored)
    return stored
  } catch {
    return ''
  }
}

const writeManualCardImageCache = (productId, imageUrl) => {
  const key = String(productId || '').trim()
  const value = String(imageUrl || '').trim()
  if (!key || !value) return

  manualCardImageCache.set(key, value)
  try {
    window.localStorage.setItem(`${MANUAL_CARD_IMAGE_CACHE_KEY_PREFIX}${key}`, value)
  } catch {
    // Ignore storage quota/private mode issues.
  }
}

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

const parseBooleanLike = (value) => {
  if (value === true || value === false) return value
  if (value === 1 || value === 0) return Boolean(value)
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return null
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false
  return null
}

const toCleanUrl = (value) => {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (/^javascript:/i.test(raw)) return ''

  const unquoted = raw.replace(/^['"]|['"]$/g, '')

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

const hexStringToBytes = (value) => {
  const hex = String(value || '').trim()
  if (!hex || hex.length % 2 !== 0) return null
  const bytes = new Uint8Array(hex.length / 2)
  for (let index = 0; index < hex.length; index += 2) {
    bytes[index / 2] = parseInt(hex.slice(index, index + 2), 16)
  }
  return bytes
}

const normalizeBase64String = (value) => {
  const cleaned = String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/-/g, '+')
    .replace(/_/g, '/')

  if (!cleaned || /[^A-Za-z0-9+/=]/.test(cleaned)) return ''

  const paddedLength = Math.ceil(cleaned.length / 4) * 4
  return cleaned.padEnd(paddedLength, '=')
}

const bytesToBase64 = (bytes) => {
  if (!bytes || bytes.length === 0) return ''
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return window.btoa(binary)
}

const mediaTypeFromEntry = (entry) => {
  const mediaType = String(entry?.media_type || '').toLowerCase()
  const imageUrl = String(entry?.image_url || '')
  if (mediaType.startsWith('image/')) return mediaType
  if (/\.png($|\?)/i.test(imageUrl)) return 'image/png'
  if (/\.webp($|\?)/i.test(imageUrl)) return 'image/webp'
  if (/\.gif($|\?)/i.test(imageUrl)) return 'image/gif'
  if (/\.svg($|\?)/i.test(imageUrl)) return 'image/svg+xml'
  return 'image/jpeg'
}

const imageDataToDataUrl = (entry) => {
  const rawImageData = String(entry?.image_data || '').trim()
  if (!rawImageData) return ''
  if (rawImageData.startsWith('data:')) return rawImageData.replace(/\s+/g, '')

  const mimeType = mediaTypeFromEntry(entry)
  const hexBytes = /^[0-9a-f]+$/i.test(rawImageData) && rawImageData.length % 2 === 0
    ? hexStringToBytes(rawImageData)
    : null

  if (hexBytes && hexBytes.length > 0) {
    const base64 = bytesToBase64(hexBytes)
    return base64 ? `data:${mimeType};base64,${base64}` : ''
  }

  const base64 = normalizeBase64String(rawImageData)
  return base64 ? `data:${mimeType};base64,${base64}` : ''
}

const resolveImageEntryUrl = (entry) => {
  if (!entry || typeof entry !== 'object') return normalizeResolvedUrl(entry)

  if (entry.image_data && typeof entry.image_data === 'string') {
    try {
      const dataUrl = imageDataToDataUrl(entry)
      if (dataUrl) return dataUrl
    } catch {
      // Fall back to URL fields below.
    }
  }

  return normalizeResolvedUrl(
    entry.image_url || entry.url || entry.src || entry.full_url || entry.large_url || entry.preview_url || entry.thumbnail_url,
  )
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
  const imageObjectCandidates = Array.isArray(product?.images) && product.images.length > 0
    ? product.images
    : Array.isArray(product?.originalData?.images)
      ? product.originalData.images
      : []

  const resolvedObjectCandidates = imageObjectCandidates
    .filter((entry) => String(entry?.media_type || '').toLowerCase() !== 'video')
    .map((entry) => resolveImageEntryUrl(entry))
    .filter(Boolean)

  const rawCandidates = [
    product?.image_url,
    product?.thumbnail_url,
    product?.originalData?.images?.[0]?.image_url,
    product?.originalData?.image_url,
  ]

  const normalized = rawCandidates
    .map((entry) => normalizeResolvedUrl(entry))
    .filter(Boolean)

  const extended = [...resolvedObjectCandidates, ...normalized].flatMap((entry) => [entry, ...toTemplatePathFallbacks(entry)])
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

const fetchManualProductFallbackImageUrl = async (manualProductId) => {
  const key = String(manualProductId || '').trim()
  if (!key) return ''

  const cached = readManualCardImageCache(key)
  if (cached) return cached

  try {
    const response = await fetch(`${getApiOrigin()}/api/manual-products/${encodeURIComponent(key)}`)
    if (!response.ok) {
      return ''
    }

    const payload = await response.json()
    const imageEntries = Array.isArray(payload?.images) ? payload.images : []
    const resolved = imageEntries
      .map((entry) => resolveImageEntryUrl(entry))
      .find(Boolean) || ''

    if (resolved) {
      writeManualCardImageCache(key, resolved)
    }

    return resolved
  } catch {
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
  const primaryPriceLabel = isDigitalDownload ? 'Digital Price' : hasDiscount ? 'Sale price' : 'Price'
  const isPatternProduct = toCategoryList(product.category)
    .some((entry) => normalizeCategory(entry) === 'patterns' || normalizeCategory(entry) === 'pattern')
  const quantity = Number(product?.quantity ?? product?.originalData?.quantity)
  const hasInventoryCount = Number.isFinite(quantity)
  const isSoldOut = !isDigitalDownload && hasInventoryCount && quantity <= 0
  const explicitFreeShipping = [
    product?.free_shipping,
    product?.freeShipping,
    product?.originalData?.free_shipping,
    product?.originalData?.freeShipping,
  ]
    .map((entry) => parseBooleanLike(entry))
    .find((entry) => entry !== null)
  const shouldShowFreeShipping = !isDigitalDownload && (explicitFreeShipping ?? true)
  const isFeatured = product?.is_featured === 1 || product?.is_featured === true
  const manualProductId = String(product?.originalData?.id || '').trim()
  const linkedPatternId = String(product?.originalData?.related_links?.pattern_product_id || '').trim()
  const hasLinkedPattern = !isDigitalDownload
    && !isPatternProduct
    && Boolean(linkedPatternId)
    && (!manualProductId || linkedPatternId !== manualProductId)
  const dimensionsLabel = getProductDimensionsLabel(product)
  const itemNumber = getProductItemNumber(product)
  const shouldShowInstantDownload = isDigitalDownload || isPatternProduct
  const linkedTemplateId = String(product?.originalData?.related_links?.template_id || '').trim()
  const imageCandidates = useMemo(() => resolveCardImageCandidates(product), [product])
  const [candidateIndex, setCandidateIndex] = useState(0)
  const [templateFallbackUrl, setTemplateFallbackUrl] = useState('')
  const [detailFallbackUrl, setDetailFallbackUrl] = useState('')
  const [hasRequestedTemplateFallback, setHasRequestedTemplateFallback] = useState(false)
  const [hasRequestedDetailFallback, setHasRequestedDetailFallback] = useState(false)
  const [imageExhausted, setImageExhausted] = useState(false)

  useEffect(() => {
    setCandidateIndex(0)
    setTemplateFallbackUrl('')
    setDetailFallbackUrl('')
    setHasRequestedTemplateFallback(false)
    setHasRequestedDetailFallback(false)
    setImageExhausted(false)
  }, [product?.id, imageCandidates])

  useEffect(() => {
    if (templateFallbackUrl || hasRequestedTemplateFallback || imageCandidates.length > 0 || !linkedTemplateId) {
      return
    }

    setHasRequestedTemplateFallback(true)
    fetchTemplateFallbackImageUrl(linkedTemplateId).then((fallbackUrl) => {
      if (fallbackUrl) {
        const normalizedFallback = normalizeResolvedUrl(fallbackUrl)
        if (normalizedFallback && !imageCandidates.includes(normalizedFallback)) {
          setTemplateFallbackUrl(normalizedFallback)
          setImageExhausted(false)
          return
        }
      }
      setImageExhausted(false)
    })
  }, [templateFallbackUrl, hasRequestedTemplateFallback, imageCandidates, linkedTemplateId])

  useEffect(() => {
    if (detailFallbackUrl || hasRequestedDetailFallback || imageCandidates.length > 0 || !manualProductId) {
      return
    }

    setHasRequestedDetailFallback(true)
    fetchManualProductFallbackImageUrl(manualProductId).then((resolvedUrl) => {
      if (resolvedUrl) {
        setDetailFallbackUrl(resolvedUrl)
        setImageExhausted(false)
      }
    })
  }, [detailFallbackUrl, hasRequestedDetailFallback, imageCandidates.length, manualProductId])

  const activeImageUrl = imageExhausted
    ? ''
    : (templateFallbackUrl || detailFallbackUrl || imageCandidates[candidateIndex] || '')

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

    if (!hasRequestedDetailFallback && manualProductId) {
      setHasRequestedDetailFallback(true)
      fetchManualProductFallbackImageUrl(manualProductId).then((fallbackUrl) => {
        if (fallbackUrl) {
          setDetailFallbackUrl(fallbackUrl)
          setImageExhausted(false)
          return
        }
        setImageExhausted(true)
      })
      return
    }

    setImageExhausted(true)
  }

  return (
    <a href={`/product/${product.id}`} className="product-card-link">
      <article className="product-card">
        <div className="card-image">
          {hasDiscount && <span className="sale-badge">On Sale</span>}
          {isSoldOut && <span className="sold-out-badge">Sold out</span>}
          {hasLinkedPattern && <span className="pattern-corner-badge">Pattern available</span>}
          {activeImageUrl ? (
            <img
              src={activeImageUrl}
              alt={product.title || 'Glass art'}
              loading="lazy"
              decoding="async"
              fetchPriority="low"
              onError={handleCardImageError}
            />
          ) : (
            <div className="image-placeholder">No image</div>
          )}
        </div>
        <div className="card-body">
          <h3 className="card-title">{product.title || 'Untitled piece'}</h3>
          {(dimensionsLabel || itemNumber) && (
            <p className="card-dimensions">
              {dimensionsLabel}
              {itemNumber && (
                <span className="card-item-number">Item #: {itemNumber}</span>
              )}
            </p>
          )}
          <div className="card-pricing">
            <div className="price-row">
              {hasDiscount ? (
                <>
                  <span className="sale-price">{primaryPriceLabel} ${product.price_amount || '0'}</span>
                  <span className="regular-price">(Regular price ${product.old_price || '0'})</span>
                </>
              ) : (
                <span className="price">
                  {primaryPriceLabel} ${product.price_amount || '0'}
                </span>
              )}
              {hasDiscount && (
                <>
                  <span className="discount">({discountPercent}% off)</span>
                </>
              )}
            </div>
            {(isFeatured || shouldShowFreeShipping || shouldShowInstantDownload || hasLinkedPattern) && (
              <div className="card-badge-row">
                {isFeatured && (
                  <span className="card-featured-badge" aria-label="Featured product">
                    <span className="card-featured-star" aria-hidden="true">★</span>
                    Featured
                  </span>
                )}
                {shouldShowFreeShipping && (
                  <span className="free-shipping" aria-label="Free shipping">
                    <span className="free-shipping-icon" aria-hidden="true">🚚</span>
                    FREE shipping
                  </span>
                )}
                {shouldShowInstantDownload && (
                  <span className="instant-download-badge">Instant download</span>
                )}
              </div>
            )}
          </div>
        </div>
      </article>
    </a>
  )
}
