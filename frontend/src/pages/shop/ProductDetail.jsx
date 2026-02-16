import { useState, useEffect, useMemo } from 'react'
import '../../styles/ProductDetail.css'

export default function ProductDetail({ product }) {
  const [selectedImage, setSelectedImage] = useState(0)
  const [showZoom, setShowZoom] = useState(false)
  
  // Get images from originalData (for manual products) or use image_url
  const images = useMemo(() => {
    if (product.originalData?.images && product.originalData.images.length > 0) {
      return product.originalData.images
    } else if (product.images && product.images.length > 0) {
      return product.images
    } else if (product.image_url) {
      return [{ image_url: product.image_url }]
    }
    return []
  }, [product])

  const mainImage = images.length > 0 ? images[selectedImage].image_url : null
  const showThumbnails = images.length > 1
  
  const handleAddToCart = () => {
    // TODO: Implement add to cart logic
    console.log('Added to cart:', product)
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
            <a href="/shop" className="shop-link">SGCG Art Glass</a>
            <span className="separator">•</span>
            <a href="/shop/reviews" className="reviews-link">Excellent (2.8k reviews)</a>
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
            <button className="favorite-btn" title="Add to favorites">
              ♡
            </button>
          </div>

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
