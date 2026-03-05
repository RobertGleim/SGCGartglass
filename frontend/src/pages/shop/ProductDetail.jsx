import { useState, useEffect, useMemo } from 'react'
import '../../styles/ProductDetail.css'
import useCustomerAuth from '../../hooks/useCustomerAuth'
import {
  addCustomerCartItem,
  addCustomerFavorite,
  fetchCustomerFavorites,
  fetchManualProduct,
  removeCustomerFavorite,
} from '../../services/api'
import { findWishlistEntry, resolveWishlistTarget } from '../../utils/wishlist'

export default function ProductDetail({ product }) {
  const [selectedImage, setSelectedImage] = useState(0)
  const [showZoom, setShowZoom] = useState(false)
  const [cartStatus, setCartStatus] = useState('')
  const [wishlistStatus, setWishlistStatus] = useState('')
  const [manualProductDetails, setManualProductDetails] = useState(null)
  const [favorites, setFavorites] = useState([])
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
  
  // Get images from originalData (for manual products) or use image_url
  const images = useMemo(() => {
    if (manualProductDetails?.images && manualProductDetails.images.length > 0) {
      return manualProductDetails.images
    }
    if (product.originalData?.images && product.originalData.images.length > 0) {
      return product.originalData.images
    } else if (product.images && product.images.length > 0) {
      return product.images
    } else if (product.image_url) {
      return [{ image_url: product.image_url }]
    }
    return []
  }, [product, manualProductDetails])

  const mainImage = images.length > 0 ? images[selectedImage].image_url : null
  const showThumbnails = images.length > 1
  
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
                  <img src={img.image_url} alt={`${product.title} ${idx + 1}`} />
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
              <img src={mainImage} alt={product.title} className="main-image" />
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
        <h2>More from this shop</h2>
        <p className="related-placeholder">Related products will appear here</p>
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
