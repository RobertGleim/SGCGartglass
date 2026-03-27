import useCarousel from '../../../../hooks/useCarousel'
import LoadingMessage from '../../../../components/LoadingMessage'
import './FeaturedCarousel.css'

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
  return raw.replace(/^['"]|['"]$/g, '')
}

const resolveCarouselImageUrl = (item) => {
  const candidates = [
    item?.image_url,
    item?.thumbnail_url,
    item?.originalData?.images?.[0]?.image_url,
    item?.originalData?.image_url,
  ]

  for (const candidate of candidates) {
    const url = toCleanUrl(candidate)
    if (!url) continue
    if (url.startsWith('data:') || url.startsWith('blob:')) return url
    if (url.startsWith('/uploads/')) return `${getApiOrigin()}${url}`
    if (url.startsWith('uploads/')) return `${getApiOrigin()}/${url}`
    if (url.startsWith('http://') || url.startsWith('https://')) return url
    if (url.startsWith('/')) return url
    return `/${url.replace(/^\.?\//, '')}`
  }

  return ''
}

export default function FeaturedCarousel({ items, itemsLoading }) {
  const {
    currentSlide,
    setIsPaused,
    totalSlides,
    visibleSlides,
    nextSlide,
    prevSlide,
    goToSlide,
  } = useCarousel(items)

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
      className="carousel-container"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="carousel-wrapper">
        <div className="carousel-track">
          {visibleSlides.map(({ offset, item, index }) => {
            const absOffset = Math.abs(offset)
            const isCenter = absOffset === 0
            const resolvedImageUrl = resolveCarouselImageUrl(item)

            let scale = 1
            let opacity = 1
            let translateX = offset * 420

            if (absOffset === 1) {
              scale = 0.8
              opacity = 0.65
              translateX = offset * 320
            } else if (absOffset === 2) {
              scale = 0.62
              opacity = 0.35
              translateX = offset * 260
            }

            return (
              <div
                key={`${index}-${offset}`}
                className={`carousel-slide ${
                  isCenter ? 'center' : absOffset === 1 ? 'adjacent' : 'far'
                }`}
                style={{
                  transform: `translate(calc(-50% + ${translateX}px), -50%) scale(${scale})`,
                  opacity,
                  zIndex: isCenter ? 10 : 10 - absOffset,
                  pointerEvents: isCenter ? 'auto' : 'none',
                  cursor: isCenter ? 'pointer' : 'default',
                }}
                onClick={() => {
                  if (isCenter) {
                    window.location.hash = `#/product/${item.id}`
                  }
                }}
              >
                <article className="product-card">
                  <div className="card-image">
                    {resolvedImageUrl ? (
                      <img src={resolvedImageUrl} alt={item.title || 'Glass art'} />
                    ) : (
                      <div className="image-placeholder">No image</div>
                    )}
                  </div>
                  <div className="card-body">
                    <h3>{item.title || 'Untitled piece'}</h3>
                    <p className="card-description">
                      {item.description}
                    </p>
                    <div className="card-meta">
                      <span className="price">
                        {item.price_amount ? `$${item.price_amount}` : '--'}
                      </span>
                      <a className="text-link" href={`#/product/${item.id}`}>
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
          <button className="carousel-btn prev" onClick={prevSlide} aria-label="Previous">
            ‹
          </button>
          <button className="carousel-btn next" onClick={nextSlide} aria-label="Next">
            ›
          </button>
        </>
      )}

      {items.length > 0 && (
        <div className="carousel-thumbnails">
          {items.map((item, index) => (
            (() => {
              const resolvedThumbUrl = resolveCarouselImageUrl(item)
              return (
            <button
              key={index}
              className={`thumbnail ${index === currentSlide ? 'active' : ''}`}
              onClick={() => goToSlide(index)}
              aria-label={`View ${item.title || 'item'}`}
            >
              {resolvedThumbUrl ? (
                <img src={resolvedThumbUrl} alt={item.title || 'Glass art'} />
              ) : (
                <div className="image-placeholder">No image</div>
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
