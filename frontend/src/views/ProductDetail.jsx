import { useState } from 'react'
import '../styles/ProductDetail.css'

export default function ProductDetail({ product }) {
  const [selectedImage, setSelectedImage] = useState(0)
  
  const handleAddToCart = () => {
    // TODO: Implement add to cart logic
    console.log('Added to cart:', product)
  }

  // Calculate discount if there's an old price
  const hasDiscount = product.old_price && product.old_price > product.price_amount
  const discountPercent = hasDiscount 
    ? Math.round(((product.old_price - product.price_amount) / product.old_price) * 100)
    : 0

  // For now, assume single image; in future could support image arrays
  const images = product.images || (product.image_url ? [{ image_url: product.image_url }] : [])
  const mainImage = images.length > 0 ? images[selectedImage].image_url : null

 

  return (
    <div className="product-detail">
      <div className="product-detail-container">
        {/* Product Images Section */}
        <div className="product-images-section">
          <div className="main-image-container">
            {mainImage ? (
              <img src={mainImage} alt={product.title} className="main-image" />
            ) : (
              <div className="image-placeholder">No image available</div>
            )}
          </div>

          {/* Image thumbnails (if multiple images exist) */}
          {images.length > 1 && (
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
    </div>
  )
}
