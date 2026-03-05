import { useState, useEffect, useMemo } from 'react'
import '../../styles/ProductDetail.css'
import ProductCard from '../../components/product/ProductCard'
import useCustomerAuth from '../../hooks/useCustomerAuth'
import {
  addCustomerCartItem,
  addCustomerFavorite,
  fetchCustomerFavorites,
  fetchManualProduct,
  fetchProductReviews,
  removeCustomerFavorite,
} from '../../services/api'
import { findWishlistEntry, resolveWishlistTarget } from '../../utils/wishlist'

const formatReviewDate = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const renderStars = (rating) => '★'.repeat(Math.max(0, Math.min(5, Number(rating) || 0)))

const toCleanUrl = (value) => {
  const url = String(value || '').trim()
  if (!url) return ''
  if (/^javascript:/i.test(url)) return ''
  return url
}

const resolveImageUrl = (entry) => {
  if (!entry) return ''
  if (typeof entry === 'string') return toCleanUrl(entry)

  const candidates = [
    entry.image_url,
    entry.url,
    entry.src,
    entry.full_url,
    entry.large_url,
    entry.preview_url,
    entry.thumbnail_url,
    entry.url_fullxfull,
    entry.url_570xN,
    entry.url_170x135,
  ]

  for (const candidate of candidates) {
    const resolved = toCleanUrl(candidate)
    if (resolved) return resolved
  }

  return ''
}

const resolveVideoUrl = (entry) => {
  if (!entry || typeof entry === 'string') return ''
  const candidates = [entry.video_url, entry.url, entry.src]
  for (const candidate of candidates) {
    const resolved = toCleanUrl(candidate)
    if (resolved) return resolved
  }
  return ''
}

