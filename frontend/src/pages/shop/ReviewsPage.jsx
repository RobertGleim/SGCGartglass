import { useEffect, useMemo, useState } from 'react'
import LoadingMessage from '../../components/LoadingMessage'
import { fetchRecentReviewsCached, validateReviewInviteCode, submitReviewWithCode } from '../../services/api'
import './ReviewsPage.css'

const formatReviewDate = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const renderStars = (rating) => '★'.repeat(Math.max(0, Math.min(5, Number(rating) || 0)))

const formatPurchaseSource = (value) => {
  const normalized = String(value || '').trim()
  if (!normalized) return ''
  return normalized
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

const extractReviewBodyMeta = (value) => {
  const lines = String(value || '').split(/\r?\n/)
  let purchasedAt = ''
  let purchasedVia = ''

  const filteredLines = lines.filter((line) => {
    const purchasedAtMatch = line.match(/^Purchased At:\s*(.+)$/i)
    if (purchasedAtMatch) {
      purchasedAt = purchasedAtMatch[1].trim()
      return false
    }
    const purchasedViaMatch = line.match(/^Purchased Via:\s*(.+)$/i)
    if (purchasedViaMatch) {
      purchasedVia = purchasedViaMatch[1].trim()
      return false
    }
    return true
  })

  return {
    body: filteredLines.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    purchasedAt,
    purchasedVia,
  }
}

export default function ReviewsPage() {
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState('suggested')
  const [ratingFilter, setRatingFilter] = useState('all')
  const [inviteCode, setInviteCode] = useState('')
  const [inviteInfo, setInviteInfo] = useState(null)
  const [inviteStatus, setInviteStatus] = useState('')
  const [isValidatingCode, setIsValidatingCode] = useState(false)
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false)
  const [isSubmittingInviteReview, setIsSubmittingInviteReview] = useState(false)
  const [inviteReviewForm, setInviteReviewForm] = useState({
    name: '',
    rating: 5,
    title: '',
    body: '',
    purchased_at: '',
    purchase_source: 'etsy',
    purchase_source_other: '',
    photo: null,
  })

  const loadRecentReviews = ({ forceFresh = false } = {}) => {
    setLoading(true)
    let isActive = true
    fetchRecentReviewsCached({ limit: 50 }, { forceFresh })
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
  }

  useEffect(() => {
    return loadRecentReviews()
  }, [])

  const handleValidateInviteCode = async (event) => {
    event.preventDefault()
    setInviteStatus('')
    const nextCode = String(inviteCode || '').trim().toUpperCase()
    if (!nextCode) {
      setInviteStatus('Please enter your review code.')
      return
    }

    setIsValidatingCode(true)
    try {
      const response = await validateReviewInviteCode(nextCode)
      setInviteInfo(response?.invite || null)
      setInviteCode(nextCode)
      setIsSubmitModalOpen(true)
      setInviteStatus('Code accepted. Complete your review form.')
    } catch (error) {
      setInviteInfo(null)
      setInviteStatus(error?.response?.data?.error || error?.message || 'Invalid review code.')
    } finally {
      setIsValidatingCode(false)
    }
  }

  const closeInviteModal = () => {
    setIsSubmitModalOpen(false)
    setInviteReviewForm({
      name: '',
      rating: 5,
      title: '',
      body: '',
      purchased_at: '',
      purchase_source: 'etsy',
      purchase_source_other: '',
      photo: null,
    })
  }

  const handleSubmitInviteReview = async (event) => {
    event.preventDefault()
    setInviteStatus('')

    const reviewerName = String(inviteReviewForm.name || '').trim()
    const body = String(inviteReviewForm.body || '').trim()
    const purchasedAt = String(inviteReviewForm.purchased_at || '').trim()
    const purchaseSource = String(inviteReviewForm.purchase_source || '').trim().toLowerCase()
    const purchaseSourceOther = String(inviteReviewForm.purchase_source_other || '').trim()
    if (!reviewerName || !body || !purchasedAt || !purchaseSource) {
      setInviteStatus('Name, Purchased At, Purchase Source, and comment are required.')
      return
    }
    if (purchaseSource === 'other' && !purchaseSourceOther) {
      setInviteStatus('Please enter where you bought it.')
      return
    }

    const payload = new FormData()
    payload.append('code', String(inviteCode || '').trim().toUpperCase())
    payload.append('name', reviewerName)
    payload.append('rating', String(Number(inviteReviewForm.rating) || 5))
    payload.append('title', String(inviteReviewForm.title || '').trim())
    payload.append('body', body)
    payload.append('purchased_at', purchasedAt)
    payload.append('purchase_source', purchaseSource)
    payload.append('purchase_source_other', purchaseSourceOther)
    if (inviteReviewForm.photo) {
      payload.append('photo', inviteReviewForm.photo)
    }

    setIsSubmittingInviteReview(true)
    try {
      await submitReviewWithCode(payload)
      closeInviteModal()
      setInviteStatus('Review submitted. It is now pending admin approval.')
      loadRecentReviews({ forceFresh: true })
    } catch (error) {
      setInviteStatus(error?.response?.data?.error || error?.message || 'Unable to submit review.')
    } finally {
      setIsSubmittingInviteReview(false)
    }
  }

  const normalizedReviews = useMemo(
    () => reviews.map((review) => ({
      ...review,
      ...extractReviewBodyMeta(review.body),
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

  const toProductHref = (review) => {
    const productId = String(review.product_id || '').trim()
    if (!productId) return '#/product'
    return review.product_type === 'manual' ? `#/product/m-${productId}` : `#/product/${productId}`
  }

  return (
    <main className="reviews-page">
      <section className="reviews-page-inner">
        <div className="reviews-heading-row">
          <h1>Reviews ({normalizedReviews.length})</h1>
          <form className="reviews-code-entry" onSubmit={handleValidateInviteCode}>
            <label htmlFor="review-invite-code">Have a review code? Enter it here</label>
            <div className="reviews-code-entry-row">
              <input
                id="review-invite-code"
                type="text"
                value={inviteCode}
                onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
                placeholder="Enter code"
              />
              <button type="submit" disabled={isValidatingCode}>
                {isValidatingCode ? 'Checking...' : 'Enter'}
              </button>
            </div>
          </form>
        </div>
        {inviteStatus ? <p className="reviews-invite-status">{inviteStatus}</p> : null}
       

        {loading ? (
          <LoadingMessage label="Loading reviews" className="reviews-page-empty" />
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
                    {review.purchasedVia ? <span>Purchased at {formatPurchaseSource(review.purchasedVia)}</span> : null}
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
                        onError={(event) => {
                          const fallback = String(review.fallback_product_image_url || '').trim()
                          const current = String(event.currentTarget.src || '').trim()
                          if (fallback && current !== fallback) {
                            event.currentTarget.src = fallback
                            return
                          }
                          event.currentTarget.style.display = 'none'
                        }}
                      />
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>

      {isSubmitModalOpen ? (
        <div className="reviews-modal-overlay" role="dialog" aria-modal="true" aria-label="Submit review">
          <div className="reviews-modal-card">
            <div className="reviews-modal-header">
              <h2>Submit Your Review</h2>
              <button type="button" className="reviews-modal-close" onClick={closeInviteModal}>×</button>
            </div>

            <form className="reviews-modal-form" onSubmit={handleSubmitInviteReview}>
              <label>
                Name
                <input
                  type="text"
                  value={inviteReviewForm.name}
                  onChange={(event) => setInviteReviewForm((prev) => ({ ...prev, name: event.target.value }))}
                  required
                />
              </label>

              <label>
                Rating
                <select
                  value={inviteReviewForm.rating}
                  onChange={(event) => setInviteReviewForm((prev) => ({ ...prev, rating: Number(event.target.value) }))}
                >
                  <option value={5}>5 - Excellent</option>
                  <option value={4}>4 - Good</option>
                  <option value={3}>3 - Average</option>
                  <option value={2}>2 - Fair</option>
                  <option value={1}>1 - Poor</option>
                </select>
              </label>

              <label>
                Title
                <input
                  type="text"
                  value={inviteReviewForm.title}
                  onChange={(event) => setInviteReviewForm((prev) => ({ ...prev, title: event.target.value }))}
                  placeholder="Short review title"
                />
              </label>

              <label>
                Purchased At
                <input
                  type="date"
                  value={inviteReviewForm.purchased_at}
                  onChange={(event) => setInviteReviewForm((prev) => ({ ...prev, purchased_at: event.target.value }))}
                  required
                />
              </label>

              <label>
                Purchase Source
                <select
                  value={inviteReviewForm.purchase_source}
                  onChange={(event) => setInviteReviewForm((prev) => ({ ...prev, purchase_source: event.target.value }))}
                >
                  <option value="etsy">Etsy</option>
                  <option value="ebay">eBay</option>
                  <option value="facebook">Facebook</option>
                  <option value="other">Other</option>
                </select>
              </label>

              {inviteReviewForm.purchase_source === 'other' ? (
                <label>
                  Where did you buy it?
                  <input
                    type="text"
                    value={inviteReviewForm.purchase_source_other}
                    onChange={(event) => setInviteReviewForm((prev) => ({ ...prev, purchase_source_other: event.target.value }))}
                    placeholder="Enter purchase source"
                    required
                  />
                </label>
              ) : null}

              <label>
                Comment
                <textarea
                  value={inviteReviewForm.body}
                  onChange={(event) => setInviteReviewForm((prev) => ({ ...prev, body: event.target.value }))}
                  rows={4}
                  required
                />
              </label>

              <label>
                Upload Photo (optional)
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => setInviteReviewForm((prev) => ({ ...prev, photo: event.target.files?.[0] || null }))}
                />
              </label>

              <div className="reviews-modal-actions">
                <button type="button" className="reviews-modal-secondary" onClick={closeInviteModal}>Cancel</button>
                <button type="submit" disabled={isSubmittingInviteReview}>
                  {isSubmittingInviteReview ? 'Submitting...' : 'Submit Review'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  )
}
