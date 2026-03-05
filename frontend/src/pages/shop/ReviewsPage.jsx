import { useEffect, useMemo, useState } from 'react'
import { fetchRecentReviews } from '../../services/api'
import '../../styles/ReviewsPage.css'

const formatReviewDate = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const renderStars = (rating) => '★'.repeat(Math.max(0, Math.min(5, Number(rating) || 0)))

export default function ReviewsPage() {
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState('suggested')
  const [ratingFilter, setRatingFilter] = useState('all')

  useEffect(() => {
    let isActive = true
    fetchRecentReviews({ limit: 50 })
      .then((response) => {
        if (!isActive) return
        setReviews(Array.isArray(response) ? response : [])
      })
      .catch(() => {
        if (!isActive) return
        setReviews([])
      })
      .finally(() => {
        if (isActive) setLoading(false)
      })

    return () => {
      isActive = false
    }
  }, [])

  const normalizedReviews = useMemo(
    () => reviews.map((review) => ({
      ...review,
      numericRating: Number(review.rating) || 0,
      createdAtMs: review.created_at ? new Date(review.created_at).getTime() : 0,
    })),
    [reviews],
  )

  const ratingCounts = useMemo(() => {
    const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    normalizedReviews.forEach((review) => {
      const bucket = Math.max(1, Math.min(5, Math.round(review.numericRating || 0)))
      counts[bucket] += 1
    })
    return counts
  }, [normalizedReviews])

  const averageRating = useMemo(() => {
    if (normalizedReviews.length === 0) return 0
    const total = normalizedReviews.reduce((sum, review) => sum + (review.numericRating || 0), 0)
    return total / normalizedReviews.length
  }, [normalizedReviews])

  const filteredReviews = useMemo(() => {
    const filtered = ratingFilter === 'all'
      ? normalizedReviews
      : normalizedReviews.filter((review) => Math.round(review.numericRating) === Number(ratingFilter))

    if (sortBy === 'rating-high') {
      return [...filtered].sort((a, b) => b.numericRating - a.numericRating || b.createdAtMs - a.createdAtMs)
    }
    if (sortBy === 'rating-low') {
      return [...filtered].sort((a, b) => a.numericRating - b.numericRating || b.createdAtMs - a.createdAtMs)
    }
    return [...filtered].sort((a, b) => b.createdAtMs - a.createdAtMs)
  }, [normalizedReviews, sortBy, ratingFilter])

  const photoStrip = useMemo(() => {
    const uniqueByUrl = new Map()
    normalizedReviews.forEach((review) => {
      const imageUrl = String(review.product_image_url || '').trim()
      if (!imageUrl || uniqueByUrl.has(imageUrl)) return
      uniqueByUrl.set(imageUrl, review)
    })
    return Array.from(uniqueByUrl.values()).slice(0, 12)
  }, [normalizedReviews])

  const toProductHref = (review) => {
    const productId = String(review.product_id || '').trim()
    if (!productId) return '#/product'
    return review.product_type === 'manual' ? `#/product/m-${productId}` : `#/product/${productId}`
  }

  return (
    <main className="reviews-page">
      <section className="reviews-page-inner">
        <h1>Reviews ({normalizedReviews.length})</h1>
       

        {loading ? (
          <p className="reviews-page-empty">Loading reviews...</p>
        ) : normalizedReviews.length === 0 ? (
          <p className="reviews-page-empty">No reviews available yet.</p>
        ) : (
          <>
            <section className="reviews-summary-card">
              <div className="reviews-summary-score">
                <p className="reviews-summary-average">{averageRating.toFixed(1)}</p>
                <p className="reviews-summary-count">{normalizedReviews.length} ratings</p>
              </div>
              <div className="reviews-summary-breakdown">
                {[5, 4, 3, 2, 1].map((star) => {
                  const count = ratingCounts[star]
                  const percentage = normalizedReviews.length > 0
                    ? Math.round((count / normalizedReviews.length) * 100)
                    : 0
                  return (
                    <div key={star} className="reviews-breakdown-row">
                      <span>{star} star</span>
                      <div className="reviews-breakdown-bar">
                        <span style={{ width: `${percentage}%` }} />
                      </div>
                      <span>{percentage}%</span>
                    </div>
                  )
                })}
              </div>
            </section>

            {photoStrip.length > 0 && (
              <section className="reviews-photo-strip" aria-label="Photos from reviews">
                {photoStrip.map((review) => (
                  <img
                    key={`${review.id}-${review.product_image_url}`}
                    src={review.product_image_url}
                    alt={review.product_title || 'Reviewed product'}
                    className="reviews-photo-item"
                  />
                ))}
              </section>
            )}

            <div className="reviews-toolbar">
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                <option value="suggested">Suggested</option>
                <option value="recent">Most recent</option>
                <option value="rating-high">Highest rating</option>
                <option value="rating-low">Lowest rating</option>
              </select>
              <select value={ratingFilter} onChange={(event) => setRatingFilter(event.target.value)}>
                <option value="all">All ratings</option>
                <option value="5">5 star</option>
                <option value="4">4 star</option>
                <option value="3">3 star</option>
                <option value="2">2 star</option>
                <option value="1">1 star</option>
              </select>
            </div>

            <div className="reviews-feed">
              {filteredReviews.map((review) => (
                <article key={review.id} className="reviews-feed-card">
                  <div className="reviews-feed-header">
                    <p className="reviews-feed-stars">{renderStars(review.numericRating)} <span>{review.numericRating}/5</span></p>
                    {review.numericRating >= 4 ? <p className="reviews-feed-recommends">✓ Recommends</p> : null}
                  </div>
                  <div className="reviews-feed-meta">
                    <strong>{(review.first_name || '').trim()} {(review.last_name || '').trim()}</strong>
                    {review.created_at ? <span>{formatReviewDate(review.created_at)}</span> : null}
                    <span>
                      Purchased item:{' '}
                      <a href={toProductHref(review)}>
                        {review.product_title || `${review.product_type} #${review.product_id}`}
                      </a>
                    </span>
                  </div>
                  <div className="reviews-feed-body-row">
                    <div>
                      <h2>{review.title || 'Customer review'}</h2>
                      <p className="reviews-page-body">{review.body || ''}</p>
                    </div>
                    {review.product_image_url ? (
                      <img
                        src={review.product_image_url}
                        alt={review.product_title || review.title || 'Reviewed product'}
                        className="reviews-feed-thumb"
                      />
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  )
}