export default function ProductDetail({ product, products = [] }) {
  const [selectedImage, setSelectedImage] = useState(0)
  const [showZoom, setShowZoom] = useState(false)
  const [cartStatus, setCartStatus] = useState('')
  const [wishlistStatus, setWishlistStatus] = useState('')
  const [manualProductDetails, setManualProductDetails] = useState(null)
  const [favorites, setFavorites] = useState([])
  const [productReviews, setProductReviews] = useState([])
  const { customerToken } = useCustomerAuth()

  const wishlistTarget = useMemo(() => resolveWishlistTarget(product), [product])
  const favoriteEntry = useMemo(
    () => findWishlistEntry(favorites, wishlistTarget),
    [favorites, wishlistTarget],
  )
  const isWishlisted = Boolean(favoriteEntry)

  useEffect(() => {
    let isActive = true
    setManualProductDetails(null)

    if (!product?.isManual) {
      return () => {
        isActive = false
      }
    }

    const manualId = String(product.originalData?.id || '').trim()
    if (!manualId) {
      return () => {
        isActive = false
      }
    }

    fetchManualProduct(manualId)
      .then((payload) => {
        if (isActive) {
          setManualProductDetails(payload || null)
        }
      })
      .catch(() => {
        if (isActive) {
          setManualProductDetails(null)
        }
      })

    return () => {
      isActive = false
    }
  }, [product])

  useEffect(() => {
    if (!customerToken) {
      setFavorites([])
      return
    }

    let isActive = true
    fetchCustomerFavorites()
      .then((items) => {
        if (!isActive) return
        setFavorites(Array.isArray(items) ? items : [])
      })
      .catch(() => {
        if (!isActive) return
        setFavorites([])
      })

    return () => {
      isActive = false
    }
  }, [customerToken])

  useEffect(() => {
    const resolvedProductType = product?.isManual ? 'manual' : 'etsy'
    const resolvedProductId = product?.isManual
      ? String(product?.originalData?.id || '').trim()
      : String(product?.id || '').trim()

    let isActive = true
    if (!resolvedProductId) {
      setProductReviews([])
      return () => {
        isActive = false
      }
    }

    fetchProductReviews({ product_type: resolvedProductType, product_id: resolvedProductId })
      .then((response) => {
        if (!isActive) return
        setProductReviews(Array.isArray(response) ? response : [])
      })
      .catch(() => {
        if (!isActive) return
        setProductReviews([])
      })

    return () => {
      isActive = false
    }
  }, [product])

  const itemReviewSummary = useMemo(() => {
    const total = productReviews.length
    if (total === 0) {
      return {
        total: 0,
        average: 0,
        breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      }
    }
    const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    let sum = 0
    productReviews.forEach((review) => {
      const rating = Math.max(1, Math.min(5, Number(review.rating) || 0))
      const bucket = Math.round(rating)
      breakdown[bucket] += 1
      sum += rating
    })
    return {
      total,
      average: sum / total,
      breakdown,
    }
  }, [productReviews])

  const latestProductReview = useMemo(() => {
    if (productReviews.length === 0) return null

    return [...productReviews].sort((a, b) => {
      const timeA = a?.created_at ? new Date(a.created_at).getTime() : 0
      const timeB = b?.created_at ? new Date(b.created_at).getTime() : 0
      return timeB - timeA
    })[0]
  }, [productReviews])

  const latestReviewPhoto = useMemo(() => {
    const imageUrl = String(latestProductReview?.product_image_url || '').trim()
    return imageUrl ? imageUrl : null
  }, [latestProductReview])

  const relatedProducts = useMemo(() => {
    if (!Array.isArray(products) || products.length === 0) return []

    const currentId = String(product?.id || '').trim()
    const candidates = products.filter((entry) => String(entry?.id || '').trim() !== currentId)
    if (candidates.length <= 3) return candidates

    const shuffled = [...candidates]
    for (let idx = shuffled.length - 1; idx > 0; idx -= 1) {
      const randomIdx = Math.floor(Math.random() * (idx + 1))
      const temp = shuffled[idx]
      shuffled[idx] = shuffled[randomIdx]
      shuffled[randomIdx] = temp
    }

    return shuffled.slice(0, 3)
  }, [products, product?.id])
  
  // Normalize media records from various API payload shapes and drop invalid URLs.
  const images = useMemo(() => {
    const sourceImages = manualProductDetails?.images?.length > 0
      ? manualProductDetails.images
      : product.originalData?.images?.length > 0
        ? product.originalData.images
        : Array.isArray(product.images) && product.images.length > 0
          ? product.images
          : []

    const normalized = sourceImages
      .map((entry) => {
        const mediaType = String(entry?.media_type || '').toLowerCase()
        const isVideo = mediaType === 'video'
        const mediaUrl = isVideo ? (resolveVideoUrl(entry) || resolveImageUrl(entry)) : resolveImageUrl(entry)
        if (!mediaUrl) return null

        return {
          ...(typeof entry === 'object' && entry ? entry : {}),
          image_url: mediaUrl,
          media_type: isVideo ? 'video' : 'image',
        }
      })
      .filter(Boolean)

    if (normalized.length > 0) {
      return normalized
    }

    const fallback = resolveImageUrl(product.image_url)
    return fallback ? [{ image_url: fallback, media_type: 'image' }] : []
  }, [product, manualProductDetails])

  const mainImage = images.length > 0 ? images[selectedImage]?.image_url || null : null
  const showThumbnails = images.length > 1

  useEffect(() => {
    if (images.length === 0) {
      setSelectedImage(0)
      return
    }

    if (selectedImage >= images.length) {
      setSelectedImage(0)
    }
  }, [images.length, selectedImage])
  
  const handleAddToCart = async () => {
    setCartStatus('')
    if (!customerToken) {
      setCartStatus('Sign in to add items to cart.')
      window.location.hash = '#/account/login'
      return
    }

    const isManual = Boolean(product.isManual)
    const resolvedProductId = isManual
      ? String(product.originalData?.id || '').trim()
      : String(product.id || '').trim()

    if (!resolvedProductId) {
      setCartStatus('Unable to add this product right now.')
      return
    }

    try {
      await addCustomerCartItem({
        product_type: isManual ? 'manual' : 'etsy',
        product_id: resolvedProductId,
        quantity: 1,
      })
      setCartStatus('Added to cart.')
      window.dispatchEvent(new Event('cart-updated'))
    } catch (error) {
      setCartStatus(error?.response?.data?.error || error.message || 'Unable to add to cart.')
    }
  }

  const handleAddToWishlist = async () => {
    setWishlistStatus('')
    if (!customerToken) {
      setWishlistStatus('Sign in to save items to your wishlist.')
      window.location.hash = '#/account/login'
      return
    }

    if (!wishlistTarget) {
      setWishlistStatus('Unable to save this item right now.')
      return
    }

    if (isWishlisted) {
      setWishlistStatus('Already in your wishlist.')
      return
    }

    try {
      await addCustomerFavorite(wishlistTarget)
      setFavorites((prev) => [{ ...wishlistTarget, id: `temp-${Date.now()}` }, ...prev])
      setWishlistStatus('Added to wishlist.')
      window.dispatchEvent(new Event('wishlist-updated'))
    } catch (error) {
      setWishlistStatus(error?.response?.data?.error || error.message || 'Unable to add to wishlist.')
    }
  }

  const handleToggleFavorite = async () => {
    setWishlistStatus('')
    if (!customerToken) {
      setWishlistStatus('Sign in to save items to your wishlist.')
      window.location.hash = '#/account/login'
      return
    }

    if (!wishlistTarget) {
      setWishlistStatus('Unable to save this item right now.')
      return
    }

    try {
      if (isWishlisted) {
        if (favoriteEntry?.id) {
          await removeCustomerFavorite(favoriteEntry.id)
          setFavorites((prev) => prev.filter((entry) => entry.id !== favoriteEntry.id))
        } else {
          setFavorites((prev) => prev.filter((entry) => !findWishlistEntry([entry], wishlistTarget)))
        }
        setWishlistStatus('Removed from wishlist.')
      } else {
        await addCustomerFavorite(wishlistTarget)
        setFavorites((prev) => [{ ...wishlistTarget, id: `temp-${Date.now()}` }, ...prev])
        setWishlistStatus('Added to wishlist.')
      }
      window.dispatchEvent(new Event('wishlist-updated'))
    } catch (error) {
      setWishlistStatus(error?.response?.data?.error || error.message || 'Unable to update wishlist.')
    }
  }

  // Handle keyboard navigation in zoom mode
  useEffect(() => {
    if (!showZoom) return

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setShowZoom(false)
      } else if (e.key === 'ArrowLeft') {
        setSelectedImage((prev) => (prev > 0 ? prev - 1 : images.length - 1))
      } else if (e.key === 'ArrowRight') {
        setSelectedImage((prev) => (prev < images.length - 1 ? prev + 1 : 0))
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showZoom, images.length])

  const handlePrevImage = () => {
    setSelectedImage((prev) => (prev > 0 ? prev - 1 : images.length - 1))
  }

  const handleNextImage = () => {
    setSelectedImage((prev) => (prev < images.length - 1 ? prev + 1 : 0))
  }

  // Calculate discount if there's an old price
  const hasDiscount = product.old_price && product.old_price > product.price_amount
  const discountPercent = hasDiscount 
    ? Math.round(((product.old_price - product.price_amount) / product.old_price) * 100)
    : 0

  return (
    <div className="product-detail">
      <div className="product-detail-container">
        {/* Product Images Section */}
        <div className="product-images-section">
          {/* Image thumbnails on the left (if multiple images exist) */}
          {showThumbnails && (
            <div className="image-thumbnails">
              {images.map((img, idx) => (
                <button
                  key={idx}
                  className={`thumbnail ${idx === selectedImage ? 'active' : ''}`}
                  onClick={() => setSelectedImage(idx)}
                >
                  {img.media_type === 'video' ? (
                    <video src={img.image_url} muted playsInline className="thumbnail-video" />
                  ) : (
                    <img src={img.image_url} alt={`${product.title} ${idx + 1}`} />
                  )}
                </button>
              ))}
            </div>
          )}
          
          {/* Main image on the right */}
          <div 
            className={`main-image-container ${showThumbnails ? 'with-thumbnails' : 'single-image'}`}
            onClick={() => setShowZoom(true)}
            style={{ cursor: 'zoom-in' }}
          >
            {mainImage ? (
              images[selectedImage]?.media_type === 'video' ? (
                <video src={mainImage} controls className="main-image" />
              ) : (
                <img src={mainImage} alt={product.title} className="main-image" />
              )
            ) : (
              <div className="image-placeholder">No image available</div>
            )}
          </div>
        </div>

        {/* Product Info Section */}
        <div className="product-info-section">
          {/* Shop info */}
          <div className="shop-info">
            <a href="/#/product" className="shop-link">SGCG Art Glass</a>
            <span className="separator">•</span>
            <a href="/#/product" className="reviews-link">Excellent (2.8k reviews)</a>
          </div>

          {/* Title */}
          <h1 className="product-title">{product.title || 'Product title'}</h1>

          {/* Pricing Section */}
          <div className="pricing-section">
            <div className="price-info">
              <span className="current-price">${product.price_amount || '0'}</span>
              {hasDiscount && (
                <>
                  <span className="old-price">${product.old_price}</span>
                  <span className="discount-badge">{discountPercent}% off</span>
                </>
              )}
            </div>
            {product.price_currency && product.price_currency !== 'USD' && (
              <div className="currency-note">Prices shown in USD</div>
            )}
          </div>

          {/* Product Description */}
          <div className="description-section">
            <h3>Description</h3>
            <p>{product.description || 'No description available'}</p>
          </div>

          {/* Product Details */}
          <div className="details-section">
            <h3>Details</h3>
            <ul>
              {product.category && (
                <li>
                  <strong>Category:</strong> {product.category}
                </li>
              )}
              {product.created_at && (
                <li>
                  <strong>Listed:</strong> {new Date(product.created_at).toLocaleDateString()}
                </li>
              )}
              {product.is_featured && (
                <li>
                  <strong>Status:</strong> Featured item
                </li>
              )}
              {product.free_shipping && (
                <li>
                  <strong>Shipping:</strong> Free shipping available
                </li>
              )}
            </ul>
          </div>

          {/* Quantity & Add to Cart */}
          <div className="purchase-section">
            
            <button className="add-to-cart-btn" onClick={handleAddToCart}>
              Add to cart
            </button>
            <button className="wishlist-btn" onClick={handleAddToWishlist}>
              {isWishlisted ? 'In wishlist' : 'Add to wishlist'}
            </button>
            <button
              className={`favorite-btn ${isWishlisted ? 'active' : ''}`}
              onClick={handleToggleFavorite}
              title={isWishlisted ? 'Remove from favorites' : 'Add to favorites'}
              aria-label={isWishlisted ? 'Remove from favorites' : 'Add to favorites'}
              aria-pressed={isWishlisted}
            >
              {isWishlisted ? '♥' : '♡'}
            </button>
          </div>
          {cartStatus && <p className="currency-note">{cartStatus}</p>}
          {wishlistStatus && <p className="currency-note">{wishlistStatus}</p>}

          {/* Shop Policies */}
          <div className="shop-policies">
            <h3>Shop policies</h3>
            <div className="policy-item">
              <span className="policy-icon">📦</span>
              <div>
                <strong>Free shipping on orders over $50</strong>
                <p>Ships from United States</p>
              </div>
            </div>
            <div className="policy-item">
              <span className="policy-icon">↩️</span>
              <div>
                <strong>45-day returns</strong>
                <p>Buyers are responsible for return shipping</p>
              </div>
            </div>
            <div className="policy-item">
              <span className="policy-icon">✓</span>
              <div>
                <strong>Shop is protected by Buyer Protection</strong>
                <p>Learn more</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Related Products Section */}
      <div className="related-section">
        <h2>Reviews for this item ({itemReviewSummary.total})</h2>
        {itemReviewSummary.total === 0 ? (
          <p className="related-placeholder">No reviews for this item yet.</p>
        ) : (
          <>
            <section className="detail-review-summary-card">
              <div className="detail-review-summary-average-wrap">
                <p className="detail-review-summary-average">{itemReviewSummary.average.toFixed(1)}/5</p>
                <p className="detail-review-summary-count">item average</p>
              </div>
              <div className="detail-review-summary-breakdown">
                {[5, 4, 3, 2, 1].map((star) => {
                  const count = itemReviewSummary.breakdown[star]
                  const percentage = itemReviewSummary.total > 0
                    ? Math.round((count / itemReviewSummary.total) * 100)
                    : 0
                  return (
                    <div key={star} className="detail-review-breakdown-row">
                      <span>{star} star</span>
                      <div className="detail-review-breakdown-bar">
                        <span style={{ width: `${percentage}%` }} />
                      </div>
                      <span>{percentage}%</span>
                    </div>
                  )
                })}
              </div>
            </section>

            {latestProductReview ? (
              <div className="detail-review-list">
                <article key={latestProductReview.id} className="detail-review-list-card">
                  <div className="detail-review-list-head">
                    <p className="detail-review-stars">{renderStars(latestProductReview.rating)} <span>{Number(latestProductReview.rating || 0)}/5</span></p>
                    {(Number(latestProductReview.rating) || 0) >= 4 ? <p className="detail-review-recommends">✓ Recommends</p> : null}
                  </div>
                  <div className="detail-review-list-meta">
                    <strong>{(latestProductReview.first_name || '').trim()} {(latestProductReview.last_name || '').trim()}</strong>
                    {latestProductReview.created_at ? <span>{formatReviewDate(latestProductReview.created_at)}</span> : null}
                  </div>
                  <div className="detail-review-list-body-row">
                    <div>
                      <p className="detail-review-title">{latestProductReview.title || 'Customer review'}</p>
                      <p className="detail-review-body">{latestProductReview.body || ''}</p>
                    </div>
                    {latestProductReview.product_image_url ? (
                      <img
                        src={latestProductReview.product_image_url}
                        alt={latestProductReview.product_title || latestProductReview.title || 'Reviewed item'}
                        className="detail-review-inline-image"
                      />
                    ) : null}
                  </div>
                </article>
              </div>
            ) : null}

            {latestReviewPhoto ? (
              <section className="detail-review-photos-section">
                <h3>Photos from reviews</h3>
                <div className="detail-review-photos-strip">
                  <img
                    src={latestReviewPhoto}
                    alt={latestProductReview?.product_title || latestProductReview?.title || 'Review photo'}
                  />
                </div>
              </section>
            ) : null}
          </>
        )}
        <h2>More from this shop</h2>
        {relatedProducts.length === 0 ? (
          <p className="related-placeholder">No related products available right now.</p>
        ) : (
          <div className="related-products-grid" aria-label="More items from this shop">
            {relatedProducts.map((relatedProduct) => (
              <ProductCard key={`related-${relatedProduct.id}`} product={relatedProduct} />
            ))}
          </div>
        )}
      </div>

      {/* Image Zoom Modal */}
      {showZoom && (
        <div className="zoom-modal" onClick={() => setShowZoom(false)}>
          <button className="zoom-close" onClick={() => setShowZoom(false)}>
            ×
          </button>

          {/* Main zoomed image */}
          <div className="zoom-content" onClick={(e) => e.stopPropagation()}>
            <div className="zoom-main-image">
              {mainImage && (
                images[selectedImage].media_type === 'video' ? (
                  <video src={mainImage} controls className="zoomed-image" />
                ) : (
                  <img src={mainImage} alt={product.title} className="zoomed-image" />
                )
              )}
            </div>

            {/* Navigation arrows */}
            {images.length > 1 && (
              <>
                <button className="zoom-arrow zoom-arrow-left" onClick={handlePrevImage}>
                  ‹
                </button>
                <button className="zoom-arrow zoom-arrow-right" onClick={handleNextImage}>
                  ›
                </button>
              </>
            )}
          </div>

          {/* Thumbnail strip on the right */}
          {images.length > 1 && (
            <div className="zoom-thumbnails">
              {images.map((img, idx) => (
                <button
                  key={idx}
                  className={`zoom-thumbnail ${idx === selectedImage ? 'active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedImage(idx)
                  }}
                >
                  {img.media_type === 'video' ? (
                    <video src={img.image_url} className="zoom-thumb-image" />
                  ) : (
                    <img src={img.image_url} alt={`Thumbnail ${idx + 1}`} className="zoom-thumb-image" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
