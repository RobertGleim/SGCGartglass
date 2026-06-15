import { useEffect, useMemo, useRef, useState } from 'react'
import useCarousel from '../../../../hooks/useCarousel'
import LoadingMessage from '../../../../components/LoadingMessage'
import { getProductDimensionsLabel } from '../../../../utils/productDimensions'
import { getProductItemNumber } from '../../../../utils/itemNumber'
import { navigateTo } from '../../../../utils/navigation'
import './FeaturedCarousel.css'

const manualCarouselImageCache = new Map()
const carouselPrefetchCache = new Set()

const getApiOrigin = () => {
  const configuredBase = String(import.meta.env.VITE_API_BASE_URL || '/api').trim()
  if (/^https?:\/\//i.test(configuredBase)) {
    return configuredBase.replace(/\/api\/?$/, '')
  }
  return window.location.origin
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
      // Keep original value when parse fails.
    }
  }

  if (unquoted.startsWith('data:')) {
    return unquoted.replace(/\s+/g, '')
  }

  return unquoted
}

const normalizeResolvedUrl = (value) => {
  const url = toCleanUrl(value)
  if (!url) return ''
  if (url.startsWith('data:') || url.startsWith('blob:')) return url
  if (url.startsWith('/uploads/')) return `${getApiOrigin()}${url}`
  if (url.startsWith('uploads/')) return `${getApiOrigin()}/${url}`

  if (url.startsWith('http://') || url.startsWith('https://')) {
    if (typeof window !== 'undefined' && window.location?.protocol === 'https:' && url.startsWith('http://')) {
      try {
        const parsed = new URL(url)
        if (parsed.hostname === window.location.hostname) {
          return `https://${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}`
        }
      } catch {
        // Fall through to the original absolute URL.
      }
    }
    return url
  }

  if (url.startsWith('/')) return url
  return `/${url.replace(/^\.?\//, '')}`
}

const hexStringToBytes = (value) => {
  const hex = String(value || '').trim()
  if (!hex || hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) return null
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
  const hexBytes = hexStringToBytes(rawImageData)
  if (hexBytes && hexBytes.length > 0) {
    const base64 = bytesToBase64(hexBytes)
    return base64 ? `data:${mimeType};base64,${base64}` : ''
  }

  const base64 = normalizeBase64String(rawImageData)
  return base64 ? `data:${mimeType};base64,${base64}` : ''
}

const resolveImageEntryUrl = (entry) => {
  if (!entry || typeof entry !== 'object') return normalizeResolvedUrl(entry)
  const fromData = imageDataToDataUrl(entry)
  if (fromData) return fromData
  return normalizeResolvedUrl(entry.image_url || entry.url || entry.src || entry.thumbnail_url)
}

const resolveCarouselImageUrl = (item) => {
  const imageEntries = [
    ...(Array.isArray(item?.images) ? item.images : []),
    ...(Array.isArray(item?.originalData?.images) ? item.originalData.images : []),
  ]

  const entryResolved = imageEntries
    .filter((entry) => String(entry?.media_type || '').toLowerCase() !== 'video')
    .map((entry) => resolveImageEntryUrl(entry))
    .find(Boolean)

  if (entryResolved) return entryResolved

  const candidates = [
    ...imageEntries.map((entry) => entry?.image_url || entry?.url || entry?.src || entry?.thumbnail_url),
    item?.image_url,
    item?.thumbnail_url,
    item?.originalData?.images?.[0]?.image_url,
    item?.originalData?.image_url,
    item?.originalData?.thumbnail_url,
  ]

  for (const candidate of candidates) {
    const url = normalizeResolvedUrl(candidate)
    if (!url) continue
    return url
  }

  return ''
}

const extractManualProductId = (item) => {
  const fromOriginal = String(item?.originalData?.id || '').trim()
  if (fromOriginal) return fromOriginal

  const rawId = String(item?.id || '').trim()
  if (rawId.startsWith('m-')) {
    return rawId.slice(2)
  }
  return ''
}

const fetchManualProductFallbackImageUrl = async (manualProductId) => {
  const key = String(manualProductId || '').trim()
  if (!key) return ''

  if (manualCarouselImageCache.has(key)) {
    return manualCarouselImageCache.get(key) || ''
  }

  try {
    const response = await fetch(`${getApiOrigin()}/api/manual-products/${encodeURIComponent(key)}`)
    if (!response.ok) {
      manualCarouselImageCache.set(key, '')
      return ''
    }

    const payload = await response.json()
    const imageEntries = Array.isArray(payload?.images) ? payload.images : []
    const resolved = imageEntries
      .filter((entry) => String(entry?.media_type || '').toLowerCase() !== 'video')
      .map((entry) => resolveImageEntryUrl(entry))
      .find(Boolean) || ''

    manualCarouselImageCache.set(key, resolved)
    return resolved
  } catch {
    manualCarouselImageCache.set(key, '')
    return ''
  }
}

