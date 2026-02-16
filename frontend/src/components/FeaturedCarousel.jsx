import useCarousel from '../hooks/useCarousel'
import '../styles/FeaturedCarousel.css'

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
    return <div className="empty-state">Loading featured items...</div>
  }

  if (items.length === 0) {
    return (
      <div className="empty-state">
        No Etsy items linked yet. Add listings from the admin page.
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
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.title || 'Glass art'} />
                    ) : (
                      <div className="image-placeholder">No image</div>
                    )}
                  </div>
                  <div className="card-body">
                    <h3>{item.title || 'Untitled piece'}</h3>
                    <p className="card-description">
                      {item.description || 'Details will appear after Etsy sync.'}
                    </p>
                    <div className="card-meta">
                      <span className="price">
                        {item.price_amount || '--'}
                        {item.price_currency ? ` ${item.price_currency}` : ''}
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
            <button
              key={index}
              className={`thumbnail ${index === currentSlide ? 'active' : ''}`}
              onClick={() => goToSlide(index)}
              aria-label={`View ${item.title || 'item'}`}
            >
              {item.image_url ? (
                <img src={item.image_url} alt={item.title || 'Glass art'} />
              ) : (
                <div className="image-placeholder">No image</div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
