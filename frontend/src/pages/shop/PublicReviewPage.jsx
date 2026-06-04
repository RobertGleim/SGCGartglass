import { useEffect, useState } from 'react'
import LoadingMessage from '../../components/LoadingMessage'
import { submitPublicReview } from '../../services/api'
import { getCurrentSearch } from '../../utils/navigation'
import './PublicReviewPage.css'

const PRODUCT_TYPES = {
  stainedglass: 'Stained Glass',
  woodwork: 'Woodwork',
  other: 'Other Product'
}

const PURCHASE_SOURCES = {
  etsy: 'Etsy',
  ebay: 'eBay',
  amazon: 'Amazon',
  facebook: 'Facebook',
  other: 'Other'
}

const getQueryParam = (param) => {
  const params = new URLSearchParams(getCurrentSearch().slice(1))
  return params.get(param) || ''
}

export default function PublicReviewPage() {
  const presetProductType = getQueryParam('product') || 'stainedglass'
  
  const [form, setForm] = useState({
    name: '',
    rating: 5,
    title: '',
    body: '',
    purchased_at: '',
    purchase_source: 'etsy',
    purchase_source_other: '',
    photo: null,
    product_type: presetProductType,
  })
  
  const [photoPreview, setPhotoPreview] = useState(null)
  const [status, setStatus] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }))
    setStatus('')
  }

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      setForm(prev => ({ ...prev, photo: file }))
      const reader = new FileReader()
      reader.onload = (event) => {
        setPhotoPreview(event.target.result)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleRemovePhoto = () => {
    setForm(prev => ({ ...prev, photo: null }))
    setPhotoPreview(null)
  }

  const validate = () => {
    if (!form.name.trim()) return 'Name is required'
    if (!form.body.trim()) return 'Comment is required'
    if (!form.purchased_at.trim()) return 'Purchase date is required'
    if (form.purchase_source === 'other' && !form.purchase_source_other.trim()) {
      return 'Please specify where you purchased this'
    }
    if (form.body.trim().length < 10) return 'Comment must be at least 10 characters'
    return ''
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setStatus('')
    
    const error = validate()
    if (error) {
      setStatus(error)
      return
    }

    const payload = new FormData()
    payload.append('name', form.name.trim())
    payload.append('rating', String(form.rating))
    payload.append('title', form.title.trim())
    payload.append('body', form.body.trim())
    payload.append('purchased_at', form.purchased_at.trim())
    payload.append('purchase_source', form.purchase_source)
    payload.append('purchase_source_other', form.purchase_source_other.trim())
    payload.append('product_type', form.product_type)
    if (form.photo) {
      payload.append('photo', form.photo)
    }

    setIsSubmitting(true)
    try {
      await submitPublicReview(payload)
      setShowSuccess(true)
      setForm({
        name: '',
        rating: 5,
        title: '',
        body: '',
        purchased_at: '',
        purchase_source: 'etsy',
        purchase_source_other: '',
        photo: null,
        product_type: presetProductType,
      })
      setPhotoPreview(null)
      setTimeout(() => {
        setShowSuccess(false)
        setStatus('')
      }, 5000)
    } catch (error) {
      setStatus(error?.response?.data?.error || error?.message || 'Unable to submit review')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="public-review-page">
      <div className="public-review-container">
        <div className="public-review-header">
          <h1>Share Your Review</h1>
          <p className="public-review-subtitle">We'd love to hear about your experience with our {PRODUCT_TYPES[form.product_type] || form.product_type}</p>
        </div>

        {showSuccess && (
          <div className="public-review-success">
            <h3>✓ Thank you for your review!</h3>
            <p>Your review has been submitted and is now pending admin approval. We appreciate your feedback!</p>
          </div>
        )}

        {status && !showSuccess && (
          <div className="public-review-error">
            {status}
          </div>
        )}

        <form className="public-review-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="reviewer-name">Your Name *</label>
            <input
              id="reviewer-name"
              type="text"
              value={form.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="First and last name"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="rating">Rating *</label>
            <select
              id="rating"
              value={form.rating}
              onChange={(e) => handleChange('rating', Number(e.target.value))}
            >
              <option value={5}>5 - Excellent</option>
              <option value={4}>4 - Good</option>
              <option value={3}>3 - Average</option>
              <option value={2}>2 - Fair</option>
              <option value={1}>1 - Poor</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="review-title">Review Title</label>
            <input
              id="review-title"
              type="text"
              value={form.title}
              onChange={(e) => handleChange('title', e.target.value)}
              placeholder="Brief summary of your review"
              maxLength={100}
            />
          </div>

          <div className="form-group">
            <label htmlFor="review-body">Your Review *</label>
            <textarea
              id="review-body"
              value={form.body}
              onChange={(e) => handleChange('body', e.target.value)}
              placeholder="Tell us about your experience..."
              rows={5}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="purchased-at">Purchase Date *</label>
            <input
              id="purchased-at"
              type="date"
              value={form.purchased_at}
              onChange={(e) => handleChange('purchased_at', e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="purchase-source">Where did you purchase? *</label>
            <select
              id="purchase-source"
              value={form.purchase_source}
              onChange={(e) => handleChange('purchase_source', e.target.value)}
              required
            >
              {Object.entries(PURCHASE_SOURCES).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          {form.purchase_source === 'other' && (
            <div className="form-group">
              <label htmlFor="purchase-source-other">Please specify where you purchased *</label>
              <input
                id="purchase-source-other"
                type="text"
                value={form.purchase_source_other}
                onChange={(e) => handleChange('purchase_source_other', e.target.value)}
                placeholder="e.g., Local shop, gift, etc."
                required={form.purchase_source === 'other'}
              />
            </div>
          )}

          <div className="form-group">
            <label htmlFor="review-photo">Add a Photo (optional)</label>
            {photoPreview ? (
              <div className="photo-preview">
                <img src={photoPreview} alt="Preview" />
                <button
                  type="button"
                  className="remove-photo-btn"
                  onClick={handleRemovePhoto}
                >
                  Remove Photo
                </button>
              </div>
            ) : (
              <input
                id="review-photo"
                type="file"
                accept="image/*"
                onChange={handlePhotoChange}
              />
            )}
          </div>

          <button
            type="submit"
            className="submit-review-btn"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Submitting...' : 'Submit Review'}
          </button>
        </form>

        <div className="public-review-footer">
          <p className="disclaimer">
            Reviews are moderated before appearing on our site. We appreciate your honest feedback!
          </p>
        </div>
      </div>
    </main>
  )
}