const preloadImage = (url) => {
  const resolved = normalizeResolvedUrl(url)
  if (!resolved || carouselPrefetchCache.has(resolved)) return
  carouselPrefetchCache.add(resolved)
  const image = new Image()
  image.decoding = 'async'
  image.loading = 'eager'
  image.src = resolved
}

export default function FeaturedCarousel({ items, itemsLoading }) {
  const [manualImageFallbacks, setManualImageFallbacks] = useState({})
  const [manualImageFetchState, setManualImageFetchState] = useState({})
  const [isHoverPaused, setIsHoverPaused] = useState(false)
  const [isInteractionPaused, setIsInteractionPaused] = useState(false)
  const [suppressHoverPause, setSuppressHoverPause] = useState(false)
  const interactionResumeTimerRef = useRef(null)

  const itemsNeedingFallback = useMemo(() => {
    return items.filter((item) => {
      const manualId = extractManualProductId(item)
      if (!manualId) return false
      const idKey = String(item?.id || '')
      if (manualImageFetchState[idKey] === 'done' || manualImageFetchState[idKey] === 'loading') return false
      if (manualImageFallbacks[idKey]) return false
      return !resolveCarouselImageUrl(item)
    })
  }, [items, manualImageFallbacks, manualImageFetchState])

  useEffect(() => {
    if (!itemsNeedingFallback.length) return
    let isActive = true
    const loadingIds = itemsNeedingFallback
      .map((item) => String(item?.id || ''))
      .filter(Boolean)

    if (loadingIds.length > 0) {
      setManualImageFetchState((prev) => {
        const next = { ...prev }
        loadingIds.forEach((id) => {
          next[id] = 'loading'
        })
        return next
      })
    }

    Promise.all(
      itemsNeedingFallback.map(async (item) => {
        const manualId = extractManualProductId(item)
        const fallbackUrl = await fetchManualProductFallbackImageUrl(manualId)
        return [String(item?.id || ''), fallbackUrl]
      })
    ).then((entries) => {
      if (!isActive) return
      setManualImageFallbacks((prev) => {
        const next = { ...prev }
        entries.forEach(([itemId, fallbackUrl]) => {
          if (itemId && fallbackUrl && !next[itemId]) {
            next[itemId] = fallbackUrl
          }
        })
        return next
      })
      setManualImageFetchState((prev) => {
        const next = { ...prev }
        entries.forEach(([itemId]) => {
          if (itemId) next[itemId] = 'done'
        })
        return next
      })
    })

    return () => {
      isActive = false
    }
  }, [itemsNeedingFallback])

  const {
    currentSlide,
    setIsPaused,
    totalSlides,
    visibleSlides,
    nextSlide,
    prevSlide,
    goToSlide,
  } = useCarousel(items, { autoplayMs: 4600, maxOffset: 2 })

  useEffect(() => {
    setIsPaused((isHoverPaused && !suppressHoverPause) || isInteractionPaused)
  }, [isHoverPaused, isInteractionPaused, suppressHoverPause, setIsPaused])

  useEffect(() => {
    return () => {
      if (interactionResumeTimerRef.current) {
        window.clearTimeout(interactionResumeTimerRef.current)
      }
    }
  }, [])

  const restartCarouselAfterInteraction = () => {
    setIsInteractionPaused(true)
    setSuppressHoverPause(true)
    if (interactionResumeTimerRef.current) {
      window.clearTimeout(interactionResumeTimerRef.current)
    }
    interactionResumeTimerRef.current = window.setTimeout(() => {
      setIsInteractionPaused(false)
      interactionResumeTimerRef.current = null
    }, 15000)
  }

  const visibleCarouselUrls = useMemo(() => {
    if (!items.length) return []
    const indices = [currentSlide - 2, currentSlide - 1, currentSlide, currentSlide + 1, currentSlide + 2]
    return indices
      .map((index) => items[(index + items.length) % items.length])
      .map((item) => manualImageFallbacks[String(item?.id || '')] || resolveCarouselImageUrl(item))
      .filter(Boolean)
  }, [currentSlide, items, manualImageFallbacks])

  useEffect(() => {
    visibleCarouselUrls.forEach((url) => preloadImage(url))
  }, [visibleCarouselUrls])

  if (itemsLoading) {
    return <LoadingMessage label="Loading featured items" className="empty-state" />
  }

  if (items.length === 0) {
    return (
      <div className="empty-state">
        {/* No Etsy items linked yet. Add listings from the admin page. */}
      </div>
    )
  }

  return (
    <div
      className="carousel-container featured-carousel"
      onMouseEnter={() => setIsHoverPaused(true)}
      onMouseLeave={() => {
        setIsHoverPaused(false)
        setSuppressHoverPause(false)
      }}
    >
      <div className="carousel-wrapper">
        <div className="carousel-track">
          {visibleSlides.map(({ offset, item, index }) => {
            const absOffset = Math.abs(offset)
            const isCenter = absOffset === 0
            const itemId = String(item?.id || '')
            const resolvedImageUrl = manualImageFallbacks[itemId] || resolveCarouselImageUrl(item)
            const isImageLoading = !resolvedImageUrl && manualImageFetchState[itemId] === 'loading'
            const showLoadingText = isCenter && isImageLoading
            const dimensionsLabel = getProductDimensionsLabel(item)
            const itemNumber = getProductItemNumber(item)

            let scale = 1
            let opacity = 1
            let translateX = offset * 420

            if (absOffset === 1) {
              scale = 0.84
              opacity = 0.74
              translateX = offset * 340
            } else if (absOffset === 2) {
              scale = 0.7
              opacity = 0.5
              translateX = offset * 290
            }

            return (
              <div
                key={String(item?.id ?? index)}
                className={`carousel-slide ${
                  isCenter ? 'center' : absOffset === 1 ? 'adjacent' : 'far'
                }`}
                style={{
                  transform: `translate3d(calc(-50% + ${translateX}px), -50%, 0) scale(${scale})`,
                  opacity,
                  zIndex: isCenter ? 10 : 10 - absOffset,
                  pointerEvents: isCenter ? 'auto' : 'none',
                  cursor: isCenter ? 'pointer' : 'default',
                }}
                onClick={() => {
                  restartCarouselAfterInteraction()
                  if (isCenter) {
                    navigateTo(`/product/${item.id}`)
                  }
                }}
              >
                <article className="product-card">
                  <div className="card-image">
                    {resolvedImageUrl ? (
                      <img
                        src={resolvedImageUrl}
                        alt={item.title || 'Glass art'}
                        loading={isCenter ? 'eager' : 'lazy'}
                        decoding="async"
                        fetchPriority={isCenter ? 'high' : 'low'}
                      />
                    ) : (
                      <div className={`image-placeholder ${isImageLoading ? 'image-placeholder-loading' : ''} ${showLoadingText ? '' : 'image-placeholder-quiet'}`}>
                        {showLoadingText ? 'Loading image...' : ''}
                      </div>
                    )}
                  </div>
                  <div className="card-body">
                    <h3 className="card-title">{item.title || 'Untitled piece'}</h3>
                    {(dimensionsLabel || itemNumber) && (
                      <p className="card-dimensions">
                        {dimensionsLabel}
                        {itemNumber && (
                          <span className="card-item-number">Item #: {itemNumber}</span>
                        )}
                      </p>
                    )}
                    <p className="card-description">
                      {item.description}
                    </p>
                    <div className="card-meta">
                      <span className="price">
                        {item.price_amount ? `$${item.price_amount}` : '--'}
                      </span>
                      <a className="text-link" href={`/product/${item.id}`}>
                        View
                      </a>
                    </div>
                  </div>
                </article>
              </div>
            )
          })}
        </div>
      </div>

      {totalSlides > 1 && (
        <>
          <button className="carousel-btn prev" onClick={() => {
            restartCarouselAfterInteraction()
            prevSlide()
          }} aria-label="Previous">
            ‹
          </button>
          <button className="carousel-btn next" onClick={() => {
            restartCarouselAfterInteraction()
            nextSlide()
          }} aria-label="Next">
            ›
          </button>
        </>
      )}

      {items.length > 0 && (
        <div className="carousel-thumbnails">
          {items.map((item, index) => (
            (() => {
              const itemId = String(item?.id || '')
              const resolvedThumbUrl = manualImageFallbacks[itemId] || resolveCarouselImageUrl(item)
              const isThumbLoading = !resolvedThumbUrl && manualImageFetchState[itemId] === 'loading'
              return (
            <button
              key={index}
              className={`thumbnail ${index === currentSlide ? 'active' : ''}`}
              onClick={() => {
                restartCarouselAfterInteraction()
                goToSlide(index)
              }}
              aria-label={`View ${item.title || 'item'}`}
            >
              {resolvedThumbUrl ? (
                <img
                  src={resolvedThumbUrl}
                  alt={item.title || 'Glass art'}
                  loading="lazy"
                  decoding="async"
                  fetchPriority="low"
                />
              ) : (
                <div className={`image-placeholder ${isThumbLoading ? 'image-placeholder-loading' : ''} image-placeholder-quiet`}>
                  {isThumbLoading && index === currentSlide ? '...' : ''}
                </div>
              )}
            </button>
              )
            })()
          ))}
        </div>
      )}
    </div>
  )
}
