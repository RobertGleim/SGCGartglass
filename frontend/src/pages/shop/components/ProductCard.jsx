import './ProductCard.css'

const toCategoryList = (category) => {
  if (Array.isArray(category)) return category
  if (typeof category === 'string' && category.trim().includes(',')) {
    return category
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
  }
  return category ? [category] : []
}

const normalizeCategory = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '')

export default function ProductCard({ product }) {
  // Calculate discount if there's an old price
  const hasDiscount = product.old_price && product.old_price > product.price_amount
  const discountPercent = hasDiscount 
    ? Math.round(((product.old_price - product.price_amount) / product.old_price) * 100)
    : 0
  const isDigitalDownload = product.is_digital_download === true
  const isPatternProduct = toCategoryList(product.category)
    .some((entry) => normalizeCategory(entry) === 'patterns' || normalizeCategory(entry) === 'pattern')
  const manualProductId = String(product?.originalData?.id || '').trim()
  const linkedPatternId = String(product?.originalData?.related_links?.pattern_product_id || '').trim()
  const hasLinkedPattern = !isDigitalDownload
    && !isPatternProduct
    && Boolean(linkedPatternId)
    && (!manualProductId || linkedPatternId !== manualProductId)
  const shouldShowInstantDownload = isDigitalDownload || isPatternProduct

  return (
    <a href={`#/product/${product.id}`} className="product-card-link">
      <article className="product-card">
        <div className="card-image">
          {hasDiscount && <span className="sale-badge">On Sale</span>}
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
              {hasDiscount ? (
                <>
                  <span className="sale-price">Sale price ${product.price_amount || '0'}</span>
                  <span className="regular-price">(reg ${product.old_price || '0'})</span>
                </>
              ) : (
                <span className="price">
                  ${product.price_amount || '0'}
                </span>
              )}
              {hasDiscount && (
                <>
                  <span className="discount">({discountPercent}% off)</span>
                </>
              )}
            </div>
            {product.free_shipping && (
              <span className="free-shipping">FREE shipping</span>
            )}
            {shouldShowInstantDownload && (
              <span className="instant-download-badge">Instant download</span>
            )}
            {hasLinkedPattern && (
              <span className="pattern-available-badge">Pattern available</span>
            )}
          </div>
        </div>
      </article>
    </a>
  )
}
