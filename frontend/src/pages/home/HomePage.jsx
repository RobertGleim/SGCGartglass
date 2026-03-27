import { useEffect, useState } from 'react'
import FeaturedCarousel from './components/featured/FeaturedCarousel'
import HeroSection from './components/hero/HeroSection'
import { fetchRecentReviewsCached } from '../../services/api'
import './HomePage.css'

const renderStars = (rating) => '★'.repeat(Math.max(0, Math.min(5, Math.round(Number(rating) || 0))))

const toCleanImageUrl = (value) => {
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
        return toCleanImageUrl(parsed[0]?.image_url || parsed[0]?.url || parsed[0]?.src || parsed[0])
      }
      if (parsed && typeof parsed === 'object') {
        return toCleanImageUrl(parsed.image_url || parsed.url || parsed.src)
      }
    } catch {
      // Keep original value when this isn't valid JSON.
    }
  }

  if (unquoted.startsWith('data:')) {
    return unquoted.replace(/\s+/g, '')
  }

  return unquoted
}

const resolveReviewImageUrl = (review) => {
  const candidates = [review?.product_image_url, review?.fallback_product_image_url]

  for (const candidate of candidates) {
    const url = toCleanImageUrl(candidate)
    if (!url) continue
    if (url.startsWith('data:') || url.startsWith('blob:')) return url
    if (url.startsWith('http://') || url.startsWith('https://')) return url
    if (url.startsWith('/')) return url
    return `/${url.replace(/^\.?\//, '')}`
  }

  return ''
}

export default function HomePage({ featuredItems, itemsLoading }) {
  const [recentReviews, setRecentReviews] = useState([])
  const [activeReviewIndex, setActiveReviewIndex] = useState(0)
  const [reviewAnimationKey, setReviewAnimationKey] = useState(0)

  useEffect(() => {
    let isActive = true
    fetchRecentReviewsCached({ limit: 3 })
      .then((response) => {
        if (!isActive) return
        setRecentReviews(Array.isArray(response) ? response : [])
      })
      .catch(() => {
        if (!isActive) return
        setRecentReviews([])
      })

    return () => {
      isActive = false
    }
  }, [])

  useEffect(() => {
    if (recentReviews.length <= 1) {
      setActiveReviewIndex(0)
      return
    }

    const intervalId = window.setInterval(() => {
      setActiveReviewIndex((prev) => (prev + 1) % recentReviews.length)
      setReviewAnimationKey((prev) => prev + 1)
    }, 5200)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [recentReviews.length])

  const activeReview = recentReviews[activeReviewIndex] || null
  const activeReviewImageUrl = resolveReviewImageUrl(activeReview)

  return (
    <main>
      <HeroSection />

      <section className="featured" style={{ margin: '0 auto' }}>
        <div className="section-header" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80px' }}>
          <h2 style={{ margin: 0, textAlign: 'center' }}>Featured items</h2>
        </div>
        <FeaturedCarousel items={featuredItems} itemsLoading={itemsLoading} />
      </section>

      <section className="featured" style={{ margin: '1.5rem auto 0' }}>
        <div className="section-header" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '64px' }}>
          <h2 style={{ margin: 0, textAlign: 'center' }}>Recent reviews</h2>
        </div>
        {recentReviews.length === 0 ? (
          <div className="empty-state" style={{ minHeight: '96px' }}>
            <p style={{ margin: 0 }}>No reviews posted yet.</p>
          </div>
        ) : (
          <div className="home-review-stage">
            {activeReview ? (
              <article
                key={`${activeReview.id}-${reviewAnimationKey}`}
                className="home-review-card home-review-card-animated"
              >
                {activeReviewImageUrl ? (
                  <div className="home-review-image-shell">
                    <img
                      src={activeReviewImageUrl}
                      alt={activeReview.product_title || activeReview.title || 'Reviewed product'}
                      className="home-review-image"
                      onError={(event) => {
                        const fallback = toCleanImageUrl(activeReview?.fallback_product_image_url)
                        const current = String(event.currentTarget.src || '').trim()
                        if (fallback && current !== fallback) {
                          event.currentTarget.src = fallback
                          return
                        }
                        event.currentTarget.style.display = 'none'
                      }}
                    />
                  </div>
                ) : null}
                <div className="home-review-content">
                  <p className="home-review-rating">{renderStars(activeReview.rating)}</p>
                  <p className="home-review-title">{activeReview.title || 'Customer review'}</p>
                  <p className="home-review-body">{activeReview.body || ''}</p>
                  <p className="home-review-meta">
                    {(activeReview.first_name || '').trim()} {(activeReview.last_name || '').trim()}
                  </p>
                </div>
              </article>
            ) : null}
          </div>
        )}
      </section>
    </main>
  )
}
