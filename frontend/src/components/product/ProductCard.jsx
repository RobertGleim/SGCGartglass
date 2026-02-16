import '../../styles/ProductCard.css'

export default function ProductCard({ product }) {
  // Calculate discount if there's an old price
  const hasDiscount = product.old_price && product.old_price > product.price_amount
  const discountPercent = hasDiscount 
    ? Math.round(((product.old_price - product.price_amount) / product.old_price) * 100)
    : 0

  return (
    <a href={`#/product/${product.id}`} className="product-card-link">
      <article className="product-card">
        <div className="card-image">
          {product.image_url ? (
            <img src={product.image_url} alt={product.title || 'Glass art'} />
          ) : (
            <div className="image-placeholder">No image</div>
          )}
        </div>
        <div className="card-body">
          <h3 className="card-title">{product.title || 'Untitled piece'}</h3>
          <div className="card-pricing">
            <div className="price-row">
              <span className="price">
                ${product.price_amount || '0'}
              </span>
              {hasDiscount && (
                <>
                  <span className="old-price">${product.old_price}</span>
                  <span className="discount">({discountPercent}% off)</span>
                </>
              )}
            </div>
            {product.free_shipping && (
              <span className="free-shipping">FREE shipping</span>
            )}
          </div>
        </div>
      </article>
    </a>
  )
}
