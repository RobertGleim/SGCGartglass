import { useEffect, useState } from 'react'
import FeaturedCarousel from './components/featured/FeaturedCarousel'
import HeroSection from './components/hero/HeroSection'
import { fetchRecentReviewsCached } from '../../services/api'
import './HomePage.css'

const renderStars = (rating) => '★'.repeat(Math.max(0, Math.min(5, Math.round(Number(rating) || 0))))

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
                {activeReview.product_image_url ? (
                  <div className="home-review-image-shell">
                    <img
                      src={activeReview.product_image_url}
                      alt={activeReview.product_title || activeReview.title || 'Reviewed product'}
                      className="home-review-image"
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
